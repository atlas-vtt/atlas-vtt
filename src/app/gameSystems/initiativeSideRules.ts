/**
 * The sides of a fight by sides: the collection's list of sides in the order they act, and the
 * dice they roll for that order. Read, checked and compared here.
 */

import type { InitiativeRules, InitiativeSide, SideId, SideRef } from '../types/initiativeRulesTypes';
import { isValidDefaultRoll } from './diceRules';

/** The two sides every collection has, in their default order. */
export const BUILT_IN_SIDES: readonly InitiativeSide[] = ['players', 'opponents'];

/** At most this many sides fight, the built-in two included. */
export const MAX_SIDES = 8;

/** A named side's name is at most this long. */
export const MAX_SIDE_NAME = 40;

export function isBuiltInSide(id: SideId): id is InitiativeSide {
  return BUILT_IN_SIDES.includes(id as InitiativeSide);
}

/** The built-in side that is not `side`. */
export function otherSide(side: InitiativeSide): InitiativeSide {
  return side === 'players' ? 'opponents' : 'players';
}

/** The sides as a collection without a list of its own has them: `first`, then the other. */
export function defaultSides(first: InitiativeSide): SideRef[] {
  return [{ id: first }, { id: otherSide(first) }];
}

/** Every side of `rules` in the order they act. */
export function sidesOfRules(rules: Pick<InitiativeRules, 'firstSide' | 'sides'>): SideRef[] {
  return rules.sides ?? defaultSides(rules.firstSide);
}

/** Of the players and the opponents, the one that comes first in `sides`. */
export function firstBuiltInSide(sides: readonly SideRef[]): InitiativeSide {
  return (sides.find((side) => isBuiltInSide(side.id))?.id as InitiativeSide | undefined) ?? 'players';
}

function isDefaultList(sides: readonly SideRef[]): boolean {
  return sides.length === 2 && sides.every((side) => isBuiltInSide(side.id) && side.name === undefined);
}

/**
 * A stored list of sides: ids unique, named sides with a name, the built-in two always there (added
 * at the end where a list lacks one), at most `MAX_SIDES`. Undefined where it is no list.
 */
export function parseSideList(raw: unknown): SideRef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const sides: SideRef[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, name } = item as Record<string, unknown>;
    if (typeof id !== 'string' || id.trim() === '' || id.length > 64 || sides.some((side) => side.id === id)) continue;
    if (isBuiltInSide(id)) {
      sides.push({ id });
      continue;
    }
    const trimmed = typeof name === 'string' ? name.trim().slice(0, MAX_SIDE_NAME) : '';
    if (trimmed !== '') sides.push({ id, name: trimmed });
  }
  for (const id of BUILT_IN_SIDES) if (!sides.some((side) => side.id === id)) sides.push({ id });
  const named = sides.filter((side) => !isBuiltInSide(side.id)).slice(0, MAX_SIDES - BUILT_IN_SIDES.length);
  return sides.filter((side) => isBuiltInSide(side.id) || named.includes(side));
}

/**
 * The sides of stored rules: the list read with `parseSideList` and the first of the built-in two in
 * it, or `firstSide` without a list. A list of the built-in two alone says no more than `firstSide`
 * and is left out.
 */
export function sideParts(rawSides: unknown, firstSide: InitiativeSide): Pick<InitiativeRules, 'firstSide' | 'sides'> {
  const sides = parseSideList(rawSides);
  if (!sides) return { firstSide };
  const first = firstBuiltInSide(sides);
  return isDefaultList(sides) ? { firstSide: first } : { firstSide: first, sides };
}

/** The dice each side rolls at a round's start, trimmed; undefined where none or not one group of dice. */
export function parseSideRoll(raw: unknown): string | undefined {
  return typeof raw === 'string' && isValidDefaultRoll(raw) ? raw.trim() : undefined;
}

/** Whether a list of sides being edited can be saved: every named side has a name. */
export function areSidesValid(sides: readonly SideRef[] | undefined): boolean {
  return (sides ?? []).every((side) => isBuiltInSide(side.id) || (side.name ?? '').trim() !== '');
}

/** The side parts of rules as they are stored: the list read again (and the first built-in side in it), the roll trimmed. */
export function savedSideParts(rules: InitiativeRules): Pick<InitiativeRules, 'firstSide' | 'sides' | 'sideRoll'> {
  const sideRoll = parseSideRoll(rules.sideRoll);
  return { ...sideParts(rules.sides, rules.firstSide), ...(sideRoll && { sideRoll }) };
}

function sideKey(rules: Pick<InitiativeRules, 'firstSide' | 'sides'>): string {
  return sidesOfRules(rules).map((side) => `${side.id}:${side.name?.trim() ?? ''}`).join('|');
}

/** Whether two rules have the same sides in the same order and roll the same dice for it; unset lists read as `firstSide`'s. */
export function sameSideParts(a: InitiativeRules, b: InitiativeRules): boolean {
  return sideKey(a) === sideKey(b)
    && (a.sideRoll?.trim().toLowerCase() ?? '') === (b.sideRoll?.trim().toLowerCase() ?? '');
}

/** Whether two rules' sides are the same as typed: a space is a difference. */
export function sameTypedSideParts(a: InitiativeRules, b: InitiativeRules): boolean {
  const typed = (rules: InitiativeRules): string => sidesOfRules(rules).map((side) => `${side.id}:${side.name ?? ''}`).join('|');
  return typed(a) === typed(b) && (a.sideRoll ?? '') === (b.sideRoll ?? '');
}

/** An id for a new named side, unlike every id in `taken`. Ids never change once given: tokens store them. */
export function newSideId(taken: readonly SideId[], random: () => number = Math.random): SideId {
  for (;;) {
    const id = `side-${Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0')}`;
    if (!taken.includes(id)) return id;
  }
}
