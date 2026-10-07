import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { dieGeometry, faceIndexForValue, lyingHeight, REST_YAW, restingQuaternion } from '../../../dice3d/dieGeometry';
import { makeDie, restImmediately, stepDie } from '../../../dice3d/dieMotion';
import { beginThrow, burstOf } from '../../../dice3d/throwChain';
import { STAGE_X, type Rng } from '../../../dice3d/dieTour';
import { throwRandom } from '../../../dice3d/throwSeed';
import { layoutDice, type DiceScene, type RestingFrame } from '../../../dice3d/diceScene';
import { loadDiceArtwork } from '../../../dice3d/dieArtwork';
import { stagePixelRatio, type DiceRenderer, type StageDie } from '../../../dice3d/DiceRenderer';
import { borrowStage, returnStage } from '../../../dice3d/stagePool';
import { getDomHost } from '../../../host/dom';
import { bank, burst, rattle, rollEnd, rollStart } from '../../../dice3d/audio/diceSounds';
import type { DiceCrit } from '../../../tools/diceCrit';
import type { ThrowStyle } from '../../../dice3d/diceDisplay';

export interface DiceStageHandle {
  /**
   * Cuts the throw short: every die goes straight to its resting pose. Returns
   * whether anything was still flying; a click on a settled roll means something else.
   */
  skip: () => boolean;
}

interface DiceStageProps {
  scene: DiceScene;
  /** Known before landing: the burst has to fire the moment the dice touch down. */
  crit: DiceCrit;
  onSettled: () => void;
  /** Throws without a sound, e.g. in the player window while the DM's window plays it. */
  muted: boolean;
  /**
   * How the throw plays out. A faster one runs the dice's clock faster, so
   * paths and sounds stay the same in less time; the afterglow keeps real time,
   * or the sparks would freeze mid-shower.
   */
  style: ThrowStyle;
  /** Set in a shrunk roll: the dice lie still, and the view frames them instead of the whole stage. */
  frame: RestingFrame | null;
  /**
   * Seeds the throw: every window showing the same roll (the DM's map, the
   * player window) throws the same dice the same way. The roll's id.
   */
  seed: string;
  /** For screen readers; the canvas itself has no text. */
  label: string;
  className?: string;
  ref?: React.Ref<DiceStageHandle>;
}

/** How long the light takes to swell once the dice lie. */
const GLEAM = 0.28;

/**
 * The longest the loop runs on after the dice came to rest: longer than the
 * longest spark of the high-crit burst. It stops as soon as the light has
 * swelled and the stage is still (`DiceRenderer.isStill`): an ordinary
 * landing's sparks are out after half of this. Without a renderer nobody can
 * tell, and it runs the whole time.
 */
const AFTERGLOW = 1.45;

/**
 * The stage: a canvas and a clock. The clock lives here, the maths in
 * `dice3d/`, which is why the throw can be tested without drawing a frame.
 * Without WebGL the canvas stays empty and the maths still runs. The loop stops
 * once every die rests and the stage is still, at the latest when the afterglow
 * ran out.
 */
