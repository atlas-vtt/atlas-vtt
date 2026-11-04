/**
 * Turns of a fight by sides, without the store: the sides act in turns, one side or several at
 * once (equal rolls), in the fight's order or this round's rolled order.
 */

import { isBuiltInSide } from '../gameSystems/initiativeSideRules';
import type { SideId } from '../types/initiativeRulesTypes';
import type { InitiativeEntry, InitiativeState, SidesFight } from '../types/initiativeTypes';
import { actsInTurn, backToRoundBefore, beginRound, canStillAct } from './rounds';
import { enterSideRound, fightSideIds, roundTurns } from './sideOrder';

/** How a fight by sides reads its combatants: the side each fights on, and who is defeated. */
export interface SideTurnInputs {
  sideOf: (entry: InitiativeEntry) => SideId;
  defeated: ReadonlySet<string>;
  /** A roll for every side, rolled before the write: taken by a round that begins without rolls of its own. */
  fresh?: Record<SideId, number>;
}

/**
 * Whether a side takes its turn: the players or the opponents without combatants in the tracker
 * always do (the GM may track only one side), a named side without combatants never, and a side
 * with combatants only while one of them `acts`.
 */
function sideActs(initiative: InitiativeState, side: SideId, inputs: SideTurnInputs, acts = actsInTurn): boolean {
  const members = initiative.entries.filter((entry) => inputs.sideOf(entry) === side);
  return members.length === 0 ? isBuiltInSide(side) : members.some((entry) => acts(entry, inputs.defeated));
}

function turnActs(initiative: InitiativeState, turn: readonly SideId[], inputs: SideTurnInputs): boolean {
  return turn.some((side) => sideActs(initiative, side, inputs));
}

/** Whether some side can take a turn in some round: marks clear when a round begins, defeats do not. */
function someSideCanAct(initiative: InitiativeState, fight: SidesFight, inputs: SideTurnInputs): boolean {
  return fightSideIds(fight).some((side) => sideActs(initiative, side, inputs, canStillAct));
}

function turnIndex(initiative: InitiativeState, fight: SidesFight): number {
  return roundTurns(fight, initiative.round).findIndex((turn) => turn.includes(fight.active));
}

/** One step: the next turn of the round; after the last a new round begins with its first. */
function stepForward(initiative: InitiativeState, fight: SidesFight, inputs: SideTurnInputs): SideId[] {
  const turns = roundTurns(fight, initiative.round);
  const next = turns[turnIndex(initiative, fight) + 1];
  if (next) {
    fight.active = next[0]!;
    return next;
  }
  beginRound(initiative);
  enterSideRound(fight, initiative.round, inputs.fresh);
  const first = roundTurns(fight, initiative.round)[0] ?? [fight.first];
  fight.active = first[0]!;
  return first;
}

/** The turns two rounds can hold: within two rounds every mark has cleared once. */
function stepLimit(fight: SidesFight): number {
  return 2 * fightSideIds(fight).length + 1;
}

/**
 * The next turn that acts; a turn whose sides' combatants are all defeated or sit the round out
 * is passed by. Nothing moves while no side can act in any round.
 */
export function nextSideTurn(initiative: InitiativeState, inputs: SideTurnInputs): void {
  const fight = initiative.sides;
  if (!fight || !someSideCanAct(initiative, fight, inputs)) return;
  for (let step = 0; step < stepLimit(fight); step++) {
    if (turnActs(initiative, stepForward(initiative, fight, inputs), inputs)) return;
  }
}

/** One step back: the turn before in the round, else the last turn of the round before, with its marks and rolls; none before round 1's first. */
function stepBack(initiative: InitiativeState, fight: SidesFight): SideId[] | undefined {
  const index = turnIndex(initiative, fight);
  let turn: SideId[] | undefined;
  if (index > 0) {
    turn = roundTurns(fight, initiative.round)[index - 1];
  } else if (initiative.round > 1) {
    backToRoundBefore(initiative);
    enterSideRound(fight, initiative.round, undefined);
    turn = roundTurns(fight, initiative.round).at(-1);
  }
  if (turn) fight.active = turn[0]!;
  return turn;
}

/** How many steps back the nearest turn that acts lies, walked on a copy; undefined where none does before round 1's first turn. */
function stepsBackToActingTurn(initiative: InitiativeState, inputs: SideTurnInputs): number | undefined {
  const trial = JSON.parse(JSON.stringify(initiative)) as InitiativeState;
  const fight = trial.sides!;
  for (let step = 1; step <= stepLimit(fight); step++) {
    const turn = stepBack(trial, fight);
    if (!turn) return undefined;
    if (turnActs(trial, turn, inputs)) return step;
  }
  return undefined;
}

/**
 * The turn before that acted, passing by turns nobody acts in (a named side without combatants
 * among them); back over a round's start into the round before, with its rolls. Where no turn
 * before acts, down to round 1's first, nothing moves, nor while no side can act.
 */
export function previousSideTurn(initiative: InitiativeState, inputs: SideTurnInputs): void {
  const fight = initiative.sides;
  if (!fight || !someSideCanAct(initiative, fight, inputs)) return;
  const steps = stepsBackToActingTurn(initiative, inputs);
  for (let step = 0; step < (steps ?? 0); step++) stepBack(initiative, fight);
}

/** Where a fight by sides starts: the first side of round 1 whose turn acts, else the first side. */
export function firstActingSide(initiative: InitiativeState, fight: SidesFight, inputs: SideTurnInputs): SideId {
  const turns = roundTurns(fight, initiative.round);
  return (turns.find((turn) => turnActs(initiative, turn, inputs)) ?? turns[0])?.[0] ?? fight.first;
}
