import { MAX_SWEEP_POINTS, type DrawRefusal, type PlayerDrawErase } from '../protocol/index.ts';
import { AnnotationIndex } from '../../annotations/annotationHit';
import type { Annotation } from '../../annotations/annotationTypes';
import { eraserRadius } from '../../annotations/drawSizes';
import { sweepChange, type SweepChange } from '../../annotations/eraseSweep';
import { sweepCost } from './drawCost.ts';
import { allNearEdge, ERASE_COST_BUDGET, ERASE_PAUSE_MS, ERASE_SLOW_MS, eraseRate, pointsOf } from './drawCheck.ts';
import type { MapSize, MoveRate } from './moveCheck.ts';

/** What an erasing comes to: refused, or what its sweep cuts (null where it reaches nothing). */
export type Erasing = { readonly refused: DrawRefusal } | { readonly change: SweepChange | null };

/**
 * A player's eraser, as the GM lets it cut. Cutting is the dearest thing a page can ask for: the
 * sweep is tried against every stretch of every drawing it may reach, and nothing of that is
 * counted anywhere when it cuts nothing. So an erasing is held four ways before and after it:
 *
 * - a rate of its own (`ERASE_BURST`, `ERASES_PER_SECOND`), which a refused one and one that
 *   cuts nothing take from like any other;
 * - a sweep of at most `MAX_SWEEP_POINTS` points, on the map;
 * - a cost worked out before any cutting (`sweepCost`), within `ERASE_COST_BUDGET` (refused as
 *   too much at once, like a request over its rate);
 * - a clock around the cut itself: one that still took longer than `ERASE_SLOW_MS` pauses its
 *   sender's erasing for `ERASE_PAUSE_MS`.
 *
 * The sweep is run over the sender's own drawings and texts alone (`own`): nothing else can be
 * reached by it.
 */
export class PlayerErasing {
  private readonly rate: MoveRate = eraseRate();
  /** Until when each player's erasing is paused. */
  private readonly paused = new Map<string, number>();

  constructor(private readonly now: () => number) {}

  cut(from: string, message: PlayerDrawErase, own: readonly Annotation[], cell: number, map: MapSize | null): Erasing {
    const now = this.now();
    if (!this.rate.take(from, now)) return { refused: 'rate' };
    if (now < (this.paused.get(from) ?? Number.NEGATIVE_INFINITY)) return { refused: 'busy' };
    const points = pointsOf(message.pts);
    if (points.length > MAX_SWEEP_POINTS) return { refused: 'shape' };
    if (!allNearEdge(points, map, cell)) return { refused: 'place' };
    const radius = eraserRadius(message.size, cell);
    // Too much at once: a shorter sweep, or one over fewer drawings, is taken.
    if (sweepCost(own, points, radius) > ERASE_COST_BUDGET) return { refused: 'rate' };
    const change = sweepChange(new AnnotationIndex(own), { points, radius }, message.whole === true);
    if (this.now() - now > ERASE_SLOW_MS) this.paused.set(from, this.now() + ERASE_PAUSE_MS);
    return { change };
  }

  playerLeft(player: string): void {
    this.paused.delete(player);
  }

  clear(): void {
    this.paused.clear();
  }
}