export function DiceStage({ scene, crit, onSettled, muted, style, frame, seed, label, className, ref }: DiceStageProps): React.ReactElement {
  const { speed, maxWallHits } = style;
  const holderRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<DiceRenderer | null>(null);
  const diceRef = useRef<StageDie[]>([]);
  /** Each die's own randomness while it flies (its jolts), drawn from the seed like the rest of the throw. */
  const stepRandoms = useRef<Rng[]>([]);
  const frameRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const settledRef = useRef(false);
  /**
   * This throw's wheel: other rolls throw meanwhile, and only its own wheel is
   * this stage's to stop. 0 is no roll's number, so a stage that started none stops none.
   */
  const wheelRef = useRef(0);
  const reduced = useReducedMotion() === true;

  const settledCb = useRef(onSettled);
  useEffect(() => {
    settledCb.current = onSettled;
  });

  const { offsets, radius } = useMemo(() => layoutDice(scene.plan.length), [scene]);

  // The canvas belongs to the pool, not to this panel: a canvas whose context
  // was lost never gives a live one again, so contexts are lent and returned.
  // Declared first because effects run in declaration order.
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const lease = borrowStage(holder.ownerDocument);
    holder.appendChild(lease.canvas);
    rendererRef.current = lease.renderer;
    return (): void => {
      rendererRef.current = null;
      returnStage(lease);
    };
  }, []);

  useEffect(() => {
    const stage = rendererRef.current?.stage();
    diceRef.current = scene.plan.map((die, i) => ({
      anim: makeDie(throwRandom(seed, -1 - i), offsets[i], radius, stage, lyingHeight(dieGeometry(die.sides))),
      sides: die.sides,
      waits: die.follows !== undefined,
      burst: burstOf(scene.plan, i),
    }));
    stepRandoms.current = scene.plan.map((_, i) => throwRandom(seed, 1000 + i));
    rendererRef.current?.setPlan(scene.plan.map((die) => die.sides));
  }, [scene, offsets, radius, seed]);

  const paint = useCallback((): void => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const resting = diceRef.current.filter((die) => die.anim.phase === 'rest');
    const emphasis = resting.length === diceRef.current.length && resting.length > 0
      ? Math.min(1, Math.min(...resting.map((die) => die.anim.restFor)) / (GLEAM * speed))
      : 0;
    renderer.render(diceRef.current, emphasis, crit);
  }, [crit, speed]);

  /** One frame on. Returns whether anything is left to do. */
  const advance = useCallback((dt: number): boolean => {
    for (const [i, die] of diceRef.current.entries()) {
      const wasResting = die.anim.phase === 'rest';
      const wasWaiting = die.anim.delay > 0;
      stepDie(die.anim, dt * speed, stepRandoms.current[i] ?? Math.random);
      // A die thrown for an explosion sets the wheel running again, for its own flight.
      if (die.waits && wasWaiting && die.anim.delay <= 0 && !wasResting && !muted) {
        wheelRef.current = rollStart(die.anim.tour.duration / speed);
      }
      // Two events make a sound, not three: the rim cracks where it was hit
      // (panned across the stage) and the landing rattles. The floor stays
      // silent; while the die flies, the wheel owns the air.
      const hit = die.anim.impact;
      if (hit && !wasResting && !muted) {
        if (hit.kind === 'wall') bank(hit.strength, Math.max(-1, Math.min(1, hit.at[0] / STAGE_X)));
        else if (hit.kind === 'settle') {
          rattle();
          if (die.burst) burst(die.burst === 'low');
        }
      }
    }

    const allResting = diceRef.current.every((die) => die.anim.phase === 'rest');
    if (allResting && !settledRef.current) {
      settledRef.current = true;
      if (!muted) rollEnd(wheelRef.current);
      settledCb.current();
    }
    if (!allResting) return true;
    const rested = Math.min(...diceRef.current.map((die) => die.anim.restFor));
    if (rested < GLEAM * speed) return true;
    return rested < AFTERGLOW * speed && rendererRef.current?.isStill() !== true;
  }, [muted, speed]);

  const start = useCallback((): void => {
    const holder = holderRef.current;
    const win = holder ? getDomHost().ownerWindow(holder) : undefined;
    if (!win || frameRef.current !== null) return;
    lastRef.current = 0;
    const tick = (now: number): void => {
      const previous = lastRef.current;
      lastRef.current = now;
      // The first step is zero: between the request and the first frame lies
      // the whole setup, and the die would jump.
      const dt = previous === 0 ? 0 : Math.min(0.04, (now - previous) / 1000);
      const more = advance(dt);
      paint();
      frameRef.current = more ? win.requestAnimationFrame(tick) : null;
    };
    frameRef.current = win.requestAnimationFrame(tick);
  }, [advance, paint]);

  useImperativeHandle(ref, () => ({
    skip: (): boolean => {
      let flying = false;
      for (const die of diceRef.current) {
        if (die.anim.phase === 'rest') continue;
        restImmediately(die.anim, die.anim.target);
        flying = true;
      }
      if (flying) {
        paint();
        // Skipping means landing earlier, not landing silently: the skipped
        // flight never reports its touchdown, and the wheel must stop now.
        if (!muted) {
          rollEnd(wheelRef.current);
          rattle();
        }
      }
      return flying;
    },
  }), [paint, muted]);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const win = getDomHost().ownerWindow(holder);

    const measure = (): void => {
      // The holder's size: the canvas is at least as large and is clipped to
      // it (`DiceRenderer.setView`). Layout size, not the bounding box: the
      // panel enters with a scale transform, and a size measured then would
      // stay squashed.
      const width = Math.max(1, Math.round(holder.clientWidth || 240));
      const height = Math.max(1, Math.round(holder.clientHeight || 190));
      rendererRef.current?.setView(width, height, stagePixelRatio(win), 0.5, frame?.halfWidth);
      // The walls move with the holder. Resting dice take the new size; a die
      // in flight keeps the stage it was thrown on, or its path would jump.
      const stage = rendererRef.current?.stage();
      if (stage) {
        for (const die of diceRef.current) {
          if (die.anim.phase === 'rest') die.anim.stage = stage;
        }
      }
      paint();
    };

    measure();
    win.addEventListener('resize', measure);
    // The popout's own observer: an observer from another window never fires there.
    const Observer = (win as typeof window).ResizeObserver as typeof ResizeObserver | undefined;
    const observer = Observer ? new Observer(measure) : null;
    observer?.observe(holder);
    return (): void => {
      win.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [paint, frame]);

  // The numerals and card stock are images; until they load the die is blank
  // card. The faces repaint themselves when their artwork arrives
  // (`dieAssets`); a stage at rest shows them with one more frame.
  useEffect(() => {
    let alive = true;
    void loadDiceArtwork().then(() => {
      if (alive && frameRef.current === null) paint();
    });
    return (): void => {
      alive = false;
    };
  }, [paint]);

  useEffect(() => {
    const targets = diceRef.current.map((die, i) => {
      const geometry = dieGeometry(die.sides);
      // Each die lies turned a little differently, as thrown dice do; from the seed, like the rest of the throw.
      const yaw = (throwRandom(seed, 2000 + i)() * 2 - 1) * REST_YAW;
      return restingQuaternion(geometry, faceIndexForValue(geometry, scene.faces[i] ?? 1), yaw);
    });
    const anims = diceRef.current.map((die) => die.anim);
    if (reduced) anims.forEach((anim, i) => restImmediately(anim, targets[i]!));
    else beginThrow(anims, scene.plan, targets, (i) => throwRandom(seed, i), maxWallHits);
    settledRef.current = false;

    if (reduced) {
      paint();
      settledRef.current = true;
      // Reduced motion is not a silent roll: the die lies there, and what lies
      // there rattled first.
      if (!muted) rattle();
      settledCb.current();
      return;
    }
    // The wheel gets the real duration of this throw: the latest die decides.
    // A die thrown later for an explosion starts the wheel again (`advance`).
    const together = diceRef.current.filter((die) => !die.waits);
    if (!muted) wheelRef.current = rollStart(Math.max(...together.map((die) => die.anim.delay + die.anim.tour.duration)) / speed);
    start();
  }, [scene, reduced, muted, speed, maxWallHits, seed, start, paint]);

  useEffect(() => (): void => {
    const holder = holderRef.current;
    const win = holder ? getDomHost().ownerWindow(holder) : undefined;
    if (frameRef.current !== null) win?.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    // A panel closing mid-throw silences the wheel at once.
    if (!muted) rollEnd(wheelRef.current);
  }, [muted]);

  return <div ref={holderRef} role="img" aria-label={label} className={className} />;
}
