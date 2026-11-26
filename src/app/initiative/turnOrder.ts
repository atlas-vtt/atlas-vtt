/**
 * Turns of a fight in turn order, without the store: the combatant whose turn comes next or came
 * before, passing by those that do not act (`actsInTurn`), and a delayed turn taken up again.
 * The turn is the one entry that carries `isActive` in a running fight with combatants; it holds
 * the turn unless it delayed, which leaves the turn waiting at it while nobody else can act.
 */

import type { InitiativeEntry, InitiativeState } from '../types/initiativeTypes';
import { actsInTurn, backToRoundBefore, beginRound, canStillAct, type RoundChanges } from './rounds';
import { tieBreakModifier } from './tieBreak';
import { setInitiative } from './awaitingInitiative';

/** How turns in order read a fight: who is defeated, and what a round's boundary does. */
export interface OrderTurns {
  /** The entry ids of the defeated combatants (`defeatedCombatants`). */
  readonly defeated: ReadonlySet<string>;
  readonly rounds: RoundChanges;
}

/** Updates every entry's `order` to its place in the list. */
export function renumber(entries: InitiativeEntry[]): void {
  entries.forEach((entry, index) => { entry.order = index; });
}

/** The place of the entry that carries the turn; -1 where none does. */
function turnIndex(initiative: InitiativeState): number {
  return initiative.entries.findIndex((entry) => entry.isActive);
}

/** The turn goes to the combatant at `index`, and to nobody else. */
export function giveTurn(initiative: InitiativeState, index: number): void {
  initiative.entries.forEach((entry, at) => { entry.isActive = at === index; });
}

/** The first combatant in the order that acts takes the turn as a fight in turn order starts; the first of all where none does. */
export function firstTurn(initiative: InitiativeState, defeated: ReadonlySet<string>): void {
  giveTurn(initiative, Math.max(initiative.entries.findIndex((entry) => actsInTurn(entry, defeated)), 0));
}

/** Whether some combatant can act in some round (`canStillAct`). */
function someoneCanAct(initiative: InitiativeState, defeated: ReadonlySet<string>): boolean {
  return initiative.entries.some((entry) => canStillAct(entry, defeated));
}

/** The turn of the next combatant after the place `from` that acts; past the last one a new round begins. */
function passTurn(initiative: InitiativeState, from: number, { defeated, rounds }: OrderTurns): void {
  const { entries } = initiative;
  let index = from;
  // A new round clears every mark, so within two passes a combatant that can act has come
  for (let step = 0; step < 2 * entries.length; step++) {
    index++;
    if (index >= entries.length) {
      index = 0;
      beginRound(initiative);
      rounds.began(initiative);
    }
    if (actsInTurn(entries[index]!, defeated)) return giveTurn(initiative, index);
  }
}

/**
 * The turn of the next combatant that acts; past the last one a new round begins (and `rounds`
 * hears of it). Nothing moves while nobody can act in any round.
 */
export function nextOrderTurn(initiative: InitiativeState, turns: OrderTurns): void {
  if (someoneCanAct(initiative, turns.defeated)) passTurn(initiative, turnIndex(initiative), turns);
}

/**
 * The turn of the combatant before that acts; back past the first one into the round before,
 * whose marks come back. In round 1 the turn goes round to the last combatant.
 */
export function previousOrderTurn(initiative: InitiativeState, { defeated, rounds }: OrderTurns): void {
  const { entries } = initiative;
  if (!someoneCanAct(initiative, defeated)) return;
  let index = turnIndex(initiative);
  for (let step = 0; step < 2 * entries.length; step++) {
    index--;
    if (index < 0) {
      index = entries.length - 1;
      if (initiative.round > 1) {
        backToRoundBefore(initiative);
        rounds.steppedBack(initiative);
      }
    }
    if (actsInTurn(entries[index]!, defeated)) return giveTurn(initiative, index);
  }
}

/**
 * A combatant leaves the fight. Had it the turn in a running fight in turn order, the turn passes
 * on as if it had ended (`nextOrderTurn`); otherwise, and while nobody can act, the combatant now
 * at its place takes it, so a fight keeps one.
 */
export function removeCombatant(initiative: InitiativeState, id: string, turns: OrderTurns): void {
  const { entries } = initiative;
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  const hadTurn = entries[index]!.isActive;
  entries.splice(index, 1);
  renumber(entries);
  if (!hadTurn || entries.length === 0) return;
  if (initiative.isActive && !initiative.sides && someoneCanAct(initiative, turns.defeated)) passTurn(initiative, index - 1, turns);
  else giveTurn(initiative, Math.min(index, entries.length - 1));
}

/**
 * A combatant delays: it leaves the order and waits. Was it its turn, the turn passes on to the
 * next combatant that acts, as Next turn would: past the last one a new round begins. While
 * nobody else can act, the turn waits at it.
 */
export function delayTurn(initiative: InitiativeState, id: string, turns: OrderTurns): void {
  const entry = initiative.entries.find((candidate) => candidate.id === id);
  if (!entry || entry.delayed) return;
  entry.delayed = true;
  if (entry.isActive) nextOrderTurn(initiative, turns);
}

/**
 * A delayed combatant acts now: it takes its place right before the combatant whose turn it is,
 * with that combatant's number and tie-break (`tieBreak`), so a later sort keeps it there, and
 * takes the turn. With nobody else's turn it acts from where it is. By sides the turn is a
 * side's: it only stops waiting.
 */
export function actNow(initiative: InitiativeState, id: string): void {
  const { entries } = initiative;
  const from = entries.findIndex((entry) => entry.id === id);
  const entry = entries[from];
  if (!entry?.delayed) return;
  delete entry.delayed;
  if (initiative.sides) return;
  const current = entries.find((other) => other.isActive && !other.delayed && other !== entry);
  if (current) {
    entries.splice(from, 1);
    entries.splice(entries.indexOf(current), 0, entry);
    setInitiative(entry, current.initiative);
    entry.tieBreak = tieBreakModifier(current);
    renumber(entries);
  }
  giveTurn(initiative, entries.indexOf(entry));
}

/** Every delayed combatant takes its place in the order again, as a fight starts or ends. */
export function endDelays(initiative: InitiativeState): void {
  for (const entry of initiative.entries) delete entry.delayed;
}
