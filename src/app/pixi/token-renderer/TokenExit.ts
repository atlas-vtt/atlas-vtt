import type { Container, Ticker } from 'pixi.js';
import type { AnimationPlaybackControls } from 'framer-motion';
import { animateOnTicker } from '../utils/tickerMotion';
import { EASE_OUT_CONTROL_POINTS } from '../../utils/motion';
import type { LayerVisibility } from '../playerSafeFrame';

/** A removed token sinks to this share of its size as it fades. */
const EXIT_SCALE = 0.72;
const EXIT_DURATION_S = 0.26;
/** Reduced motion: a short fade in place, nothing moves. */
const REDUCED_DURATION_S = 0.15;
/** Tokens removed together leave as a ripple from their middle outward, one step apart... */
const STAGGER_STEP_S = 0.022;
/** ...but the last starts no later than this, however many go. */
const STAGGER_MAX_S = 0.16;

interface Leaving {
  animation: AnimationPlaybackControls;
  done: () => void;
}

export interface TokenExitDeps {
  /** The ticker the exits step on; without one a token goes at once. */
  getTicker(): Ticker | null;
  reducedMotion(): boolean;
  /** Draws a frame: every step changes what is shown. */
  requestRender(): void;
}

/**
 * Plays removed tokens out: each shrinks a little and fades, tokens removed together in a ripple
 * from their middle. A leaving group is already out of the renderer's tokens (no hit tests, no
 * syncs, no UI); `done` frees it once it has gone. Players never see one leave: the players'
 * picture has no sight for a token that is no longer in the scene, so it is hidden in their frames.
 */
export class TokenExit {
  private readonly leaving = new Map<Container, Leaving>();

  constructor(private readonly deps: TokenExitDeps) {}

  /** Plays `groups` out together; `done` is called for each once it has gone (at once without motion). */
  play<T extends Container>(groups: readonly T[], done: (group: T) => void): void {
    const ticker = this.deps.getTicker();
    if (!ticker) {
      for (const group of groups) done(group);
      return;
    }
    const reduced = this.deps.reducedMotion();
    const delays = reduced ? groups.map(() => 0) : rippleDelays(groups);
    groups.forEach((group, index) => {
      const alpha = group.alpha;
      const scaleX = group.scale.x;
      const scaleY = group.scale.y;
      const finish = (): void => {
        this.leaving.delete(group);
        done(group);
      };
      const animation = animateOnTicker(ticker, 0, 1, {
        duration: reduced ? REDUCED_DURATION_S : EXIT_DURATION_S,
        delay: delays[index] ?? 0,
        ease: [...EASE_OUT_CONTROL_POINTS],
        onUpdate: (progress) => {
          if (group.destroyed) return;
          group.alpha = alpha * (1 - progress);
          if (!reduced) {
            const shrink = 1 - (1 - EXIT_SCALE) * progress;
            group.scale.set(scaleX * shrink, scaleY * shrink);
          }
          this.deps.requestRender();
        },
        onComplete: finish,
      });
      this.leaving.set(group, { animation, done: finish });
    });
  }

  /** Hides every leaving token from the players' frame. */
  playerViewLayers(): LayerVisibility[] {
    return [...this.leaving.keys()].map((layer) => ({ layer, visible: false }));
  }

  /** Ends every exit at once, freeing its token: before a map load or teardown. */
  finishAll(): void {
    for (const { animation, done } of [...this.leaving.values()]) {
      animation.stop();
      done();
    }
  }
}

/** Start delays that ripple outward from the middle of `groups`, the nearest first. */
// ponytail: O(n²) ranking; fine for the few hundred tokens a scene holds, sort if bulk deletes grow past that
export function rippleDelays(groups: readonly Pick<Container, 'x' | 'y'>[]): number[] {
  if (groups.length < 2) return groups.map(() => 0);
  const cx = groups.reduce((sum, group) => sum + group.x, 0) / groups.length;
  const cy = groups.reduce((sum, group) => sum + group.y, 0) / groups.length;
  const distances = groups.map((group) => Math.hypot(group.x - cx, group.y - cy));
  const step = Math.min(STAGGER_STEP_S, STAGGER_MAX_S / (groups.length - 1));
  // A token's rank is how many lie nearer the middle (ties by order), so the nearest goes first
  return distances.map((distance, index) =>
    step * distances.filter((other, j) => other < distance || (other === distance && j < index)).length);
}
