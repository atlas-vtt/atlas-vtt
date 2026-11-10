import { bookLine, MAX_BOOK_TITLE } from './bookText.ts';
import { isRecord } from './shape.ts';
import { isPlainKey, spendText, type SheetBudget } from './sheetValues.ts';
import { MAX_TOKEN_VALUE } from './tokenUI.ts';

/** The most recovery buttons a statblock offers, the most spend rules one button has, and the longest id of a button. */
export const MAX_RECOVERY_BUTTONS = 6;
export const MAX_RECOVERY_SPENDS = 16;
export const MAX_RECOVERY_ID = 100;
/** The most steps a button asks through, the most actions a step offers, and the most picks a step takes. */
export const MAX_RECOVERY_CHOICES = 4;
export const MAX_RECOVERY_ACTIONS = 8;
export const MAX_ACTION_PICKS = 6;
/** The most actions one request picks: every step's most. */
export const MAX_REST_PICKS = MAX_RECOVERY_CHOICES * MAX_ACTION_PICKS;
/** The longest prompt of a step, and the longest sentence an action says of itself. */
export const MAX_RECOVERY_PROMPT = 160;
export const MAX_RECOVERY_ACTION_TEXT = 400;
/** The most other characters a player may take an action for. */
export const MAX_REST_ALLIES = 16;
/** A rest request's id, and the id the GM's Atlas gives a character for the table: 96 random bits in hex. */
export const REST_ID_PATTERN = /^[0-9a-f]{24}$/;

/**
 * Something a player spends on a rest, and how many of it at most they may spend now ("Hit Dice",
 * the lower of what they hold and the rule's cap). Each unit spent rolls once more what the rule rolls.
 */
export interface BookRecoverySpend {
  readonly label: string;
  readonly most: number;
}

/**
 * A recovery button of the character's statblock ("Short rest", "Long rest"): its id, which a
 * request names, its name, and its spend rules in their order, each asking the player how many.
 * What the rest restores is the GM's Atlas's to work out; the page only asks for it.
 */
export interface BookRecoveryButton {
  readonly id: string;
  readonly name: string;
  readonly spends: readonly BookRecoverySpend[];
  /**
   * The steps the player picks actions in, in order (a GM of level 3 or above): each asks for at least
   * `min` and at most `max` of its actions. A reader that knows no steps sees the button without them.
   */
  readonly choices?: readonly BookRecoveryChoice[];
}

/**
 * A step of a rest ("Choose two downtime moves"): its id, which a pick names, its prompt, how many of
 * its actions the player picks (`min` to `max`), and whether one action may be picked more than once.
 */
export interface BookRecoveryChoice {
  readonly id: string;
  readonly prompt: string;
  readonly min: number;
  readonly max: number;
  readonly repeat: boolean;
  readonly actions: readonly BookRecoveryAction[];
}

/**
 * An action a step offers ("Tend to Wounds"): its id, name and what it does in a sentence (empty for
 * none), whether it may be taken for another character (`forOthers`), and its spend rules, each
 * asking the player how many when it is picked.
 */
export interface BookRecoveryAction {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly forOthers: boolean;
  readonly spends: readonly BookRecoverySpend[];
}

/** Another character at the table an action may be taken for: its table id (as `characterId`), and its name. */
export interface BookRestAlly {
  readonly id: string;
  readonly name: string;
}

/** An action picked in a request: its step and its id, for whom (an ally's table id, or null for oneself), and its spend rules' units in order. */
export interface BookRestPick {
  readonly choice: string;
  readonly action: string;
  readonly for: string | null;
  readonly spends: readonly number[];
}

/** What a player character's statblock (`BookStatblock`) carries for rests. */
export interface StatblockRest {
  /**
   * The id the GM's Atlas gives the character the sheet is of, for the table (random, never anything
   * of the vault), which a rest request names; sent with `recovery`.
   */
  readonly characterId?: string;
  /**
   * The character's recovery buttons, each a rest the player may ask the GM for (`book-rest`): only a
   * player character's statblock from a GM of level 2 or above has any, and never without `characterId`.
   */
  readonly recovery?: readonly BookRecoveryButton[];
  /** The other characters played at the table, which an action that may be taken for others may be taken for; sent with `recovery`. */
  readonly allies?: readonly BookRestAlly[];
}

/**
 * A player asks the GM for a rest of their character (`character`, the id its statblock names), by
 * the button's id, with how many units they spend for each of the button's spend rules, in order.
 * `request` is the page's own id for it, which the GM's answer names. A GM of level 2 or above reads it.
 */
