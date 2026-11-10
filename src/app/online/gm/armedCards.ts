import type { Timers } from './companionTimers.ts';

/**
 * How long a card takes no answer after it first showed, and again after it may have moved: whoever
 * knocks or asks chooses the moment their card appears, so a press or a key meant for something
 * else that lands on it must do nothing.
 */
export const ARM_MS = 700;

type Listener = () => void;

/**
 * The arming clock of the cards over the online control (newcomers who knock, players who ask for a
 * rest), shared by every kind of card, since they stand in one stack: each card's time is kept here
 * by its key, in the order the cards came, and not with what is drawn, so drawing the cards anew
 * neither starts it again nor skips it. A later card goes after the earlier ones and leaves their
 * time alone. When a card leaves (`remove`), or the cards may have moved on screen (`moved`), the
 * others start again, since one of them may now lie under the pointer or have the keyboard's focus.
 * One timer tells of the cards that came due together, once. Whoever keeps cards here hears when
 * one was armed or disarmed by anything but their own call (`listen`).
 */
export class ArmedCards {
  /** Since when each card has stood where it stands, by key, in the order the cards came. */
  private readonly since = new Map<string, number>();
  private armed = new Set<string>();
  private timer: number | undefined;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly timers: Timers) {}

  /** The cards' keys, in the order they came. */
  keys(): readonly string[] {
    return [...this.since.keys()];
  }

  isArmed(key: string): boolean {
    return this.armed.has(key);
  }

  /** Since when a card has stood where it stands; undefined for one not shown. */
  shownSince(key: string): number | undefined {
    return this.since.get(key);
  }

  /** Hears every change of the cards' arming made by the clock or by another's call; returns what stops it. */
  listen(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** A card shows, after the others, its time from `since` (now unless it kept its place). A card shown already keeps its time. */
  show(key: string, by?: Listener, since = this.timers.now()): void {
    if (this.since.has(key)) return;
    this.since.set(key, since);
    this.settle(by);
  }

  /** A card shown already says something else now: it takes no answer again until it has stood for `ARM_MS`, in its place. */
  rearm(key: string, by?: Listener): void {
    if (!this.since.has(key)) return;
    this.since.set(key, this.timers.now());
    this.settle(by);
  }

  /** A card is taken away without moving the others (a list told anew, where each card says whether it kept its place). */
  drop(key: string, by?: Listener): void {
    if (this.since.delete(key)) this.settle(by);
  }

  /** A card left: the others close up, and one of them may take the place of the card that was just pressed. */
  remove(key: string, by?: Listener): void {
    if (!this.since.delete(key)) return;
    this.restart();
    this.settle(by);
  }

  /** The cards may have moved on screen: each takes no answer again until it has stood for `ARM_MS`. */
  moved(): void {
    if (this.since.size === 0) return;
    this.restart();
    this.settle();
  }

  /** No timer is left running, and no card. */
  dispose(): void {
    this.since.clear();
    this.armed.clear();
    this.clearTimer();
  }

  private restart(): void {
    const now = this.timers.now();
    for (const key of this.since.keys()) this.since.set(key, now);
  }

  /** Arms the cards by the clock and tells everyone but `by` where that changed any. */
  private settle(by?: Listener): void {
    if (this.arm()) this.tell(by);
  }

  /** Sets which cards are armed by the clock and times the next card that comes due; whether any changed. */
  private arm(): boolean {
    const now = this.timers.now();
    let next = Number.POSITIVE_INFINITY;
    const armed = new Set<string>();
    for (const [key, since] of this.since) {
      const left = since + ARM_MS - now;
      if (left <= 0) armed.add(key);
      else next = Math.min(next, left);
    }
    const flipped = armed.size !== this.armed.size || [...armed].some((key) => !this.armed.has(key));
    this.armed = armed;
    this.clearTimer();
    if (next !== Number.POSITIVE_INFINITY) {
      this.timer = this.timers.setTimer(() => {
        this.timer = undefined;
        this.settle();
      }, next);
    }
    return flipped;
  }

  private tell(by?: Listener): void {
    for (const listener of [...this.listeners]) if (listener !== by) listener();
  }

  private clearTimer(): void {
    if (this.timer !== undefined) this.timers.clearTimer(this.timer);
    this.timer = undefined;
  }
}
