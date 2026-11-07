import type { PlayerInfo } from '../protocol/index.ts';
import { ArmedCards } from './armedCards.ts';
import type { Timers } from './companionTimers.ts';

export { ARM_MS } from './armedCards.ts';
/** How long a card says that its table was full. */
export const FULL_NOTE_MS = 4_000;

/** A newcomer who waits for the GM's answer. */
export interface WaitingPlayer extends PlayerInfo {
  /** The GM answered; the relay has not confirmed yet. */
  readonly answered: boolean;
  /** The GM admitted them, but the table had filled meanwhile. */
  readonly full: boolean;
  /** The card has stood in its place for `ARM_MS`: until then it takes no answer, and looks it. */
  readonly armed: boolean;
}

/** A newcomer's card among the cards over the control (`ArmedCards`). */
export const knockKey = (id: string): string => `knock:${id}`;

/**
 * The newcomers who wait, in the order they knocked, each with the time its card has stood where it
 * stands, kept by the cards' shared clock (`ArmedCards`), so a card that leaves or moves starts the
 * time of every card in the stack again, a rest request's too. A later knock goes after the earlier
 * ones and leaves their time alone.
 */
export class WaitingKnocks {
  private list: readonly WaitingPlayer[] = [];
  /** The timers of the cards that say their table was full. */
  private readonly notes = new Map<string, number>();
  private readonly timers: Timers;
  private readonly changed: () => void;
  private readonly cards: ArmedCards;
  private readonly owned: boolean;
  private readonly heard = (): void => {
    if (this.refresh()) this.changed();
  };
  private readonly stopListening: () => void;

  /** `cards`: the clock shared with the other cards of the stack; one of its own without it. */
  constructor(timers: Timers, changed: () => void, cards?: ArmedCards) {
    this.timers = timers;
    this.changed = changed;
    this.owned = cards === undefined;
    this.cards = cards ?? new ArmedCards(timers);
    this.stopListening = this.cards.listen(this.heard);
  }

  get players(): readonly WaitingPlayer[] {
    return this.list;
  }

  /** The relay's welcome: who waits now. A card that keeps its place keeps its time; an answer under way is void. */
  welcomed(waiting: readonly PlayerInfo[]): void {
    this.clearNotes();
    const kept = new Set(waiting.filter((player, index) => this.list[index]?.id === player.id).map((player) => player.id));
    for (const player of this.list) if (!kept.has(player.id)) this.cards.drop(knockKey(player.id), this.heard);
    for (const player of waiting) if (!kept.has(player.id)) this.cards.show(knockKey(player.id), this.heard);
    this.list = waiting.map((player) => ({ ...player, answered: false, full: false, armed: false }));
    this.refresh();
    this.changed();
  }

  /** A newcomer knocked: their card goes after the others. A knock already shown changes nothing. */
  knocked(player: PlayerInfo): void {
    if (this.list.some((other) => other.id === player.id)) return;
    this.cards.show(knockKey(player.id), this.heard);
    this.list = [...this.list, { ...player, answered: false, full: false, armed: false }];
    this.refresh();
    this.changed();
  }

  /** A knock ended. One admitted into a table that had filled says so for a moment before its card goes. */
  gone(id: string, full: boolean): void {
    if (!full) return this.remove(id);
    if (!this.list.some((player) => player.id === id) || this.notes.has(id)) return;
    this.list = this.list.map((player) => (player.id === id ? { ...player, answered: true, full: true } : player));
    this.notes.set(id, this.timers.setTimer(() => this.remove(id), FULL_NOTE_MS));
    this.changed();
  }

  /** The cards may have moved on screen: each takes no answer again until it has stood for `ARM_MS`. */
  moved(): void {
    this.cards.moved();
  }

  /**
   * Marks a waiting player as answered; false when there is none to answer, the answer is under way,
   * or the card has not stood long enough to be meant.
   */
  answer(id: string): boolean {
    const player = this.list.find((other) => other.id === id);
    if (player === undefined || player.answered || !player.armed) return false;
    this.list = this.list.map((other) => (other.id === id ? { ...other, answered: true } : other));
    this.changed();
    return true;
  }

  /** No timer is left running, and no card of theirs in the stack. */
  dispose(): void {
    this.clearNotes();
    this.stopListening();
    for (const player of this.list) this.cards.drop(knockKey(player.id), this.heard);
    this.list = [];
    if (this.owned) this.cards.dispose();
  }

  private remove(id: string): void {
    const note = this.notes.get(id);
    if (note !== undefined) this.timers.clearTimer(note);
    this.notes.delete(id);
    if (!this.list.some((player) => player.id === id)) return;
    this.list = this.list.filter((player) => player.id !== id);
    // The others close up: one of them may take the place of the card that was just pressed.
    this.cards.remove(knockKey(id), this.heard);
    this.refresh();
    this.changed();
  }

  /** Each card's `armed` as the clock says; whether any changed. */
  private refresh(): boolean {
    const list = this.list.map((player) => {
      const armed = this.cards.isArmed(knockKey(player.id));
      return player.armed === armed ? player : { ...player, armed };
    });
    const flipped = list.some((player, index) => player !== this.list[index]);
    if (flipped) this.list = list;
    return flipped;
  }

  private clearNotes(): void {
    for (const note of this.notes.values()) this.timers.clearTimer(note);
    this.notes.clear();
  }
}
