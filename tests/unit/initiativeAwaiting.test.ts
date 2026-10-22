import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createInitiativeActions } from '../../src/app/stores/initiativeSlice';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { TokenEntity } from '../../src/app/types';

const waiting = (id: string): InitiativeEntry => ({
  id, tokenId: id, name: id, initiative: 0, awaitingInitiative: true, initiativeModifier: 0, imagePath: '', isNPC: true, order: 0, isActive: false,
});

function setup(): { actions: ReturnType<typeof createInitiativeActions>; entry: (id: string) => InitiativeEntry | undefined } {
  let state = { initiative: { ...createDefaultInitiativeState(), entries: [waiting('a'), waiting('b')] }, initiativeTrackerOpen: false, objects: { tokens: {} as Record<string, TokenEntity> } };
  const actions = createInitiativeActions((recipe) => { state = produce(state, recipe); }, 'awaiting', () => state, () => 0);
  return { actions, entry: (id) => state.initiative.entries.find((candidate) => candidate.id === id) };
}

describe('a combatant waiting for its initiative', () => {
  it('stops waiting once its number is typed, a 0 included', () => {
    const { actions, entry } = setup();
    actions.updateInitiativeEntry('a', { initiative: 0 });
    expect(entry('a')?.awaitingInitiative).toBeUndefined();
    expect(entry('b')?.awaitingInitiative).toBe(true);
  });

  it('keeps waiting while only its modifier changes', () => {
    const { actions, entry } = setup();
    actions.updateInitiativeEntry('a', { initiativeModifier: 3, modifierByHand: true });
    expect(entry('a')?.awaitingInitiative).toBe(true);
  });

  it('stops waiting once rolled, alone or with everyone', () => {
    const one = setup();
    one.actions.rollEntryInitiative('a', '1d20');
    expect(one.entry('a')?.awaitingInitiative).toBeUndefined();
    expect(one.entry('b')?.awaitingInitiative).toBe(true);

    const all = setup();
    all.actions.rollAllInitiative('1d20');
    expect([all.entry('a')?.awaitingInitiative, all.entry('b')?.awaitingInitiative]).toEqual([undefined, undefined]);
  });
});
