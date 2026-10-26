import { isRollMode, MAX_FLAVOR, MAX_INLINE_ROLLS, shownLine, type RollMode } from './chat.ts';
import { LOG_ID_PATTERN } from './log.ts';
import { MAX_SCENE_ID } from './moves.ts';
import { PLAYER_ID_PATTERN } from './relay.ts';
import { isRecord } from './shape.ts';
import { TOKEN_ID_PATTERN } from './tokens.ts';

/** The longest formula a player may send: Atlas's dice parser takes no longer one. */
export const MAX_FORMULA = 100;
/** The longest formula a shared roll names: Atlas may complete a bonus with the default roll. */
export const MAX_ROLL_FORMULA = 160;
/** The most dice a shared roll holds: Atlas's 100 dice, each rolled again and exploding up to 10 times. */
export const MAX_ROLLED_DICE = 2200;
/** The most faces a die has in Atlas's dice grammar. */
export const MAX_FACES = 1000;
/** The longest ability name a shared roll carries. */
export const MAX_ABILITY_NAME = 200;
const MAX_ROLL_ID = 64;
/** The largest total Atlas's grammar lets a formula make. */
const MAX_TOTAL = 1_000_000_000;
/** The longest label a die's term carries. */
const MAX_DIE_LABEL = 24;
/** The most labelled constants a shared roll names: Atlas's formula holds no more terms. */
export const MAX_NAMED_MODIFIERS = 20;

/** Which way a roll is helped or hindered: rolled as the GM's dice set's rule for that side says. */
export type AdvantageSide = 'advantage' | 'disadvantage';

export const ADVANTAGE_SIDES: readonly AdvantageSide[] = ['advantage', 'disadvantage'];

export const isAdvantageSide = (value: unknown): value is AdvantageSide => value === 'advantage' || value === 'disadvantage';

/** The most groups of dice a dice set names. */
export const MAX_ROLL_DICE_GROUPS = 20;
/** The most dice of one group: Atlas's 100 dice of a formula. */
const MAX_GROUP_DICE = 100;
/** The most sides a roll's dice name, those of a later Atlas included. */
const MAX_SIDES = 8;

/**
 * What a page needs of the dice a roll is made with to offer advantage: the set's own dice, in its
 * order (a bare bonus is rolled with them, and advantage changes only a roll that holds them), and the
 * sides its rules say anything for. A roll the set's dice are not in rolls as it is.
 */
export interface SharedRollDice {
  readonly dice: readonly { readonly count: number; readonly sides: number }[];
  readonly sides: readonly AdvantageSide[];
}

/** The roll button a roll answers: the log entry that offers it and which of its rolls. */
export interface RollRequestAnswer {
  readonly id: string;
  readonly index: number;
}

/**
 * A player rolls: `formula` as Atlas's dice tray writes it, for the token `token` (by the id players
 * know it by: their selected own token, or their only one), or for nobody (null); in a roll mode
 * (public where absent), with a flavor, answering a roll button of the log (`request`).
 */
export interface PlayerRoll {
  readonly t: 'roll';
  readonly scene: string;
  readonly formula: string;
  readonly token: string | null;
  readonly mode?: RollMode;
  readonly flavor?: string;
  readonly request?: RollRequestAnswer;
  /** Ask for the GM’s names and colours on an explicit matching pool. */
  readonly setAppearance?: true;
  /**
   * Roll with advantage or disadvantage, as the GM's dice set rules it; a roll that cannot take the
   * side rolls plain. Added later: an older GM rolls plain, an older page never asks.
   */
  readonly advantage?: AdvantageSide;
}

/**
 * One die of a roll as Atlas rolled it: a Fate die is `dF` with `min` −1 and `max` 1. A die rolled
 * again (`rerolled`, the next die took its place) or left out by keep or drop (`dropped`) counts for
 * nothing; a counted one is a `success` or a `failure`; `label` is its term's.
 */
export interface SharedDie {
  readonly die: string;
  readonly value: number;
  readonly max: number;
  readonly min?: -1;
  readonly negative?: true;
  readonly exploded?: true;
  readonly rerolled?: true;
  readonly dropped?: true;
  readonly success?: true;
  readonly failure?: true;
  readonly label?: string;
  /** The name and colour the GM's dice set gives this die. */
  readonly name?: string;
  readonly colour?: string;
}

