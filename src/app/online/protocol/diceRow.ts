import { isRowRollId, MAX_FACES, MAX_FORMULA, MAX_ROLL_DICE_GROUPS } from './dice.ts';
import { isRecord } from './shape.ts';

/** The most places of the GM's dice row. */
export const MAX_ROW_PLACES = 10;
/** The longest name of a saved roll, and of one of its dice. */
export const MAX_ROW_ROLL_NAME = 40;
/** The most dice of one group of a designed roll: Atlas's 100 dice of a formula. */
const MAX_LOOK_GROUP = 100;
/** The bonus of a designed roll: a signed number of at most three digits, or none. */
const LOOK_BONUS = /^([+-]\d{1,3})?$/;
const COLOUR = /^#[0-9a-f]{6}$/i;

/** One group of a designed roll's dice, as the GM's Dice Lab names and colours it. */
export interface SharedLookDie {
  readonly count: number;
  readonly sides: number;
  readonly name?: string;
  readonly colour?: string;
}

/**
 * A saved roll the GM pinned to the dice row: a formula (`1d8+3[slashing]`), or designed dice (`look`)
 * with `formula` only their bonus (`+3`, or empty). A designed roll is rolled by the GM's Atlas with its
 * own dice when a player's roll names it (`PlayerRoll.preset`).
 */
export interface SharedRowRoll {
  readonly id: string;
  readonly name: string;
  readonly formula: string;
  readonly look?: readonly SharedLookDie[];
}

/** One place of the GM's dice row: a die of `die` faces, or a saved roll. */
export type SharedRowPlace = { readonly die: number } | { readonly roll: SharedRowRoll };

const isWhole = (value: unknown, least: number, most: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= least && value <= most;

/** A name as a page may show it: text without control or format characters, not blank. */
const isName = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '' && value.length <= MAX_ROW_ROLL_NAME && !/[\p{Cc}\p{Cf}]/u.test(value);

function parseLookDie(value: unknown): SharedLookDie | null {
  if (!isRecord(value)) return null;
  const { count, sides, name, colour } = value;
  if (!isWhole(count, 1, MAX_LOOK_GROUP) || !isWhole(sides, 2, MAX_FACES)) return null;
  if (name !== undefined && !isName(name)) return null;
  if (colour !== undefined && (typeof colour !== 'string' || !COLOUR.test(colour))) return null;
  return { count, sides, ...(name !== undefined && { name }), ...(colour !== undefined && { colour }) };
}

function parseRowRoll(value: unknown): SharedRowRoll | null {
  if (!isRecord(value)) return null;
  const { id, name, formula, look } = value;
  if (!isRowRollId(id) || !isName(name) || typeof formula !== 'string' || formula.length > MAX_FORMULA) return null;
  if (look === undefined) return formula.trim() === '' ? null : { id, name, formula };
  if (!Array.isArray(look) || look.length === 0 || look.length > MAX_ROLL_DICE_GROUPS || !LOOK_BONUS.test(formula)) return null;
  const dice = look.map(parseLookDie);
  return dice.every((die) => die !== null) ? { id, name, formula, look: dice } : null;
}

function parsePlace(value: unknown): SharedRowPlace | null {
  if (!isRecord(value)) return null;
  if (value.die !== undefined) return isWhole(value.die, 2, MAX_FACES) ? { die: value.die } : null;
  const roll = parseRowRoll(value.roll);
  return roll === null ? null : { roll };
}

/**
 * The GM's dice row as a page reads it, or undefined where none can be read (the page's tray then
 * shows the standard dice). A place it cannot read, one from a later Atlas too, is left out.
 */
export function parseDiceRow(value: unknown): SharedRowPlace[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_ROW_PLACES) return undefined;
  return value.flatMap((place: unknown) => parsePlace(place) ?? []);
}
