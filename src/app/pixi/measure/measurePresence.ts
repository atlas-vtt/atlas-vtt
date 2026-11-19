import { PANEL_ENTER_MS, PANEL_EXIT_MS, prefersReducedMotion } from '../../utils/motion';
import { ValueTransition } from '../utils/ValueTransition';

/** How far a measurement is on the map: its opacity, and its size as a share of its own about where it starts. */
export interface Presence {
  readonly alpha: number;
  readonly grow: number;
}

/** Drawn in full. */
export const PRESENT: Presence = { alpha: 1, grow: 1 };

/**
 * A kept measurement comes onto the map as a panel opens: it fades in while it grows out of where
 * it starts, and it leaves the same way, quicker and over a shorter distance. A released
 * measurement that nobody keeps dissolves in place over `LIVE_DISSOLVE_MS`.
 */
export const MEASURE_MOTION = {
  enter: { ms: PANEL_ENTER_MS, from: { alpha: 0, grow: 0.9 } },
  exit: { ms: PANEL_EXIT_MS, to: { alpha: 0, grow: 0.96 } },
  /** A measurement being made shows its first drawing: its label fades in rather than appearing at once. */
  live: { ms: 120, from: { alpha: 0, grow: 1 } },
} as const;

/** The last part of a released measurement's time on the map, over which it dissolves. */
export const LIVE_DISSOLVE_MS = 360;

const lerp = (from: number, to: number, share: number): number => from + (to - from) * share;

/**
 * Moves one measurement's presence from wherever it is to another, eased with the motion token of
 * elements that enter and leave. A new move starts from where the last one stands, so a measurement
 * deleted while it still grows in turns and leaves without a jump. Reduced motion keeps the fade
 * and drops the growth.
 */
export class MeasurePresence {
  private now: Presence = PRESENT;
  private move: ValueTransition | null = null;

  constructor(private readonly apply: (presence: Presence) => void) {}

  /** Where it stands now. */
  get presence(): Presence {
    return this.now;
  }

  /** Whether it is on its way in or out. */
  get moving(): boolean {
    return this.move?.isRunning ?? false;
  }

  /** Comes in from `from` over `ms`. */
  enter(from: Presence = MEASURE_MOTION.enter.from, ms: number = MEASURE_MOTION.enter.ms): void {
    this.set(from);
    this.to(PRESENT, ms);
  }

  /** Leaves over `ms`; `done` runs once it is gone. */
  exit(done: () => void, ms: number = MEASURE_MOTION.exit.ms): void {
    this.to(MEASURE_MOTION.exit.to, ms, done);
  }

  /** Drawn in full at once: whatever was under way stops. */
  settle(): void {
    this.stop();
    if (this.now !== PRESENT) this.set(PRESENT);
  }

  stop(): void {
    this.move?.cancel();
    this.move = null;
  }

  private to(target: Presence, ms: number, done?: () => void): void {
    this.stop();
    const still = prefersReducedMotion(document.body);
    const goal: Presence = still ? { alpha: target.alpha, grow: 1 } : target;
    if (still && this.now.grow !== 1) this.set({ alpha: this.now.alpha, grow: 1 });
    const start = this.now;
    this.move = new ValueTransition(0, ms, (share) => this.set({ alpha: lerp(start.alpha, goal.alpha, share), grow: lerp(start.grow, goal.grow, share) }));
    this.move.animateTo(1, () => {
      this.move = null;
      if (goal.alpha === 1 && goal.grow === 1) this.now = PRESENT;
      done?.();
    });
  }

  private set(presence: Presence): void {
    this.now = presence;
    this.apply(presence);
  }
}
