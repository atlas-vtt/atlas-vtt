import type { Point } from '../../types/visionTypes';
import { prefersReducedMotion } from '../../utils/motion';
import { ValueTransition } from '../utils/ValueTransition';
import { MEASURE_MOTION } from './measurePresence';

const lerp = (from: number, to: number, share: number): number => from + (to - from) * share;

/** Whether `from` can become `to` point by point: the same number of points, and somewhere one of them differs. */
export function morphs(from: readonly Point[], to: readonly Point[]): boolean {
  return from.length === to.length && from.some((point, index) => point.x !== to[index]!.x || point.y !== to[index]!.y);
}

/**
 * Carries a measurement from the points it showed to the points it has now, each point on a
 * straight way, eased as a measurement enters: an undo that moves, resizes or turns a measurement,
 * or another person's edit, shows the way it went instead of a jump. `draw` is handed the points to
 * draw at every frame, the last time exactly the points it ends at. A new move starts from where the
 * last one stands. Reduced motion draws the end at once.
 */
export class MeasureMorph {
  private move: ValueTransition | null = null;
  private shown: readonly Point[] | null = null;

  constructor(private readonly draw: (points: readonly Point[]) => void) {}

  /** The points drawn now while it moves; null while it stands where its measurement is. */
  get points(): readonly Point[] | null {
    return this.move ? this.shown : null;
  }

  /** Moves from `from` to `to`; false, with nothing drawn, where the two cannot morph (`morphs`) or motion is reduced. */
  start(from: readonly Point[], to: readonly Point[], ms: number = MEASURE_MOTION.enter.ms): boolean {
    this.stop();
    if (!morphs(from, to) || prefersReducedMotion(document.body)) return false;
    const start = from.map(({ x, y }) => ({ x, y }));
    const end = to.map(({ x, y }) => ({ x, y }));
    this.shown = start;
    this.move = new ValueTransition(0, ms, (share) => {
      this.shown = share >= 1 ? end : start.map((point, index) => ({ x: lerp(point.x, end[index]!.x, share), y: lerp(point.y, end[index]!.y, share) }));
      this.draw(this.shown);
    });
    this.draw(start);
    this.move.animateTo(1, () => {
      this.move = null;
      this.shown = null;
    });
    return true;
  }

  stop(): void {
    this.move?.cancel();
    this.move = null;
    this.shown = null;
  }
}