/** A roll as players see it: Atlas's result without who rolled it, its source reduced to what players may know. */
export interface SharedRoll {
  readonly id: string;
  readonly timestamp: number;
  readonly formula: string;
  readonly rolls: readonly SharedDie[];
  readonly modifiers: number;
  readonly total: number;
  readonly crit?: 'high' | 'low' | null;
  readonly source?: { readonly type: 'toolbar' | 'statblock'; readonly abilityName?: string };
  /** The formula is no plain sum (it multiplies, divides or counts): `modifiers` is 0 then. */
  readonly linear?: false;
  /**
   * The constants of `modifiers` written with a label (`+3[Str mod]`), in written order, each kept
   * apart so the roll names it: "+ 4 − 1 Str mod". Absent where it names none. Added later: an older
   * GM sends none, and an older page reads `modifiers` alone.
   */
  readonly namedModifiers?: readonly SharedNamedModifier[];
}

/** A constant of a roll written with a label: `+2[Proficiency]` is Proficiency, 2; a subtracted one is negative. */
export interface SharedNamedModifier {
  readonly label: string;
  readonly value: number;
}

/**
 * A roll the GM's Atlas made, by a player (their relay id) or by the GM (`'gm'`), naming the token
 * `token` (by the id players know it by) when the players see it, else nobody.
 */
export interface RollMessage {
  readonly t: 'roll';
  readonly who: string;
  readonly result: SharedRoll;
  readonly token: string | null;
}

/** Why the GM did not roll a player's formula: no dice in it, too many rolls, another scene, or no dice tool. */
export type RollRefusal = 'formula' | 'rate' | 'scene' | 'unavailable';

/** Sent to the player alone: their roll was not made. */
export interface RollRefused {
  readonly t: 'roll-refused';
  readonly reason: RollRefusal;
}

const REFUSALS: readonly string[] = ['formula', 'rate', 'scene', 'unavailable'];
const isInteger = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;

function parseDiceGroup(value: unknown): SharedRollDice['dice'][number] | null {
  if (!isRecord(value) || !isInteger(value.count, 1, MAX_GROUP_DICE) || !isInteger(value.sides, 1, MAX_FACES)) return null;
  return { count: value.count, sides: value.sides };
}

/** A roll's dice as a page reads them, or undefined for anything malformed; a side it does not know is left out. */
export function parseRollDice(value: unknown): SharedRollDice | undefined {
  if (!isRecord(value) || !Array.isArray(value.dice) || value.dice.length > MAX_ROLL_DICE_GROUPS || !Array.isArray(value.sides) || value.sides.length > MAX_SIDES) return undefined;
  const dice = value.dice.map(parseDiceGroup);
  if (dice.some((group) => group === null)) return undefined;
  const sides = ADVANTAGE_SIDES.filter((side) => (value.sides as unknown[]).includes(side));
  return { dice: dice as SharedRollDice['dice'][number][], sides };
}

function parseRequestAnswer(value: unknown): RollRequestAnswer | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !LOG_ID_PATTERN.test(value.id) || !isInteger(value.index, 0, MAX_INLINE_ROLLS - 1)) return null;
  return { id: value.id, index: value.index };
}

/** A player's roll as the GM reads it, or null for anything malformed; a side of advantage it does not know is left out, and the roll rolls plain. */
export function parsePlayerRoll(value: Record<string, unknown>): PlayerRoll | null {
  const { scene, formula, token, mode, flavor } = value;
  if (!isText(scene, MAX_SCENE_ID) || scene === '' || !isText(formula, MAX_FORMULA)) return null;
  if (token !== null && (typeof token !== 'string' || !TOKEN_ID_PATTERN.test(token))) return null;
  if (mode !== undefined && !isRollMode(mode)) return null;
  if (value.setAppearance !== undefined && value.setAppearance !== true) return null;
  const shownFlavor = flavor === undefined ? undefined : shownLine(flavor, MAX_FLAVOR);
  const request = value.request === undefined ? undefined : parseRequestAnswer(value.request);
  if (shownFlavor === null || request === null) return null;
  return {
    t: 'roll', scene, formula, token,
    ...(mode !== undefined && mode !== 'public' && { mode }),
    ...(shownFlavor !== undefined && { flavor: shownFlavor }),
    ...(request !== undefined && { request }),
    ...(value.setAppearance === true && { setAppearance: true }),
    ...(isAdvantageSide(value.advantage) && { advantage: value.advantage }),
  };
}

