import { isRecord, parseBookCover } from '../protocol/index.ts';
import type { Timers } from './companionTimers.ts';

/** The pages live marks leave out, which `SceneRoutes` reads: a message to all then reaches each page connected but those. */
export interface PageCovers {
  /** The pages whose book covers their map now. */
  covered(): ReadonlySet<string>;
  /** The players connected now. */
  connected(): Iterable<string>;
}

export interface CoveredPagesPorts extends Timers {
  /** Whether the relay takes `sends` frames: only then do messages to some players cost no more frames than one to all. */
  batches(): boolean;
  /** The players connected now. */
  connected(): Iterable<string>;
  /** A page's book no longer covers its map: it is sent the marks as they are now. */
  uncovered(player: string): void;
}

const NONE: ReadonlySet<string> = new Set();

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
export class CoveredPages implements PageCovers {
  private readonly pages = new Set<string>();
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
    if (message?.covered === true) this.pages.add(from);
    else if (message !== null && this.pages.delete(from)) this.catchUp(from);
    return true;
  }

  /** A player left the table: they say again whether they are covered when they are back. */
  playerLeft(player: string): void {
    this.pages.delete(player);
    this.forget(player);
  }

  /** The GM reached the relay anew: no page is taken as covered until it says so again. */
  reset(): void {
    this.pages.clear();
    for (const timer of this.waiting.values()) this.ports.clearTimer(timer);
    this.waiting.clear();
    this.caughtUp.clear();
  }

  /** The pages whose book covers their map; none where the relay takes no batches, where one message to all is cheaper. */
  covered(): ReadonlySet<string> {
    return this.ports.batches() ? this.pages : NONE;
  }

  connected(): Iterable<string> {
    return this.ports.connected();
  }

  private catchUp(player: string): void {
    if (this.waiting.has(player)) return;
    const wait = (this.caughtUp.get(player) ?? Number.NEGATIVE_INFINITY) + CATCH_UP_MS - this.ports.now();
    if (wait <= 0) return this.caughtUpNow(player);
    this.waiting.set(player, this.ports.setTimer(() => {
      this.waiting.delete(player);
      // Covered again meanwhile: the next uncovering catches up.
      if (!this.pages.has(player)) this.caughtUpNow(player);
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
