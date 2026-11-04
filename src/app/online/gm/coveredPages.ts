import { isRecord, parseBookCover, type GmMessage } from '../protocol/index.ts';
import type { Timers } from './companionTimers.ts';

export interface CoveredPagesPorts extends Timers {
  /** Sends through the live lane: to all, or to one player. */
  sendLive(body: GmMessage, key: string, to?: string): void;
  /** Whether the relay takes `sends` frames: only then do messages to some players cost no more frames than one to all. */
  batches(): boolean;
  /** The players connected now. */
  connected(): Iterable<string>;
  /** A page's book no longer covers its map: it is sent the marks as they are now. */
  uncovered(player: string): void;
}

/** The least time between two catch-ups of one page: a page flicking between screens asks for no more. */
export const CATCH_UP_MS = 1_000;

/**
 * The pages whose book covers their map (`book-cover`): they are left out of the table's marks
 * (pointers, lasers, measurements), which a covered map does not draw, and are sent the marks as
 * they stand once the map shows again, at most once per `CATCH_UP_MS` (a later one waits). Drags
 * still reach every page: a page that heard of a drag would otherwise give it up and draw the token
 * back where the list has it. Only where the relay takes batches: otherwise one message to all is
 * cheaper than one to each page left. What a GM is told of covers ends with its connection: a page
 * says it again with the whole book that follows a welcome.
 */
export class CoveredPages {
  private readonly covered = new Set<string>();
  /** When each page last caught up, and a catch-up waiting for its turn. */
  private readonly caughtUp = new Map<string, number>();
  private readonly waiting = new Map<string, number>();

  constructor(private readonly ports: CoveredPagesPorts) {}

  /** A player's message: true when it was a cover message, so nobody else reads it. */
  receive(from: string, body: unknown): boolean {
    if (!isRecord(body) || body.t !== 'book-cover') return false;
    // Without batches every page gets every marks message: there is nothing to leave out or catch up.
    if (!this.ports.batches()) return true;
    const message = parseBookCover(body);
    if (message?.covered === true) this.covered.add(from);
    else if (message !== null && this.covered.delete(from)) this.catchUp(from);
    return true;
  }

  /** A player left the table: they say again whether they are covered when they are back. */
  playerLeft(player: string): void {
    this.covered.delete(player);
    this.forget(player);
  }

  /** The GM reached the relay anew: no page is taken as covered until it says so again. */
  reset(): void {
    this.covered.clear();
    for (const timer of this.waiting.values()) this.ports.clearTimer(timer);
    this.waiting.clear();
    this.caughtUp.clear();
  }

  /** Sends a live message: marks to all to the pages the map shows on, anything else to whom it is for. */
  sendLive(body: GmMessage, key: string, to?: string): void {
    if (to !== undefined || this.covered.size === 0 || body.t !== 'marks' || !this.ports.batches()) return this.ports.sendLive(body, key, to);
    for (const player of this.ports.connected()) if (!this.covered.has(player)) this.ports.sendLive(body, key, player);
  }

  private catchUp(player: string): void {
    if (this.waiting.has(player)) return;
    const wait = (this.caughtUp.get(player) ?? Number.NEGATIVE_INFINITY) + CATCH_UP_MS - this.ports.now();
    if (wait <= 0) return this.caughtUpNow(player);
    this.waiting.set(player, this.ports.setTimer(() => {
      this.waiting.delete(player);
      // Covered again meanwhile: the next uncovering catches up.
      if (!this.covered.has(player)) this.caughtUpNow(player);
    }, wait));
  }

  private caughtUpNow(player: string): void {
    this.caughtUp.set(player, this.ports.now());
    this.ports.uncovered(player);
  }

  private forget(player: string): void {
    const timer = this.waiting.get(player);
    if (timer !== undefined) this.ports.clearTimer(timer);
    this.waiting.delete(player);
    this.caughtUp.delete(player);
  }
}
