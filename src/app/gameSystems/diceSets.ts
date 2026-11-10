/**
 * Dice sets as rolling reads them: the formula a set rolls, a collection's
 * dice rules read as a set, and the dice rules older versions of Atlas read
 * for a set.
 */

import type { DiceRules } from '../types/diceRulesTypes';
import type { DiceSetDie, RollingDice } from '../types/diceSetTypes';
import { DEFAULT_DICE_RULES } from './diceRules';

/** The most groups a set holds, e.g. a Sun and a Moon die are two. */
export const MAX_SET_GROUPS = 6;
/** The most dice a set rolls together: as many as the dice stage shows. */
export const MAX_SET_DICE = 20;
/** The most sides a set's die may have, as a default roll always allowed. */
export const MAX_SET_SIDES = 999;

/** The colours offered for a set's dice: bodies the numerals read on, apart from each other. */
export const DICE_SET_COLOURS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '#b91c1c', label: 'Crimson' },
  { value: '#ea580c', label: 'Orange' },
  { value: '#ca8a04', label: 'Gold' },
  { value: '#4d7c0f', label: 'Moss' },
  { value: '#0f766e', label: 'Teal' },
  { value: '#1d4ed8', label: 'Blue' },
  { value: '#4338ca', label: 'Indigo' },
  { value: '#7e22ce', label: 'Purple' },
  { value: '#be185d', label: 'Magenta' },
  { value: '#e7dcc3', label: 'Bone' },
  { value: '#64748b', label: 'Slate' },
  { value: '#1f1e21', label: 'Black' },
];

/** A colour a set may give its dice: `#rrggbb`. */
export function isDieColour(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/** `NdS`, written without the 1 of a single die: `d20`, `2d6`. */
export function groupNotation({ count, sides }: Pick<DiceSetDie, 'count' | 'sides'>): string {
  return `${count === 1 ? '' : count}d${sides}`;
}

/** The formula a set rolls for a bare bonus: its groups in order, `1d12+1d12`. */
export function setRoll(dice: readonly Pick<DiceSetDie, 'count' | 'sides'>[]): string {
  return dice.map(({ count, sides }) => `${count}d${sides}`).join('+');
}

/** The set's dice as people write them: `d20`, `2d10`, `d12 + d12`. */
export function setRollText(dice: readonly Pick<DiceSetDie, 'count' | 'sides'>[]): string {
  return dice.map(groupNotation).join(' + ');
}

const GROUP = /^([1-9]\d?)?d([2-9]|[1-9]\d{1,2})$/i;

/**
 * The groups of a default roll: one or more `NdS` joined by `+` (`1d20`, `2d12`,
 * `1d20+1d6`); null when any part is no dice group.
 */
export function parseRollGroups(defaultRoll: string): DiceSetDie[] | null {
  const parts = defaultRoll.replace(/\s+/g, '').split('+');
  const groups: DiceSetDie[] = [];
  for (const part of parts) {
    const match = GROUP.exec(part);
    if (!match) return null;
    groups.push({ count: Number(match[1] ?? '1'), sides: Number(match[2]) });
  }
  return groups.length > 0 ? groups : null;
}

/**
 * Rolling rules from either shape: a set's, or a collection's dice rules as
 * they were stored before sets, whose default roll gives the dice. A default
 * roll that is no dice group rolls the default d20.
 */
export function rollingRules(rules: DiceRules | RollingDice): RollingDice {
  if ('dice' in rules) return rules;
  const dice = parseRollGroups(rules.defaultRoll) ?? parseRollGroups(DEFAULT_DICE_RULES.defaultRoll)!;
  return { dice, crit: rules.crit, ...(rules.explode && { explode: rules.explode }) };
}

/**
 * What older versions of Atlas read for a set: its dice as one default roll
 * (`2d12` where every group has the same die, else the groups joined, which
 * they roll but never call critical), its critical rule and exploding dice.
 */
export function diceRulesOfSet(set: RollingDice): DiceRules {
  const [first] = set.dice;
  const sameDie = first !== undefined && set.dice.every((group) => group.sides === first.sides);
  const total = set.dice.reduce((sum, group) => sum + group.count, 0);
  const defaultRoll = sameDie ? `${total}d${first.sides}` : setRoll(set.dice);
  return { defaultRoll, crit: set.crit, ...(set.explode && { explode: { ...set.explode } }) };
}

/** Whether two sets roll alike: the same dice in the same order, critical rule and exploding dice. Names and colours do not count. */
export function sameRolling(a: RollingDice, b: RollingDice): boolean {
  const sameDice = a.dice.length === b.dice.length
    && a.dice.every((group, i) => group.count === b.dice[i]!.count && group.sides === b.dice[i]!.sides);
  const ea = a.explode;
  const eb = b.explode;
  const sameExplode = !ea || !eb ? ea === eb
    : ea.dice === eb.dice && ea.repeats === eb.repeats && ea.highFaces === eb.highFaces && ea.lowFaces === eb.lowFaces;
  return sameDice && a.crit === b.crit && sameExplode;
}

/** Whether a set's dice wear a name or colour, which a plain default roll cannot say. */
export function dressed(set: RollingDice): boolean {
  return set.dice.some((group) => group.name !== undefined || group.colour !== undefined);
}
