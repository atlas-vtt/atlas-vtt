import { produce } from 'immer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitiativeActions } from '../../src/app/stores/initiativeSlice';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { TokenEntity } from '../../src/app/types';

function entry(id: string, modifier = 0): InitiativeEntry {
  return { id, tokenId: id, name: id, initiative: 0, initiativeModifier: modifier, imagePath: '', isNPC: false, order: 0, isActive: false };
}

function setup(entries = [entry('a', 2), entry('b', -1)], values = [0, 0.99, 0.5, 0.25]) {
  let state = { initiative: { ...createDefaultInitiativeState(), entries }, initiativeTrackerOpen: false, objects: { tokens: {} as Record<string, TokenEntity> } };
  let insideRecipe = false;
  let index = 0;
  const random = vi.fn(() => {
    expect(insideRecipe, 'dice must be generated before the store recipe runs').toBe(false);
    return values[index++ % values.length]!;
  });
  const set = vi.fn<Parameters<typeof createInitiativeActions>[0]>((recipe) => {
    insideRecipe = true;
    try { state = produce(state, recipe); } finally { insideRecipe = false; }
  });
  const get = (): typeof state => state;
  const actions = createInitiativeActions(set, 'initiative-inputs', get, random);
  const ambient = vi.spyOn(Math, 'random');
  return { actions, random, set, get, ambient };
}

afterEach(() => vi.restoreAllMocks());

describe('initiative roll inputs', () => {
  it('rolls each die before one store update, adding each modifier once', () => {
    const { actions, random, set, get, ambient } = setup();
    actions.rollAllInitiative('2d6');
    expect(random).toHaveBeenCalledTimes(4);
    expect(ambient).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledOnce();
    expect(get().initiative.entries.map(e => [e.id, e.initiative, e.order])).toEqual([['a', 9, 0], ['b', 5, 1]]);
  });

  it('keeps input order when sorting is off, and sorts descending with stable ties when on', () => {
    const { actions, set, get } = setup([entry('a'), entry('b'), entry('c')], [0, 0.99, 0.99]);
    actions.setInitiativeConfig({ autoSort: false });
    set.mockClear();
    actions.rollAllInitiative('d6');
    expect(get().initiative.entries.map(e => [e.id, e.initiative])).toEqual([['a', 1], ['b', 6], ['c', 6]]);
    expect(set).toHaveBeenCalledOnce();
    actions.setInitiativeConfig({ autoSort: true });
    actions.rollAllInitiative('d6');
    expect(get().initiative.entries.map(e => [e.id, e.order])).toEqual([['b', 0], ['c', 1], ['a', 2]]);
  });

  it('rolls just the named entry without reordering during an active fight', () => {
    const { actions, random, set, get } = setup();
    actions.startCombat();
    set.mockClear();
    actions.rollEntryInitiative('b', '2d6');
    expect(random).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledOnce();
    expect(get().initiative.entries.map(e => [e.id, e.initiative])).toEqual([['a', 0], ['b', 6]]);
    expect(get().initiative.isActive).toBe(true);
  });

  it('does not generate dice for a missing entry or an empty tracker', () => {
    const { actions, random } = setup([]);
    actions.rollEntryInitiative('missing');
    actions.rollAllInitiative();
    expect(random).not.toHaveBeenCalled();
  });
});
