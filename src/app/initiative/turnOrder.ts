/**
 * Turns of a fight in turn order, without the store: the combatant whose turn comes next or came
 * before, passing by those that do not act (`actsInTurn`), and a delayed turn taken up again.
 */

import type { InitiativeEntry, InitiativeState } from '../types/initiativeTypes';
import { actsInTurn, backToRoundBefore, beginRound, canStillAct, type RoundChanges } from './rounds';
import { tieBreakModifier } from './tieBreak';
import { setInitiative } from './awaitingInitiative';

/** Updates every entry's `order` to its place in the list. */
export function renumber(entries: InitiativeEntry[]): void {
  entries.forEach((entry, index) => { entry.order = index; });
}

/** The place of the combatant with the turn; where none has it, the place the turn was last at. */
function turnIndex(initiative: InitiativeState): number {
  const index = initiative.entries.findIndex((entry) => entry.isActive);
  return index === -1 ? initiative.currentIndex : index;
}

/** The turn goes to the combatant at `index`, and to nobody else. */
export function giveTurn(initiative: InitiativeState, index: number): void {
  initiative.entries.forEach((entry, at) => { entry.isActive = at === index; });
  initiative.currentIndex = index;
}

/** The first combatant in the order that acts takes the turn as a fight in turn order starts; the first of all where none does. */
export function firstTurn(initiative: InitiativeState, defeated: ReadonlySet<string>): void {
  giveTurn(initiative, Math.max(initiative.entries.findIndex((entry) => actsInTurn(entry, defeated)), 0));
}

/**
 * The turn of the next combatant that acts; past the last one a new round begins (and `rounds`
 * hears of it). Nothing moves while nobody can act in any round.
 */
export function nextOrderTurn(initiative: InitiativeState, defeated: ReadonlySet<string>, rounds?: RoundChanges): void {
  const { entries } = initiative;
  if (!entries.some((entry) => canStillAct(entry, defeated))) return;
  let index = turnIndex(initiative);
  // A new round clears every mark, so within two passes a combatant that can act has come
  for (let step = 0; step < 2 * entries.length; step++) {
    index++;
    if (index >= entries.length) {
      index = 0;
      beginRound(initiative);
      rounds?.began(initiative);
    }
    if (actsInTurn(entries[index]!, defeated)) return giveTurn(initiative, index);
  }
}

/**
 * The turn of the combatant before that acts; back past the first one into the round before,
 * whose marks come back. In round 1 the turn goes round to the last combatant.
 */
export function previousOrderTurn(initiative: InitiativeState, defeated: ReadonlySet<string>, rounds?: RoundChanges): void {
  const { entries } = initiative;
  if (!entries.some((entry) => canStillAct(entry, defeated))) return;
  let index = turnIndex(initiative);
  for (let step = 0; step < 2 * entries.length; step++) {
    index--;
    if (index < 0) {
      index = entries.length - 1;
      if (initiative.round > 1) {
        backToRoundBefore(initiative);
        rounds?.steppedBack(initiative);
      }
    }
    if (actsInTurn(entries[index]!, defeated)) return giveTurn(initiative, index);
  }
}

/**
 * A combatant leaves the fight. Had it the turn in a running fight in turn order, the turn passes
 * on as if it had ended (`nextOrderTurn`); otherwise the combatant now at its place takes the mark.
 */
export function removeCombatant(initiative: InitiativeState, id: string, defeated: ReadonlySet<string>, rounds?: RoundChanges): void {
  const { entries } = initiative;
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  const hadTurn = entries[index]!.isActive;
  entries.splice(index, 1);
  renumber(entries);
  if (!hadTurn || entries.length === 0) return;
  if (initiative.isActive && !initiative.sides) {
    initiative.currentIndex = index - 1;
    nextOrderTurn(initiative, defeated, rounds);
    return;
  }
  giveTurn(initiative, Math.min(index, entries.length - 1));
}

/**
 * A combatant delays: it leaves the order and waits. Was it its turn, the turn passes on to the
 * next combatant that acts.
 */
export function delayTurn(initiative: InitiativeState, id: string, defeated: ReadonlySet<string>): void {
  const index = initiative.entries.findIndex((entry) => entry.id === id);
  const entry = initiative.entries[index];
  if (!entry || entry.delayed) return;
  entry.delayed = true;
  if (!entry.isActive) return;
  entry.isActive = false;
  initiative.currentIndex = index;
  nextOrderTurn(initiative, defeated);
}

/**
 * A delayed combatant acts now: it takes its place right before the combatant whose turn it is,
 * with that combatant's number and tie-break (`tieBreak`), so a later sort keeps it there, and
 * takes the turn. With nobody else's turn it acts from where it is.
 */
export function actNow(initiative: InitiativeState, id: string): void {
  const { entries } = initiative;
  const from = entries.findIndex((entry) => entry.id === id);
  const entry = entries[from];
  if (!entry?.delayed) return;
  delete entry.delayed;
  const current = entries.find((other) => other.isActive && other !== entry);
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