export interface BookRestMessage {
  readonly t: 'book-rest';
  readonly request: string;
  readonly character: string;
  readonly button: string;
  readonly spends: readonly number[];
  /** The actions picked in the button's steps, in the order the steps come (a GM of level 3 or above reads them). */
  readonly picks?: readonly BookRestPick[];
}

/**
 * The GM's answer to a rest request, to its player alone: the rest was taken (`done`), the GM said no
 * (`declined`), or the request did not fit what the sheet offers or came while another waited (`refused`).
 * A request the GM never answers (the player left, the table ended) gets none. An outcome a newer GM
 * names and this reader does not know reads as `refused`, so no request waits for ever.
 */
export interface BookRestAnswer {
  readonly t: 'book-rest-answer';
  readonly request: string;
  readonly outcome: 'done' | 'declined' | 'refused';
}

const REST_OUTCOMES: readonly unknown[] = ['done', 'declined', 'refused'];
/** The longest outcome a reader takes, known or not. */
const MAX_REST_OUTCOME = 32;

export const isRestId = (value: unknown): value is string => typeof value === 'string' && REST_ID_PATTERN.test(value);
export const isRecoveryId = (value: unknown): value is string => isPlainKey(value, MAX_RECOVERY_ID);
const isUnits = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_TOKEN_VALUE;

function parseSpend(value: unknown): BookRecoverySpend | null {
  if (!isRecord(value) || !isUnits(value.most)) return null;
  const label = bookLine(value.label, MAX_BOOK_TITLE);
  return label === null ? null : { label, most: value.most };
}

/** A list of spends as sent, or null where it is malformed. */
function parseSpends(value: unknown): BookRecoverySpend[] | null {
  if (!Array.isArray(value) || value.length > MAX_RECOVERY_SPENDS) return null;
  const spends = value.map(parseSpend);
  return spends.some((spend) => spend === null) ? null : (spends as BookRecoverySpend[]);
}

/** Whether every item has an id of its own. */
const idsOnce = (items: readonly { readonly id: string }[]): boolean => new Set(items.map((item) => item.id)).size === items.length;

function parseAction(value: unknown): BookRecoveryAction | null {
  if (!isRecord(value) || !isRecoveryId(value.id) || typeof value.forOthers !== 'boolean') return null;
  const name = bookLine(value.name, MAX_BOOK_TITLE);
  const text = bookLine(value.text, MAX_RECOVERY_ACTION_TEXT, true);
  const spends = parseSpends(value.spends);
  if (name === null || text === null || spends === null) return null;
  return { id: value.id, name, text, forOthers: value.forOthers, spends };
}

const isPicks = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_ACTION_PICKS;

function parseChoice(value: unknown): BookRecoveryChoice | null {
  if (!isRecord(value) || !isRecoveryId(value.id) || typeof value.repeat !== 'boolean') return null;
  const { min, max } = value;
  if (!isPicks(min) || !isPicks(max) || max < 1 || min > max) return null;
  const prompt = bookLine(value.prompt, MAX_RECOVERY_PROMPT);
  if (prompt === null || !Array.isArray(value.actions) || value.actions.length === 0 || value.actions.length > MAX_RECOVERY_ACTIONS) return null;
  const actions = value.actions.map(parseAction);
  if (actions.some((action) => action === null) || !idsOnce(actions as BookRecoveryAction[])) return null;
  return { id: value.id, prompt, min, max, repeat: value.repeat, actions: actions as BookRecoveryAction[] };
}

/** A button's steps, each id once; null when they are malformed. */
function parseChoices(value: unknown): BookRecoveryChoice[] | null {
  if (!Array.isArray(value) || value.length > MAX_RECOVERY_CHOICES) return null;
  const choices = value.map(parseChoice);
  return choices.some((choice) => choice === null) || !idsOnce(choices as BookRecoveryChoice[]) ? null : (choices as BookRecoveryChoice[]);
}

function parseButton(value: unknown): BookRecoveryButton | null {
  if (!isRecord(value) || !isRecoveryId(value.id)) return null;
  const name = bookLine(value.name, MAX_BOOK_TITLE);
  const spends = parseSpends(value.spends);
  const choices = value.choices === undefined ? undefined : parseChoices(value.choices);
  if (name === null || spends === null || choices === null) return null;
  return { id: value.id, name, spends, ...(choices !== undefined && choices.length > 0 && { choices }) };
}

