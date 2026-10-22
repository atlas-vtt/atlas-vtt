import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createInitiativeActions } from '../../src/app/stores/initiativeSlice';
import { byInitiative } from '../../src/app/initiative/tieBreak';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { TokenEntity } from '../../src/app/types';

function entry(id: string, extra: Partial<InitiativeEntry> = {}): InitiativeEntry {
  return { id, tokenId: id, name: id, initiative: 0, initiativeModifier: 0, imagePath: '', isNPC: false, order: 0, isActive: false, ...extra };
}

/** Initiative actions over `entries` whose dice always show `face` on a d20. */
function setup(entries: InitiativeEntry[], face = 10) {
  let state = { initiative: { ...createDefaultInitiativeState(), entries }, initiativeTrackerOpen: false, objects: { tokens: {} as Record<string, TokenEntity> } };
  const actions = createInitiativeActions((recipe) => { state = produce(state, recipe); }, 'tie-break', () => state, () => (face - 1) / 20);
  return { actions, get: () => state };
}

const order = (entries: readonly InitiativeEntry[]): string[] => entries.map((e) => e.id);

describe('equal initiative totals', () => {
  it('go by the modifier the roll added: the GM\'s own, else the statblock\'s', () => {
    // Every die shows 13. a: no modifier, b: +3 from its statblock, c: +1 of the GM's own
    const { actions, get } = setup([entry('a'), entry('b'), entry('c', { initiativeModifier: 1, modifierByHand: true })], 13);
    actions.rollAllInitiative('1d20', new Map([['b', 3]]));
    expect(get().initiative.entries.map((e) => [e.id, e.initiative, e.rolledModifier])).toEqual([['b', 16, 3], ['c', 14, 1], ['a', 13, 0]]);
    // Totals made equal by hand: the modifiers decide
    actions.updateInitiativeEntry('a', { initiative: 14 });
    actions.updateInitiativeEntry('b', { initiative: 14 });
    expect(order(get().initiative.entries)).toEqual(['b', 'c', 'a']);
  });

  it('keep the order they had where the modifiers are equal too, for the GM to drag', () => {
    const { actions, get } = setup([entry('a', { initiative: 5 }), entry('b', { initiative: 9 }), entry('c', { initiative: 5 })]);
    actions.reorderInitiative(2, 0);
    expect(order(get().initiative.entries)).toEqual(['c', 'a', 'b']);
    actions.updateInitiativeEntry('b', { initiative: 5 });
    expect(order(get().initiative.entries)).toEqual(['c', 'a', 'b']);
    expect(get().initiative.entries.map((e) => e.order)).toEqual([0, 1, 2]);
  });

  it('prefer a modifier the GM set since the roll', () => {
    const tied = [entry('a', { initiative: 12, rolledModifier: 4 }), entry('b', { initiative: 12, rolledModifier: 2, initiativeModifier: 6, modifierByHand: true })];
    expect([...tied].sort(byInitiative).map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('one combatant rolled while the fight runs', () => {
  it('re-sorts with Auto sort on and keeps the turn with the combatant that has it', () => {
    const { actions, get } = setup([entry('a', { initiative: 15 }), entry('b', { initiative: 10 }), entry('c', { initiative: 5 })], 18);
    actions.startCombat();
    actions.nextTurn();
    expect(get().initiative.currentIndex).toBe(1);
    actions.rollEntryInitiative('c');
    expect(order(get().initiative.entries)).toEqual(['c', 'a', 'b']);
    expect(get().initiative.currentIndex).toBe(2);
    actions.nextTurn();
    expect(get().initiative.entries.find((e) => e.isActive)?.id).toBe('c');
    expect(get().initiative.round).toBe(2);
  });

  it('stays in place with Auto sort off', () => {
    const { actions, get } = setup([entry('a', { initiative: 15 }), entry('b', { initiative: 10 })], 18);
    actions.setInitiativeConfig({ autoSort: false });
    actions.rollEntryInitiative('b');
    expect(get().initiative.entries.map((e) => [e.id, e.initiative])).toEqual([['a', 15], ['b', 18]]);
  });
});
