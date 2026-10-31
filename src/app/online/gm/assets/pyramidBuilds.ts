import type { Timers } from '../companionTimers.ts';
import type { MapStanding } from './assetUses.ts';
import type { LivePyramid } from './livePyramid.ts';
import { retryMs } from './uploadPace.ts';

/** How a build ended: the image's hash, whether its pyramid is complete and how many of its tiles are stored; null where none can be built. */
export interface BuiltPyramid {
  readonly hash: string;
  readonly complete: boolean;
  readonly stored?: number;
}

/**
 * How often in a row a build may end incomplete without storing a tile more (it could not write the
 * cache, the worker stopped) before its pyramid is given up; one that gave way after storing tiles
 * starts the count again.
 */
export const MAX_BUILD_TRIES = 8;

const STANDING_ORDER: readonly MapStanding[] = ['presented', 'watched', 'rest', 'staged'];
/** Whether a build stored tiles since the last one ended; notes how many the cache holds now. */
function progressed(built: BuiltPyramid | 'stopped', wish: Wish): boolean {
  if (built === 'stopped' || built.stored === undefined || built.stored <= wish.stored) return false;
  wish.stored = built.stored;
  return true;
}

/** Maps players look at: their builds go before any other. */
const looked = (standing: MapStanding): boolean => standing === 'presented' || standing === 'watched';

interface Wish {
  tries: number;
  retryAt: number;
  /** The tiles stored when its last build ended. */
  stored: number;
  readonly order: number;
}

/**
 * The builds of the pyramids on their way into the store, one at a time in the order of who looks at
 * them (the presented floor first): a map players look at is built as soon as no other such map is,
 * one nobody looks at only while nothing else is being built, so it never takes the tile worker's time
 * from one somebody does. A build that ends incomplete is asked for again after 1, 2, 4 … seconds (a
 * later build resumes what was stored); one that cannot be made, or that names another image, gives
 * the pyramid up.
 */
export class PyramidBuilds {
  private readonly wishes = new Map<LivePyramid, Wish>();
  private readonly running = new Set<LivePyramid>();
  private count = 0;
  private timer: number | undefined;
  private stopped = false;

  constructor(private readonly ports: { build(path: string): Promise<BuiltPyramid | null>; readonly timers: Timers }) {}

  want(pyramid: LivePyramid): void {
    if (!this.wishes.has(pyramid)) this.wishes.set(pyramid, { tries: 0, retryAt: 0, stored: 0, order: (this.count += 1) });
    this.pump();
  }

  /** Takes a wish back; a build under way runs on in the worker. */
  drop(pyramid: LivePyramid): void {
    this.wishes.delete(pyramid);
  }

  /** Starts what may be built now: after a standing changed, too. */
  pump(): void {
    if (this.stopped) return;
    const now = this.ports.timers.now();
    const due = [...this.wishes].filter(([pyramid, wish]) => !this.running.has(pyramid) && wish.retryAt <= now)
      .sort(([a, wishA], [b, wishB]) => STANDING_ORDER.indexOf(a.standing) - STANDING_ORDER.indexOf(b.standing) || wishA.order - wishB.order);
    for (const [pyramid] of due) {
      const lookedRunning = [...this.running].some((running) => looked(running.standing));
      if (!lookedRunning && (looked(pyramid.standing) || this.running.size === 0)) void this.run(pyramid);
    }
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    this.wishes.clear();
    if (this.timer !== undefined) this.ports.timers.clearTimer(this.timer);
    this.timer = undefined;
  }

  private async run(pyramid: LivePyramid): Promise<void> {
    this.running.add(pyramid);
    let built: BuiltPyramid | null | 'stopped';
    try {
      built = await this.ports.build(pyramid.path);
    } catch {
      built = 'stopped';
    }
    this.running.delete(pyramid);
    const wish = this.wishes.get(pyramid);
    if (wish !== undefined && !this.stopped) {
      if (built === null || (built !== 'stopped' && built.hash !== pyramid.hash)) {
        this.wishes.delete(pyramid);
        pyramid.fail();
      } else if (built !== 'stopped' && built.complete) {
        this.wishes.delete(pyramid);
      } else if ((wish.tries = progressed(built, wish) ? 1 : wish.tries + 1) >= MAX_BUILD_TRIES) {
        this.wishes.delete(pyramid);
        pyramid.fail();
      } else {
        wish.retryAt = this.ports.timers.now() + retryMs(wish.tries);
      }
    }
    this.pump();
  }

  /** Looks again when the next wish that waits out a retry falls due. */
  private schedule(): void {
    if (this.timer !== undefined) this.ports.timers.clearTimer(this.timer);
    this.timer = undefined;
    const waits = [...this.wishes].filter(([pyramid]) => !this.running.has(pyramid)).map(([, wish]) => wish.retryAt - this.ports.timers.now()).filter((ms) => ms > 0);
    if (waits.length === 0) return;
    this.timer = this.ports.timers.setTimer(() => {
      this.timer = undefined;
      this.pump();
    }, Math.min(...waits));
  }
}
