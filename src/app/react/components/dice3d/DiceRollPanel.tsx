import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../../../../utils/cn';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { chainDepth, layoutDice, restingFrame, type DiceScene } from '../../../dice3d/diceScene';
import type { ThrowStyle } from '../../../dice3d/diceDisplay';
import { ratchet, reveal } from '../../../dice3d/audio/diceSounds';
import type { DiceRollResult } from '../../../types/diceTypes';
import type { RollSourcePresentation } from '../dice/diceSourcePresentation';
import { DiceStage, type DiceStageHandle } from './DiceStage';
import { DiceRollHeader } from './DiceRollHeader';
import { DiceRollEngraving } from './DiceRollEngraving';
import { DiceRollChip } from './DiceRollChip';
import { hasBreakdown, rollBreakdown, rollLabel } from './diceRollText';
import { useElementHeight } from './useElementHeight';

interface DiceRollPanelProps {
  result: DiceRollResult;
  /** Who the roll names; unset looks it up as the GM's window does. */
  presentation?: RollSourcePresentation | null | undefined;
  scene: DiceScene;
  /** A newer roll took the large place: carry on as a row. */
  compact: boolean;
  /** Fading out; removed after `LEAVE_MS`. */
  leaving: boolean;
  /** No sound, e.g. in the player window while the DM's window plays it. */
  muted: boolean;
  /** Speed and wall hits of the throw; the counter keeps pace, the linger stays. */
  style: ThrowStyle;
  onClose: () => void;
  onDone: () => void;
}

/** How long the total stays before the panel leaves on its own. */
const LINGER_MS = 3600;
/** A row leaves sooner: it showed its number and the next roll wants the place. */
const LINGER_COMPACT_MS = 2600;
/**
 * The ripcord: the panel leaves even if the dice never land, e.g. when the
 * frame loop sleeps in a hidden window. The longest real flight is about two
 * seconds, so the limit rescues and never cuts short.
 */
const LINGER_STUCK_MS = 9000;
/**
 * First the pips stand alone for a beat, then the counter clicks forward once
 * per modifier, visibly and audibly (`ratchet`). Adding at once would show a
 * number nobody can match to the dice.
 */
const TICK_DELAY_MS = 420;
const TICK_EVERY_MS = 260;
/** Close to the spring, so an invisible row never holds its place for long. */
const LEAVE_MS = 430;
const LEAVE_REDUCED_MS = 130;
/**
 * The morph between large and row: a spring, not a curtain. The panel's real
 * height is animated, never a scale: a scaled panel stretches its corners, its
 * border, its shadow and the dice on it.
 */
const MORPH = { type: 'spring', duration: 0.42, bounce: 0.16 } as const;

/**
 * How long the panel stays before it leaves on its own. `throws` is how many
 * throws follow one another: one, and one more for every die of the longest
 * chain of explosions, each of which the ripcord has to wait out.
 */
function lingerMs(landed: boolean, compact: boolean, throws: number): number {
  if (!landed) return LINGER_STUCK_MS * throws;
  return compact ? LINGER_COMPACT_MS : LINGER_MS;
}

/**
 * A roll as a call across the table, not a dialog: no backdrop, no focus trap,
 * nothing that catches clicks except the panel itself. The throw starts on its
 * own, shows the number and leaves. A click on the panel skips the flight, or
 * closes it once the dice lie.
 */