const FLAGS = ['negative', 'exploded', 'rerolled', 'dropped', 'success', 'failure'] as const;
const DIE_LABEL = /^[\p{L}\p{N}' -]{1,24}$/u;

function parseDie(value: unknown): SharedDie | null {
  if (!isRecord(value)) return null;
  const { die, value: rolled, max, min, label, name, colour } = value;
  const fate = die === 'dF';
  if (typeof die !== 'string' || !isInteger(max, 1, MAX_FACES) || !isInteger(rolled, -1, max)) return null;
  if (fate ? max !== 1 || min !== -1 : die !== `d${max}` || min !== undefined || rolled < 1) return null;
  if (FLAGS.some((flag) => value[flag] !== undefined && value[flag] !== true)) return null;
  if (label !== undefined && (typeof label !== 'string' || label.length > MAX_DIE_LABEL || !DIE_LABEL.test(label))) return null;
  if (name !== undefined && (typeof name !== 'string' || name.trim() === '' || name.length > 40 || /[\p{Cc}\p{Cf}]/u.test(name))) return null;
  if (colour !== undefined && (typeof colour !== 'string' || !/^#[0-9a-f]{6}$/i.test(colour))) return null;
  const flags = Object.fromEntries(FLAGS.filter((flag) => value[flag] === true).map((flag) => [flag, true]));
  return { die, value: rolled, max, ...(fate && { min: -1 as const }), ...flags, ...(label !== undefined && { label }), ...(name !== undefined && { name }), ...(colour !== undefined && { colour }) };
}

function parseSource(value: unknown): SharedRoll['source'] | null {
  if (value === undefined) return undefined;
  if (!isRecord(value) || (value.type !== 'toolbar' && value.type !== 'statblock')) return null;
  const { abilityName } = value;
  if (abilityName === undefined) return { type: value.type };
  return isText(abilityName, MAX_ABILITY_NAME) ? { type: value.type, abilityName } : null;
}

/** A labelled constant as a shared roll names it, or null for anything else: a label the dice notation writes, a whole signed number. */
function parseNamedModifier(value: unknown): SharedNamedModifier | null {
  if (!isRecord(value)) return null;
  const { label, value: amount } = value;
  if (typeof label !== 'string' || label.trim() === '' || !DIE_LABEL.test(label) || !isInteger(amount, -MAX_TOTAL, MAX_TOTAL)) return null;
  return { label, value: amount };
}

/**
 * A roll's labelled constants, or undefined where it names none or the list cannot be part of its
 * constants (`modifiers`): a roll that is no plain sum has none, and what the named ones leave for
 * the unnamed constants is a number a formula can make. A malformed list is dropped, the roll kept.
 */
function parseNamedModifiers(value: unknown, modifiers: number, linear: boolean): readonly SharedNamedModifier[] | undefined {
  if (!linear || !Array.isArray(value) || value.length === 0 || value.length > MAX_NAMED_MODIFIERS) return undefined;
  const entries = value.flatMap((entry: unknown) => parseNamedModifier(entry) ?? []);
  if (entries.length !== value.length) return undefined;
  const plain = entries.reduce((rest, entry) => rest - entry.value, modifiers);
  return Math.abs(plain) <= MAX_TOTAL ? entries : undefined;
}

/** A shared roll as the client reads it, or null for anything malformed: nothing else reaches the dice. */
export function parseSharedRoll(value: unknown): SharedRoll | null {
  if (!isRecord(value)) return null;
  const { id, timestamp, formula, modifiers, total, crit } = value;
  if (!isText(id, MAX_ROLL_ID) || id === '' || typeof timestamp !== 'number' || !Number.isFinite(timestamp) || !isText(formula, MAX_ROLL_FORMULA)) return null;
  if (!isInteger(modifiers, -MAX_TOTAL, MAX_TOTAL) || !isInteger(total, -MAX_TOTAL, MAX_TOTAL)) return null;
  if (crit !== undefined && crit !== null && crit !== 'high' && crit !== 'low') return null;
  if (!Array.isArray(value.rolls) || value.rolls.length > MAX_ROLLED_DICE) return null;
  const rolls = value.rolls.map(parseDie);
  const source = parseSource(value.source);
  if (rolls.some((die) => die === null) || source === null || (value.linear !== undefined && value.linear !== false)) return null;
  const namedModifiers = parseNamedModifiers(value.namedModifiers, modifiers, value.linear !== false);
  return {
    id, timestamp, formula, rolls: rolls as SharedDie[], modifiers, total,
    ...(value.linear === false && { linear: false as const }),
    ...(namedModifiers !== undefined && { namedModifiers }),
    ...(crit !== undefined && { crit }),
    ...(source !== undefined && { source }),
  };
}

/** A GM's roll message as the client reads it, or null for anything malformed. */
export function parseRoll(value: Record<string, unknown>): RollMessage | null {
  const { who, token } = value;
  if (who !== 'gm' && (typeof who !== 'string' || !PLAYER_ID_PATTERN.test(who))) return null;
  if (token !== null && (typeof token !== 'string' || !TOKEN_ID_PATTERN.test(token))) return null;
  const result = parseSharedRoll(value.result);
  return result === null ? null : { t: 'roll', who, result, token };
}

/** A refusal as the client reads it, or null for anything malformed. */
export function parseRollRefused(value: Record<string, unknown>): RollRefused | null {
  return typeof value.reason === 'string' && REFUSALS.includes(value.reason) ? { t: 'roll-refused', reason: value.reason as RollRefusal } : null;
}
