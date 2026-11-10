/**
 * Dice rules as collections stored them before dice sets, and as sets keep
 * their critical and exploding rules: checking and comparing them. Which set a
 * collection rolls is `collectionDiceSet`'s.
 */

import type { CritRule, DiceRules, ExplodeRule, ExplodeScope } from '../types/diceRulesTypes';

/** Dice of a collection without a game system: a d20, natural 20 and natural 1. */
export const DEFAULT_DICE_RULES: Readonly<DiceRules> = { defaultRoll: '1d20', crit: 'natural' };

export const CRIT_RULES: readonly CritRule[] = ['natural', 'roll-under', 'doubles', 'high-total', 'none'];

export const EXPLODE_SCOPES: readonly ExplodeScope[] = ['default', 'all'];

/** What a collection starts from when its dice are switched to explode: the highest face, again and again. */
export const DEFAULT_EXPLODE_RULE: Readonly<ExplodeRule> = { dice: 'all', repeats: true, highFaces: 1, lowFaces: 0 };

/** The most faces of a die a rule may name; the roll leaves every die one face that does not explode. */
export const MAX_EXPLODING_FACES = 99;

/** Whether `value` is a number of faces a rule may name: whole, from `least` to the most a rule allows. */
export function isFaceCount(value: unknown, least: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= least && value <= MAX_EXPLODING_FACES;
}

/** A stored exploding rule, or null when it is none: such dice do not explode. */
export function parseExplodeRule(raw: unknown): ExplodeRule | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { dice, repeats, highFaces, lowFaces } = raw as Record<string, unknown>;
  if (!EXPLODE_SCOPES.includes(dice as ExplodeScope) || typeof repeats !== 'boolean') return null;
  if (!isFaceCount(highFaces, 1) || !isFaceCount(lowFaces, 0)) return null;
  return { dice: dice as ExplodeScope, repeats, highFaces, lowFaces };
}

/** What the settings offer for exploding dice: none, or the dice that explode. */
export type ExplodeChoice = ExplodeScope | 'off';

/**
 * The dice rules with exploding switched off, or set to the given dice. A rule
 * already there keeps its other settings; a new one starts from the default.
 */
export function withExplodeScope(dice: DiceRules, choice: ExplodeChoice): DiceRules {
  const { explode, ...rest } = dice;
  if (choice === 'off') return rest;
  return { ...rest, explode: { ...(explode ?? DEFAULT_EXPLODE_RULE), dice: choice } };
}

function sameExplodeRule(a: ExplodeRule | undefined, b: ExplodeRule | undefined): boolean {
  if (!a || !b) return a === b;
  return a.dice === b.dice && a.repeats === b.repeats && a.highFaces === b.highFaces && a.lowFaces === b.lowFaces;
}

/** 1 to 99 dice of 2 to 999 sides, e.g. `1d20`, `2d12` or `d100`. */
const DEFAULT_ROLL = /^([1-9]\d?)?d([2-9]|[1-9]\d{1,2})$/i;

/** Count and sides of a default roll such as `2d12`; null when it is not one valid dice group. */
export function parseDefaultRoll(defaultRoll: string): { count: number; sides: number } | null {
  const match = DEFAULT_ROLL.exec(defaultRoll.trim());
  return match ? { count: Number(match[1] ?? '1'), sides: Number(match[2]) } : null;
}

export function isValidDefaultRoll(value: string): boolean {
  return parseDefaultRoll(value) !== null;
}

export function sameDiceRules(a: DiceRules | undefined, b: DiceRules | undefined): boolean {
  const left = a ?? DEFAULT_DICE_RULES;
  const right = b ?? DEFAULT_DICE_RULES;
  return left.defaultRoll.trim().toLowerCase() === right.defaultRoll.trim().toLowerCase()
    && left.crit === right.crit
    && sameExplodeRule(left.explode, right.explode);
}