export function DiceRollPanel({ result, presentation, scene, compact: compactNow, leaving, muted, style, onClose, onDone }: DiceRollPanelProps): React.ReactElement {
  // A panel leaves at the size it had: a row displaced by a newer roll would
  // otherwise open up to full size while disappearing.
  const [leavingSize, setLeavingSize] = useState<boolean | null>(null);
  if (leaving && leavingSize === null) setLeavingSize(compactNow);
  const compact = leavingSize ?? compactNow;

  const [landed, setLanded] = useState(false);
  /** How many modifier steps have clicked in. */
  const [applied, setApplied] = useState(0);
  const reduced = useReducedMotion() === true;
  const stageRef = useRef<DiceStageHandle>(null);
  const [contentRef, contentHeight] = useElementHeight<HTMLDivElement>();
  const closeCb = useRef(onClose);
  const doneCb = useRef(onDone);
  useEffect(() => {
    closeCb.current = onClose;
    doneCb.current = onDone;
  });
  const close = useCallback((): void => closeCb.current(), []);

  // Atlas knows the modifier only as one sum, so it clicks in as one step.
  const stepCount = result.modifiers === 0 ? 0 : 1;

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => doneCb.current(), reduced ? LEAVE_REDUCED_MS : LEAVE_MS);
    return (): void => window.clearTimeout(timer);
  }, [leaving, reduced]);

  // Displaced means done: the dice lie down at once and nothing more sounds.
  const displaced = useRef(false);
  useEffect(() => {
    if (!compact && !leaving) return;
    displaced.current = true;
    stageRef.current?.skip();
  }, [compact, leaving]);

  // Reduced motion and rows show the full number at once: nobody watches the counter there.
  const instant = reduced || compact;
  const appliedSteps = instant ? stepCount : applied;

  useEffect(() => {
    if (!landed || instant || stepCount === 0) return;
    const timers = Array.from({ length: stepCount }, (_, i) => window.setTimeout(() => {
      setApplied(i + 1);
      if (!muted && !displaced.current) ratchet(i);
    }, (TICK_DELAY_MS + i * TICK_EVERY_MS) / style.speed));
    return (): void => timers.forEach((timer) => window.clearTimeout(timer));
  }, [landed, instant, stepCount, muted, style.speed]);

  const counted = appliedSteps >= stepCount ? result.total : result.total - result.modifiers;
  const shown = landed ? counted : null;

  // The clock runs from the start: if the dice never land, the ripcord pulls.
  useEffect(() => {
    if (leaving) return;
    const timer = window.setTimeout(close, lingerMs(landed, compact, 1 + chainDepth(scene.plan)));
    return (): void => window.clearTimeout(timer);
  }, [landed, compact, leaving, close, scene]);

  const tap = (): void => {
    if (stageRef.current?.skip()) return;
    close();
  };

  const crit = landed ? result.crit ?? null : null;
  const label = rollLabel(result);
  // The resting dice's field in a shrunk row, shaped like their layout.
  const field = useMemo(() => {
    const { offsets, radius } = layoutDice(scene.plan.length);
    return restingFrame(offsets, radius);
  }, [scene]);
  const breakdown = rollBreakdown(result, scene);
  const slotRem = 3.2 + (hasBreakdown(result, scene) ? 1.05 : 0);
  const exit = reduced ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.96 };
  const transition = reduced ? { duration: 0.12 } : MORPH;

  return (
    <motion.div
      layout="position"
      className={cn(
        'atlas-dice-roll',
        compact && 'atlas-dice-roll--compact',
        crit === 'high' && 'atlas-dice-roll--crit-success',
        crit === 'low' && 'atlas-dice-roll--crit-fail',
      )}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -28, scale: 0.92 }}
      animate={leaving ? exit : { opacity: 1, y: 0, scale: 1 }}
      transition={transition}
      onClick={tap}
    >
      <div className="atlas-dice-roll__sheet" style={{ '--atlas-dice-field-aspect': field.aspect } as React.CSSProperties}>
        {!compact && <DiceRollEngraving />}
        {/* The dish lies over the engraving: it is the shape of the surface, and a
            shadow falls on what is printed on it too. */}
        {!compact && <div className="atlas-dice-roll__dish" aria-hidden="true" />}

        {crit !== null && (
          <motion.div
            aria-hidden="true"
            className="atlas-dice-roll__glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          />
        )}

        {!compact && (
          <CloseButton
            className="atlas-dice-roll__close"
            aria-label="Hide roll"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
          />
        )}

        {/* The sheet is as tall as this clip, which follows its content's height. The
            clip gets no height before its content was measured, so the first one is
            the height it already has and only later ones are animated to. An
            animation from `auto` would start at the panel as it is drawn then,
            scaled down by its entrance, and jump to its size when the spring ends. */}
        <motion.div animate={contentHeight === null ? {} : { height: contentHeight }} transition={transition}>
          <div ref={contentRef} className="atlas-dice-roll__content">
            {compact ? (
              <div className="atlas-dice-roll__row">
                <DiceRollHeader result={result} presentation={presentation} label={label} />
                <span className="atlas-dice-roll__total atlas-dice-roll__total--row">{shown ?? result.formula}</span>
              </div>
            ) : (
              <>
                <div className="atlas-dice-roll__header">
                  <DiceRollHeader result={result} presentation={presentation} label={label} />
                </div>
                {/* Holds the height where the dice come to rest; they roll over the whole panel. */}
                <div className="atlas-dice-roll__floor" />
                <div className="atlas-dice-roll__slot" style={{ height: `${slotRem}rem` }}>
                  {shown !== null ? (
                    <>
                      <motion.span
                        className="atlas-dice-roll__total"
                        initial={reduced ? false : { opacity: 0, y: 10, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={reduced ? { duration: 0.12 } : { type: 'spring', duration: 0.55, bounce: 0.3 }}
                      >
                        {/* Every step its own key: the counter jumps, it does not cross-fade. */}
                        <motion.span
                          key={shown}
                          className="atlas-dice-roll__count"
                          initial={reduced || appliedSteps === 0 ? false : { scale: 1.22 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', duration: 0.34, bounce: 0.42 }}
                        >
                          {shown}
                        </motion.span>
                      </motion.span>
                      {breakdown !== null && (
                        <motion.span
                          className="atlas-dice-roll__breakdown"
                          initial={reduced ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3, delay: reduced ? 0 : 0.12 }}
                        >
                          {breakdown}
                        </motion.span>
                      )}
                    </>
                  ) : (
                    <motion.span
                      className="atlas-dice-roll__formula"
                      initial={reduced ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.16 }}
                    >
                      {result.formula}
                    </motion.span>
                  )}
                </div>
              </>
            )}
          </div>
        </motion.div>

        <DiceStage
          ref={stageRef}
          scene={scene}
          crit={result.crit ?? null}
          muted={muted}
          style={style}
          seed={result.id}
          frame={compact ? field : null}
          onSettled={() => {
            setLanded(true);
            // The verdict belongs to the roll being watched; a displaced one reports silently.
            if (!muted && !displaced.current) reveal(result.crit ?? null);
          }}
          label={shown === null ? `Rolling ${result.formula}` : `${label}: rolled ${shown}`}
          className="atlas-dice-roll__stage"
        />
      </div>

      {!compact && result.modifiers !== 0 && (
        <DiceRollChip amount={result.modifiers} applied={appliedSteps > 0} reduced={reduced} />
      )}
    </motion.div>
  );
}
