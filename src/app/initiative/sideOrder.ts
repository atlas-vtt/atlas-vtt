/**
 * The order the sides of a fight act in within a round: the fight's own order, or the order of
 * this round's rolls, where sides with equal rolls act at the same time.
 */

import { defaultSides, isBuiltInSide } from '../gameSystems/initiativeSideRules';
import type { SideId } from '../types/initiativeRulesTypes';
import type { SidesFight } from '../types/initiativeTypes';
import { rollInitiativeDice } from './initiativeDice';

function orderIds(fight: SidesFight): SideId[] {
  return (fight.order ?? defaultSides(fight.first)).map((side) => side.id);
}

/**
 * The turns of `round`: groups of sides that act at once, in the order they act. Without rolls
 * every side is a turn of its own in the fight's order; with them the highest roll comes first,
 * equal rolls share a turn, and a side without a roll comes last in the fight's order.
 */
export function roundTurns(fight: SidesFight, round: number): SideId[][] {
  const ids = orderIds(fight);
  const rolls = fight.roll ? fight.rolls?.[round] : undefined;
  if (!rolls) return ids.map((id) => [id]);
  const score = (id: SideId): number => rolls[id] ?? -Infinity;
  const sorted = [...ids].sort((a, b) => score(b) - score(a));
  const turns: SideId[][] = [];
  for (const id of sorted) {
    const last = turns[turns.length - 1];
    if (last && score(last[0]!) === score(id) && Number.isFinite(score(id))) last.push(id);
    else turns.push([id]);
  }
  return turns;
}

/** The sides that have the turn: the turn holding the active side. */
export function activeSides(fight: SidesFight, round: number): SideId[] {
  return roundTurns(fight, round).find((turn) => turn.includes(fight.active)) ?? [fight.active];
}

/** A roll of `roll` for every side of the fight, by side. */
export function rollSides(ids: readonly SideId[], roll: string, random: () => number): Record<SideId, number> {
  return Object.fromEntries(ids.map((id) => [id, rollInitiativeDice(roll, random)]));
}

/** The sides `fight` rolls for, in its order. */
export function fightSideIds(fight: SidesFight): SideId[] {
  return orderIds(fight);
}

/**
 * A round begins or is taken up again: where the order is rolled and `round` has no rolls yet,
 * it takes `fresh` (rolled before, so the store's write stays free of chance). Where the round has
 * rolls, `first` becomes the built-in side that leads it, so an older Atlas, which goes by `first`
 * alone, gives the players and the opponents their turns in this round's order.
 */
export function enterSideRound(fight: SidesFight, round: number, fresh: Record<SideId, number> | undefined): void {
  if (fight.roll && fresh && !fight.rolls?.[round]) fight.rolls = { ...fight.rolls, [round]: fresh };
  if (!fight.roll || !fight.rolls?.[round]) return;
  const lead = roundTurns(fight, round).flat().find(isBuiltInSide);
  if (lead) fight.first = lead;
}
