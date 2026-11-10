import {
  isRecoveryId, MAX_ACTION_PICKS, MAX_BOOK_TITLE, MAX_RECOVERY_ACTION_TEXT, MAX_RECOVERY_ACTIONS, MAX_RECOVERY_BUTTONS, MAX_RECOVERY_CHOICES, MAX_RECOVERY_PROMPT,
  MAX_RECOVERY_SPENDS, MAX_REST_ALLIES, MAX_TOKEN_VALUE, parseBookStatblock, type BookRecoveryAction, type BookRecoveryButton, type BookRecoveryChoice,
  type BookRecoverySpend, type BookRestAlly, type BookStatblock,
} from '../../protocol/index.ts';
import type { ActionOffer, ChoiceOffer, RestOffer, SpendOffer } from '../../../recovery/restOffer';
import { cutLine } from '../shownText.ts';
import { UNPLACED_PREFIX } from './BookShelf.ts';
import type { PlayedCharacter } from './characters.ts';
import { jsonBytes, MAX_STATBLOCK_BYTES } from './sheetBudget.ts';
import type { DrawnStatblock } from './statblockSheet.ts';

export interface CharacterRestPorts {
  /** A new id: 24 hex characters from the cryptographic source. */
  randomId(): string;
  /** The buttons the character offers now (`RestGate.offers`); null where it offers none. */
  offers(path: string, character: string): readonly RestOffer[] | null;
}

/** How many units of a spend the page may offer: what the offer says, a whole number the protocol carries. */
const mostOf = (max: number): number => (Number.isFinite(max) ? Math.max(0, Math.min(MAX_TOKEN_VALUE, Math.floor(max))) : 0);

/** What a character without a name is called among the allies. */
const UNNAMED = 'Unnamed character';

/** Spends as the page is sent them; null where one cannot be, since a request names a count for each, in order. */
function bookSpends(offers: readonly SpendOffer[]): BookRecoverySpend[] | null {
  const spends = offers.map((spend): BookRecoverySpend | null => {
    const label = cutLine(spend.label, MAX_BOOK_TITLE);
    return label === null ? null : { label, most: mostOf(spend.max) };
  });
  return spends.length > MAX_RECOVERY_SPENDS || spends.some((spend) => spend === null) ? null : (spends as BookRecoverySpend[]);
}

function bookAction(offer: ActionOffer): BookRecoveryAction | null {
  const name = cutLine(offer.name, MAX_BOOK_TITLE);
  const spends = bookSpends(offer.spends);
  if (!isRecoveryId(offer.id) || name === null || spends === null) return null;
  return { id: offer.id, name, text: cutLine(offer.text, MAX_RECOVERY_ACTION_TEXT) ?? '', forOthers: offer.forOthers, spends };
}

function bookChoice(offer: ChoiceOffer): BookRecoveryChoice | null {
  const prompt = cutLine(offer.prompt, MAX_RECOVERY_PROMPT);
  const actions = offer.actions.map(bookAction);
  const counts = offer.min >= 0 && offer.min <= offer.max && offer.max >= 1 && offer.max <= MAX_ACTION_PICKS;
  if (!isRecoveryId(offer.id) || prompt === null || !counts || actions.length === 0 || actions.length > MAX_RECOVERY_ACTIONS || actions.some((action) => action === null)) return null;
  return { id: offer.id, prompt, min: offer.min, max: offer.max, repeat: offer.repeat, actions: actions as BookRecoveryAction[] };
}

/** A button as the page is sent it; null where it cannot be (an id the protocol does not carry, a name, spend or step that shows nothing). */
function bookButton(offer: RestOffer): BookRecoveryButton | null {
  const name = cutLine(offer.name, MAX_BOOK_TITLE);
  const spends = bookSpends(offer.spends);
  const choices = offer.choices.map(bookChoice);
  // A request must fit every step: a button missing one is not offered at all.
  if (!isRecoveryId(offer.id) || name === null || spends === null || choices.length > MAX_RECOVERY_CHOICES || choices.some((choice) => choice === null)) return null;
  return { id: offer.id, name, spends, ...(choices.length > 0 && { choices: choices as BookRecoveryChoice[] }) };
}

/** Whether a button has an action the player may take for another character. */
const forOthers = (button: BookRecoveryButton): boolean => (button.choices ?? []).some((choice) => choice.actions.some((action) => action.forOthers));

/** The characters an action may be taken for: every other character played at the table that has a statblock and is a library token. */
export function restAllies(character: PlayedCharacter, played: readonly PlayedCharacter[]): PlayedCharacter[] {
  return played.filter((other) => other.key !== character.key && other.statblockPath !== null && !other.key.startsWith(UNPLACED_PREFIX));
}

