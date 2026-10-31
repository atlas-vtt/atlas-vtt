/** Requests in flight while no player is connected: the uplink is the GM's alone. */
export const IN_FLIGHT_ALONE = 4;
/**
 * Requests in flight while players are connected and their marks flow over the same uplink. One flow's
 * TCP window already keeps a home uplink busy; a second only doubles the queue the table's live frames
 * wait behind, and the keep-alive (every 30 s) sees that too late to help (`uploadPacing.test.ts`).
 */
export const IN_FLIGHT_WITH_PLAYERS = 1;
/** Requests in flight while the socket's keep-alive takes more than twice its resting time: the uplink is full. */
export const IN_FLIGHT_SLOW = 1;
/** How far back the resting round trip looks: the least of what the keep-alive took in that time. */
export const RESTING_WINDOW_MS = 5 * 60 * 1000;
/** The longest wait before a failed request is tried again. */
export const MAX_RETRY_MS = 60_000;
/** The first and the longest wait before an asset refused for room the store will make is offered again. */
export const ROOM_RETRY_MS = 5 * 60_000;
export const MAX_ROOM_RETRY_MS = 30 * 60_000;

/**
 * How many upload requests may be in flight: four while no player is connected, one while players are
 * (their marks and the table's frames share the GM's uplink), and one while the keep-alive's round trip
 * is more than twice its resting value, the sign of an uplink the uploads fill.
 */
export function inFlight(players: number, latencyMs: number | null, restingMs: number | null): number {
  if (players === 0) return IN_FLIGHT_ALONE;
  if (latencyMs !== null && restingMs !== null && latencyMs > 2 * Math.max(1, restingMs)) return IN_FLIGHT_SLOW;
  return IN_FLIGHT_WITH_PLAYERS;
}

/** The wait before the `failures`th try again: 1, 2, 4 … seconds, at most 60. */
export function retryMs(failures: number): number {
  return Math.min(MAX_RETRY_MS, 1000 * 2 ** Math.max(0, failures - 1));
}

/** The wait before the `refusals`th offer again of an asset the store had no room for yet: 5, 10, 20, then 30 minutes. */
export function roomRetryMs(refusals: number): number {
  return Math.min(MAX_ROOM_RETRY_MS, ROOM_RETRY_MS * 2 ** Math.max(0, refusals - 1));
}

/** The socket's resting round trip: the least the keep-alive took within `RESTING_WINDOW_MS`. */
export class RestingLatency {
  private samples: { readonly at: number; readonly ms: number }[] = [];
  private last: number | null = null;

  /** Notes the keep-alive's last round trip; the same value again is the same sample. */
  sample(ms: number | null, now: number): void {
    if (ms === null || ms === this.last) return;
    this.last = ms;
    this.samples = [...this.samples.filter((sample) => now - sample.at <= RESTING_WINDOW_MS), { at: now, ms }];
  }

  value(): number | null {
    return this.samples.length === 0 ? null : Math.min(...this.samples.map((sample) => sample.ms));
  }

  reset(): void {
    this.samples = [];
    this.last = null;
  }
}

/** How urgent a request is: its asset's rank (lower first), then how recently the asset was asked for (later first). */
export interface SlotPriority {
  readonly rank: number;
  readonly stamp: number;
}

interface Waiter {
  readonly priority: () => SlotPriority;
  /** The order it came in: of one asset, parts go in order. */
  readonly order: number;
  readonly grant: () => void;
}

/**
 * Turns for requests, as many at once as `limit` says now, given to the most urgent waiter first, by its
 * asset's priority as it is when a turn frees (presenting another scene puts its assets ahead of parts
 * of a video already waiting); a turn given back lets the next out. Closed, every waiter and every
 * later request is let through at once, for the caller to see that its work was stopped.
 */
export class Slots {
  private active = 0;
  private waiting: Waiter[] = [];
  private count = 0;
  private closed = false;

  constructor(private readonly limit: () => number) {}

  take(priority: () => SlotPriority = () => ({ rank: 0, stamp: 0 })): Promise<() => void> {
    return new Promise((resolve) => {
      if (this.closed) return resolve(() => undefined);
      this.waiting.push({ priority, order: (this.count += 1), grant: () => resolve(this.releaser()) });
      this.drain();
    });
  }

  /** Lets out whoever waits where the limit grew. */
  drain(): void {
    while (this.waiting.length > 0 && this.active < this.limit()) {
      const next = this.mostUrgent();
      this.waiting = this.waiting.filter((waiter) => waiter !== next);
      this.active += 1;
      next.grant();
    }
  }

  /** Lets every waiter through, and every later request at once. */
  close(): void {
    this.closed = true;
    const waiting = this.waiting;
    this.waiting = [];
    for (const waiter of waiting) waiter.grant();
  }

  get busy(): number {
    return this.active;
  }

  private mostUrgent(): Waiter {
    let best = this.waiting[0]!;
    let bestPriority = best.priority();
    for (const waiter of this.waiting.slice(1)) {
      const priority = waiter.priority();
      const before = priority.rank !== bestPriority.rank ? priority.rank < bestPriority.rank : priority.stamp !== bestPriority.stamp ? priority.stamp > bestPriority.stamp : waiter.order < best.order;
      if (before) {
        best = waiter;
        bestPriority = priority;
      }
    }
    return best;
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      // Given out once the holder had its chance to ask again: an upload asks for its next turn right after it gave one back, and the most urgent asker should win it.
      queueMicrotask(() => this.drain());
    };
  }
}
