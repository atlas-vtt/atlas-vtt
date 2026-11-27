import type { Timers } from '../gm/companionTimers.ts';
import type { TableStatus } from '../gm/TableConnection.ts';
import { expiredWhileAway, Restarts } from './gmScreenRestart.ts';
import { HeldMarks, type HeldMark, type HeldStore } from './heldMarks.ts';

function memoryStore(): HeldStore {
  let mark: HeldMark | null = null;
  return { read: () => mark, write: (next) => void (mark = next) };
}

/**
 * What lets the session start its room again by itself after the relay let it expire: when the relay
 * last held the room the connection reaches (`HeldMarks`), and the restarts under way (`Restarts`).
 * Only a room this computer was welcomed in and kept a mark for can be restarted, and only until a
 * Start, Stop or New link (`forget`).
 */
export class Comeback {
  private readonly restarts: Restarts;
  private readonly marks: HeldMarks;
  /** The print of the room the connection reaches (`roomPrint`), while one is open. */
  private print: string | null = null;

  constructor(timers: Timers, held: HeldStore | undefined, now: () => number) {
    this.restarts = new Restarts(timers);
    this.marks = new HeldMarks(held ?? memoryStore(), now);
  }

  /** A connection opens to the room `print`. */
  opened(print: string): void {
    this.print = print;
  }

  /** A frame of the relay came on the connection. */
  heard(): void {
    this.marks.heard();
  }

  /**
   * The connection's status changed. Where it was refused for good: when the relay last held the room,
   * if the room expired while Atlas was away and is to be started again, else null.
   */
  status(status: TableStatus, closeCode: number | null, whileOnline: boolean, now: number): number | null {
    if (status === 'online' && this.print !== null) {
      this.marks.welcomed(this.print);
      this.restarts.reset();
      return null;
    }
    this.marks.away();
    if (status !== 'refused') return null;
    const heldAt = this.restarts.heldAt() ?? (this.print === null ? undefined : this.marks.heldAt(this.print));
    return heldAt !== undefined && expiredWhileAway({ closeCode, whileOnline, heldAt, now }) ? heldAt : null;
  }

  /** Runs `restart` after the next restart's wait, for a room last held at `heldAt`; false once Atlas gave up. */
  restart(restart: () => void, heldAt: number): boolean {
    return this.restarts.restart(restart, heldAt);
  }

  /** Runs `ask` again once the relay may be reachable. */
  retry(ask: () => void): void {
    this.restarts.retry(ask);
  }

  /** The connection is let go of; the restarts under way go on only where it was let go of for one. */
  letGo(restarting: boolean): void {
    if (restarting) this.restarts.cancel();
    else this.restarts.reset();
    this.marks.away();
    this.print = null;
  }

  /** The GM started or stopped the room, or made a new link: nothing before it is started again. */
  forget(): void {
    this.letGo(false);
    this.marks.clear();
  }
}