/** The buttons as the page is sent them: each id once, as many as a statblock carries. */
function bookRecovery(offers: readonly RestOffer[]): BookRecoveryButton[] {
  const ids = new Set<string>();
  return offers.flatMap((offer) => bookButton(offer) ?? []).filter((button) => !ids.has(button.id) && ids.add(button.id)).slice(0, MAX_RECOVERY_BUTTONS);
}

/**
 * Whether a statblock still reads as the page reads it, its rests whole, and fits its message: a
 * sheet over its budget reads without its rests, which must not be sent as if they were there.
 */
function fits(statblock: BookStatblock): boolean {
  const read = parseBookStatblock(statblock);
  return read !== undefined && read !== null && read.recovery?.length === statblock.recovery?.length && (read.allies?.length ?? 0) === (statblock.allies?.length ?? 0)
    && jsonBytes(statblock) <= MAX_STATBLOCK_BYTES;
}

/**
 * The recovery buttons of the characters players play, on the statblock each player is sent of their
 * own character (`BookStatblock.recovery`). A character carries them only where Atlas says it is the
 * player character of its note and it has buttons (`RestGate.offers`), named by an id of its own for
 * the table (`characterId`): random, made the first time, kept while the table runs, never anything
 * of the vault. What each Spend rule lets the player spend is read again whenever the statblock is
 * drawn anew, which its note or its resources changing does. A statblock the buttons would make too
 * large for the page is sent without them.
 */
export class CharacterRests {
  /** The id of each character's book key, and the book key of each id. */
  private readonly ids = new Map<string, string>();
  private readonly keys = new Map<string, string>();
  /** The last statblock decorated for each character, the allies it was decorated with, and what it became. */
  private readonly decorated = new Map<string, { readonly drawn: DrawnStatblock; readonly allies: string; readonly with: DrawnStatblock }>();

  constructor(private readonly ports: CharacterRestPorts) {}

  /**
   * The statblock a character's player is sent: `drawn` with the character's buttons where it has any,
   * and the other characters at the table (`allies`, see `restAllies`) where an action may be taken for others.
   */
  withRest(character: PlayedCharacter | null, drawn: DrawnStatblock | undefined, allies: readonly PlayedCharacter[] = []): DrawnStatblock | undefined {
    if (character === null || drawn === undefined || drawn.statblock === null || character.statblockPath === null) return drawn;
    const others = this.bookAllies(allies);
    const alliesKey = others.map((ally) => `${ally.id}:${ally.name}`).join('\n');
    const last = this.decorated.get(character.key);
    if (last?.drawn === drawn && last.allies === alliesKey) return last.with;
    const offers = this.ports.offers(character.statblockPath, character.key);
    const recovery = offers === null ? [] : bookRecovery(offers);
    const shown = recovery.some(forOthers) ? others : [];
    const base = drawn.statblock;
    const withRest = (allyList: readonly BookRestAlly[]): BookStatblock => ({ ...base, characterId: this.idOf(character.key), recovery, ...(allyList.length > 0 && { allies: allyList }) });
    // Without its allies a sheet may still fit; without its rests it is sent as it was drawn, and the GM is told
    const statblock = recovery.length === 0 ? null : [withRest(shown), withRest([])].find(fits) ?? null;
    if (recovery.length > 0 && statblock === null) console.warn(`[Atlas] ${character.sheet.name}'s rests do not fit their player's sheet and are left out.`);
    const decorated = statblock !== null ? { ...drawn, statblock } : drawn;
    this.decorated.set(character.key, { drawn, allies: alliesKey, with: decorated });
    return decorated;
  }

  /** The book key of the character a request names by its table id; undefined for an id this table never gave. */
  characterOf(id: string): string | undefined {
    return this.keys.get(id);
  }

  /** What characters offer may have changed (a rest taken, a note changed): their buttons are read again with the next statblock. */
  forget(character?: string): void {
    if (character === undefined) this.decorated.clear();
    else this.decorated.delete(character);
  }

  /** The allies as the page is sent them, by the table ids this table gives them, as many as a statblock carries. */
  private bookAllies(allies: readonly PlayedCharacter[]): BookRestAlly[] {
    return allies.slice(0, MAX_REST_ALLIES).map((ally) => ({ id: this.idOf(ally.key), name: cutLine(ally.sheet.name, MAX_BOOK_TITLE) ?? UNNAMED }));
  }

  private idOf(character: string): string {
    let id = this.ids.get(character);
    if (id === undefined) {
      id = this.ports.randomId();
      this.ids.set(character, id);
      this.keys.set(id, character);
    }
    return id;
  }
}
