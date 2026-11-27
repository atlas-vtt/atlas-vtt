import { CLOSE } from '../protocol/index.ts';
import type { Timers } from '../gm/companionTimers.ts';
import { backoff } from '../gm/TableConnection.ts';

/** How long the relay keeps a room its host is away from (`TABLE_IDLE_MS` there). */
export const ROOM_IDLE_MS = 24 * 60 * 60 * 1000;

/** How often Atlas writes down that the relay still holds its room. */
export const HELD_MS = 5 * 60 * 1000;

/** Restarts in a row whose room ended before the relay welcomed Atlas, after which Atlas gives up. */
export const MAX_RESTARTS = 3;

/** How the room of a session the GM left running ended, as far as Atlas can see it. */
export interface RoomEnd {
  readonly closeCode: number | null;
  /** The relay had welcomed this connection: the room ended under its host. */
  readonly whileOnline: boolean;
  /** When Atlas last knew the relay held the room (`GmScreenRecord.heldAt`); undefined where it never knew. */
  readonly heldAt: number | undefined;
  readonly now: number;
}

/**
 * Whether the room expired while Atlas was away, so Atlas starts it again by itself. The relay closes a
 * coming-back host with `ended` for any room it no longer has, whether the room expired or was ended by
 * a start elsewhere, by staff or by a Stop elsewhere, and closes a live host with what ended the room
 * (`superseded`, `ended`, `noAccess`); a room taken at this code answers `badSecret`. Only one of these
 * leaves expiry possible: the room missing on coming back after at least the time the relay keeps a room
 * nobody hosts. Every other end was somebody's decision, and Atlas leaves it so.
 */
export function expiredWhileAway(end: RoomEnd): boolean {
  return end.closeCode === CLOSE.ended && !end.whileOnline && end.heldAt !== undefined && end.now - end.heldAt >= ROOM_IDLE_MS;
}

/**
 * The waits between restarts: the first at once, each one after a room that ended again before a welcome
 * longer, and none after `MAX_RESTARTS`; asking the relay again when it could not be reached waits as the
 * connection's own reconnects do. A welcome resets both.
 */
export class Restarts {
  private restarts = 0;
  private retries = 0;
  private timer: number | null = null;

  constructor(private readonly timers: Timers) {}

  /** Runs `restart` after the next restart's wait; false once Atlas gave up. */
  restart(restart: () => void): boolean {
    if (this.restarts >= MAX_RESTARTS) return false;
    this.schedule(restart, this.restarts === 0 ? 0 : backoff(this.restarts + 2));
    this.restarts += 1;
    return true;
  }

  /** Runs `ask` again once the relay may be reachable. */
  retry(ask: () => void): void {
    this.schedule(ask, backoff(this.retries));
    this.retries += 1;
  }

  /** The relay welcomed the room. */
  held(): void {
    this.restarts = 0;
    this.retries = 0;
  }

  cancel(): void {
    if (this.timer !== null) this.timers.clearTimer(this.timer);
    this.timer = null;
  }

  private schedule(run: () => void, ms: number): void {
    this.cancel();
    this.timer = this.timers.setTimer(() => {
      this.timer = null;
      run();
    }, ms);
  }
}

/**
 * Writes down, now and every `HELD_MS` while the relay holds the room, that it does. A computer that slept
 * runs its timers late, on waking and before the dead socket is noticed: a mark that comes late is no
 * evidence and is not written, and the clock waits for the next welcome. So the time since the last mark
 * is never shorter than the time the relay was without Atlas.
 */
export class HeldClock {
  private timer: number | null = null;

  constructor(private readonly timers: Timers, private readonly now: () => number, private readonly mark: (at: number) => void) {}

  hold(): void {
    this.release();
    const at = this.now();
    this.mark(at);
    this.timer = this.timers.setTimer(() => (this.now() - at > 2 * HELD_MS ? this.release() : this.hold()), HELD_MS);
  }

  release(): void {
    if (this.timer !== null) this.timers.clearTimer(this.timer);
    this.timer = null;
  }
}
