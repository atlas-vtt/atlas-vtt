/**
 * Reading a dice set from its file: everything is checked, nothing taken for
 * granted, since the file may come from another device, a newer Atlas or a
 * hand edit. A set that cannot roll is none.
 */

import type { CritRule } from '../types/diceRulesTypes';
import type { AdvantageRule, DiceSet, DiceSetDie } from '../types/diceSetTypes';
import { BUILT_IN_DICE_SET_PREFIX } from './builtInDiceSets';
import { CRIT_RULES, parseExplodeRule } from './diceRules';
import { MAX_SET_DICE, MAX_SET_GROUPS, MAX_SET_SIDES, isDieColour } from './diceSets';

/** The format of a dice set file; a set of a later one is read and never written. */
export const DICE_SET_FORMAT = 1;
/** The longest name of a set or of a die. */
export const MAX_DICE_NAME_LENGTH = 40;
/** The largest number advantage adds (or disadvantage subtracts). */
export const MAX_ADVANTAGE_NUMBER = 99;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isWhole(value: unknown, least: number, most: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= least && value <= most;
}

/** A name as stored: trimmed and short enough; null for none. */
export function cleanDiceName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name && name.length <= MAX_DICE_NAME_LENGTH ? name : null;
}

/** One group of dice, or null when it is none: a name or colour it cannot use is left out. */
export function parseSetDie(raw: unknown): DiceSetDie | null {
  if (!isRecord(raw) || !isWhole(raw.count, 1, MAX_SET_DICE) || !isWhole(raw.sides, 2, MAX_SET_SIDES)) return null;
  const name = cleanDiceName(raw.name);
  return {
    count: raw.count,
    sides: raw.sides,
    ...(name && { name }),
    ...(isDieColour(raw.colour) && { colour: raw.colour.toLowerCase() }),
  };
}

/**
 * What advantage or disadvantage does, or null when it is no rule this Atlas
 * can roll. Fields it does not know are left out; the file keeps them.
 */
export function parseAdvantageRule(raw: unknown): AdvantageRule | null {
  if (!isRecord(raw)) return null;
  switch (raw.kind) {
    case 'keep':
      return { kind: 'keep', ...(raw.tensOnly === true && { tensOnly: true as const }) };
    case 'number':
      return isWhole(raw.value, 1, MAX_ADVANTAGE_NUMBER) ? { kind: 'number', value: raw.value } : null;
    case 'die': {
      const die = parseSetDie({ ...raw, count: 1 });
      if (!die) return null;
      const { count: _count, ...look } = die;
      return { kind: 'die', ...look };
    }
    default:
      return null;
  }
}

/** The dice of a set, or null when they cannot roll together: none, too many groups, too many dice, or one that is none. */
export function parseSetDice(raw: unknown): DiceSetDie[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SET_GROUPS) return null;
  const dice = raw.map(parseSetDie);
  if (dice.some((die) => die === null)) return null;
  const groups = dice as DiceSetDie[];
  return groups.reduce((sum, group) => sum + group.count, 0) <= MAX_SET_DICE ? groups : null;
}

/** A set stored in the vault, or null when it is none: no id or name, a built-in's id, dice that cannot roll. */
export function parseStoredDiceSet(raw: unknown): DiceSet | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id.trim() || raw.id.startsWith(BUILT_IN_DICE_SET_PREFIX)) return null;
  const name = cleanDiceName(raw.name);
  const dice = parseSetDice(raw.dice);
  if (!name || !dice || !CRIT_RULES.includes(raw.crit as CritRule)) return null;
  const explode = raw.explode === undefined ? null : parseExplodeRule(raw.explode);
  // An exploding rule this Atlas cannot read would roll the set otherwise than the file says.
  if (raw.explode !== undefined && !explode) return null;
  const advantage = raw.advantage === undefined ? null : parseAdvantageRule(raw.advantage);
  const disadvantage = raw.disadvantage === undefined ? null : parseAdvantageRule(raw.disadvantage);
  // A rule this Atlas cannot read still rolls the set as written; the set is only kept from being written over.
  const unread = (raw.advantage !== undefined && !advantage) || (raw.disadvantage !== undefined && !disadvantage);
  const newer = unread || (typeof raw.format === 'number' && raw.format > DICE_SET_FORMAT);
  return {
    id: raw.id,
    name,
    builtIn: false,
    dice,
    crit: raw.crit as CritRule,
    ...(explode && { explode }),
    ...(advantage && { advantage }),
    ...(disadvantage && { disadvantage }),
    ...(newer && { readOnly: true as const }),
  };
}
