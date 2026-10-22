import type { RestSummary } from '../../../recovery/restEvents';
import type { RestOffer, RestRequest } from '../../../recovery/restOffer';

/** A rest request that fits what the character offers now, as the GM is shown it: the button's name, the actions picked, and what its rules will do. */
export interface CheckedRest {
  readonly button: string;
  /** "Tend to Wounds for Kestrel": each action picked, in order, with whom it is taken for where that is another character. */
  readonly picks: readonly string[];
  /** "HP to full", "2 Hit Dice", "Exhaustion −1": each rule that will change something, in order. */
  readonly rules: readonly string[];
}

/** What a rest that was taken came to: done, or refused because it no longer fits what the character offers. */
export type TakenRest = 'done' | 'refused';

/** Another character played at the table, whom an action of a rest may be taken for: its book key (its library token's id) and its statblock note. */
export interface RestAlly {
  readonly character: string;
  readonly path: string;
}

/**
 * How the table reaches Atlas's recovery buttons for the characters players play. A character is
 * named by its note (`path`) and the key of its book (`character`: its library token's id): Atlas
 * answers only where that library token is the player character whose statblock the note is, so
 * nobody rests a character that is not a player character, or with another one's note.
 */
export interface RestGate {
  /** The buttons the character offers now, each with what its Spend rules let the player spend; null where it offers none. */
  offers(path: string, character: string): readonly RestOffer[] | null;
  /**
   * A request checked against what the character offers now (`checkRest`), an action taken for
   * another only for one of `allies` that Atlas reaches as a player character; null where it does not fit.
   */
  check(path: string, character: string, request: RestRequest, allies: readonly RestAlly[]): CheckedRest | null;
  /** Takes the rest, checked again first, rolled and written as the GM's own edits, of every character it reaches; it is announced to `onRested`. */
  take(path: string, character: string, request: RestRequest, allies: readonly RestAlly[]): Promise<TakenRest>;
  /** Calls `listener` with every rest the GM takes from now on, a player's approved and the GM's own; returns what stops it. */
  onRested(listener: (rest: RestSummary) => void): () => void;
}

let gate: RestGate | null = null;

/** Names who answers for recovery buttons: Atlas. Without a gate no character offers a rest. */
export function setRestGate(next: RestGate | null): void {
  gate = next;
}

/** The ports the table reaches rests through, answered by the gate set now. */
export const gatedRests: RestGate = {
  offers: (path, character) => gate?.offers(path, character) ?? null,
  check: (path, character, request, allies) => gate?.check(path, character, request, allies) ?? null,
  take: async (path, character, request, allies) => (gate === null ? 'refused' : gate.take(path, character, request, allies)),
  onRested: (listener) => {
    // Rests are announced per app: the gate set while the table runs is the one heard.
    const held = gate;
    return held === null ? () => undefined : held.onRested(listener);
  },
};