/** The other characters as sent, each id once and none the character's own; null when they are malformed. */
function parseAllies(value: unknown, own: string): BookRestAlly[] | null {
  if (!Array.isArray(value) || value.length > MAX_REST_ALLIES) return null;
  const allies = value.map((ally): BookRestAlly | null => {
    if (!isRecord(ally) || !isRestId(ally.id) || ally.id === own) return null;
    const name = bookLine(ally.name, MAX_BOOK_TITLE);
    return name === null ? null : { id: ally.id, name };
  });
  return allies.some((ally) => ally === null) || !idsOnce(allies as BookRestAlly[]) ? null : (allies as BookRestAlly[]);
}

/** Every text a button shows, as the statblock's budget counts it. */
function buttonText(button: BookRecoveryButton): string {
  const spends = (list: readonly BookRecoverySpend[]): string => list.map((spend) => spend.label).join('');
  const choices = (button.choices ?? []).map((choice) => choice.prompt + choice.actions.map((action) => action.name + action.text + spends(action.spends)).join('')).join('');
  return button.name + spends(button.spends) + choices;
}

/** A statblock's recovery buttons, each id once; null when they are malformed. */
function parseRecovery(value: unknown): BookRecoveryButton[] | null {
  if (!Array.isArray(value) || value.length > MAX_RECOVERY_BUTTONS) return null;
  const buttons = value.map(parseButton);
  if (buttons.some((button) => button === null)) return null;
  const read = buttons as BookRecoveryButton[];
  return new Set(read.map((button) => button.id)).size === read.length ? read : null;
}

/**
 * The rest fields of a statblock, each where it was sent, its texts spent from the statblock's budget.
 * Malformed ones (a bad id, too many buttons or spends, more text than the statblock may hold) read as
 * none: the sheet still shows, without rests.
 */
export function parseStatblockRest(value: Record<string, unknown>, budget: SheetBudget): StatblockRest {
  if (!isRestId(value.characterId)) return {};
  if (value.recovery === undefined) return { characterId: value.characterId };
  const recovery = parseRecovery(value.recovery);
  const allies = value.allies === undefined ? undefined : parseAllies(value.allies, value.characterId);
  if (recovery === null || allies === null) return {};
  if (!spendText(budget, recovery.map(buttonText).join('') + (allies ?? []).map((ally) => ally.name).join(''))) return {};
  return { characterId: value.characterId, recovery, ...(allies !== undefined && allies.length > 0 && { allies }) };
}

const isUnitList = (value: unknown): value is number[] => Array.isArray(value) && value.length <= MAX_RECOVERY_SPENDS && value.every(isUnits);

function parsePick(value: unknown): BookRestPick | null {
  if (!isRecord(value) || !isRecoveryId(value.choice) || !isRecoveryId(value.action) || !isUnitList(value.spends)) return null;
  if (value.for !== null && !isRestId(value.for)) return null;
  return { choice: value.choice, action: value.action, for: value.for, spends: [...value.spends] };
}

/** A request's picks, or null where they are malformed; undefined where it names none. */
function parsePicks(value: unknown): BookRestPick[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_REST_PICKS) return null;
  const picks = value.map(parsePick);
  return picks.some((pick) => pick === null) ? null : (picks as BookRestPick[]);
}

/** A rest request as the GM reads it, or null when it is malformed. Whether it fits the sheet is the GM's to check. */
export function parseBookRestMessage(value: Record<string, unknown>): BookRestMessage | null {
  const { request, character, button, spends } = value;
  if (!isRestId(request) || !isRestId(character) || !isRecoveryId(button) || !isUnitList(spends)) return null;
  const picks = parsePicks(value.picks);
  if (picks === null) return null;
  return { t: 'book-rest', request, character, button, spends: [...spends], ...(picks !== undefined && picks.length > 0 && { picks }) };
}

/** The GM's answer to a rest request as the page reads it (an outcome it does not know as `refused`), or null when it is malformed. */
export function parseBookRestAnswer(value: Record<string, unknown>): BookRestAnswer | null {
  const { request, outcome } = value;
  if (!isRestId(request) || typeof outcome !== 'string' || outcome.length === 0 || outcome.length > MAX_REST_OUTCOME) return null;
  return { t: 'book-rest-answer', request, outcome: REST_OUTCOMES.includes(outcome) ? (outcome as BookRestAnswer['outcome']) : 'refused' };
}
