import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { rollInitiativeDice } from '../../src/app/initiative/turns';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const SIDES: InitiativeRules = { mode: 'sides', roll: '1d20', firstSide: 'players' };
const TURN_ORDER: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };

function fight(tokenIds: string[] = ['hero', 'goblin', 'rat']): ReturnType<typeof createViewAtlasStore> {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `turns-${Math.random()}`);
  store.setState({ persistenceEnabled: false });
  for (const tokenId of tokenIds) {
    store.getState().addToInitiative({ tokenId, name: tokenId, initiative: 0, initiativeModifier: 0, imagePath: '', isNPC: true });
  }
  return store;
}

const turn = (store: ReturnType<typeof createViewAtlasStore>): [number, string | undefined] =>
  [store.getState().initiative.round, store.getState().initiative.sides?.active];

describe('a fight by sides', () => {
  it('starts with the first side in round 1 and marks no single combatant', () => {
    const store = fight();
    store.getState().startCombat({ ...SIDES, firstSide: 'opponents' });
    expect(store.getState().initiative).toMatchObject({ isActive: true, round: 1, sides: { first: 'opponents', active: 'opponents' } });
    expect(store.getState().initiative.entries.some((entry) => entry.isActive)).toBe(false);
  });

  it('gives the turn to the other side, then starts the next round with the first', () => {
    const store = fight();
    store.getState().startCombat(SIDES);
    const seen = [turn(store)];
    for (let step = 0; step < 3; step++) { store.getState().nextTurn(); seen.push(turn(store)); }
    expect(seen).toEqual([[1, 'players'], [1, 'opponents'], [2, 'players'], [2, 'opponents']]);
  });

  it('steps back the same way and stops at the start of round 1', () => {
    const store = fight();
    store.getState().startCombat(SIDES);
    store.getState().nextTurn();
    store.getState().nextTurn();
    const seen = [turn(store)];
    for (let step = 0; step < 3; step++) { store.getState().previousTurn(); seen.push(turn(store)); }
    expect(seen).toEqual([[2, 'players'], [1, 'opponents'], [1, 'players'], [1, 'players']]);
  });

  it('lets a combatant sit a round out, until the round ends', () => {
    const store = fight();
    store.getState().startCombat(SIDES);
    const hero = store.getState().initiative.entries[0]!.id;
    store.getState().setInitiativeSitsOut(hero, true);
    store.getState().nextTurn();
    expect(store.getState().initiative.entries[0]).toMatchObject({ sitsOut: true });
    store.getState().nextTurn();
    expect(store.getState().initiative.entries[0]).not.toHaveProperty('sitsOut');
  });

  it('ends without a side or anyone sitting out', () => {
    const store = fight();
    store.getState().startCombat(SIDES);
    store.getState().setInitiativeSitsOut(store.getState().initiative.entries[0]!.id, true);
    store.getState().endCombat();
    expect(store.getState().initiative).not.toHaveProperty('sides');
    expect(store.getState().initiative.entries[0]).not.toHaveProperty('sitsOut');
    expect(store.getState().initiative.entries).toHaveLength(3);
  });

  it('keeps the mode it started in: a fight in turn order has no sides', () => {
    const store = fight();
    store.getState().startCombat(SIDES);
    store.getState().endCombat();
    store.getState().startCombat(TURN_ORDER);
    expect(store.getState().initiative).not.toHaveProperty('sides');
    expect(store.getState().initiative.entries.map((entry) => entry.isActive)).toEqual([true, false, false]);
    store.getState().nextTurn();
    expect(store.getState().initiative.entries.map((entry) => entry.isActive)).toEqual([false, true, false]);
  });

  it('starts in turn order when no rules are given, as every caller did before', () => {
    const store = fight();
    store.getState().startCombat();
    expect(store.getState().initiative.entries[0]!.isActive).toBe(true);
  });
});

describe('clearing the initiative', () => {
  it('removes every combatant and ends the fight', () => {
    const store = fight();
    store.getState().startCombat(SIDES);
    store.getState().nextTurn();
    store.getState().resetInitiative();
    expect(store.getState().initiative).toMatchObject({ entries: [], isActive: false, round: 0, currentIndex: -1 });
    expect(store.getState().initiative).not.toHaveProperty('sides');
  });

  it('keeps the tracker open and its settings', () => {
    const store = fight();
    store.getState().setInitiativeTrackerOpen(true);
    store.getState().setInitiativeConfig({ autoSort: false });
    store.getState().resetInitiative();
    expect(store.getState().initiativeTrackerOpen).toBe(true);
    expect(store.getState().initiative.config.autoSort).toBe(false);
  });
});

describe('rolling initiative', () => {
  afterEach(() => vi.restoreAllMocks());

  it('notifies once for changed rolls and not for unchanged or missing entries', () => {
    const store = fight();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const changed = vi.fn();
    const unsubscribe = store.subscribe(changed);
    store.getState().rollAllInitiative();
    expect(changed).toHaveBeenCalledOnce();
    const first = store.getState().initiative.entries[0]!.id;
    store.getState().rollAllInitiative();
    store.getState().rollEntryInitiative(first);
    store.getState().rollEntryInitiative('missing');
    expect(changed).toHaveBeenCalledOnce();
    store.getState().rollEntryInitiative(first, '1d6');
    expect(changed).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('does not notify or draw random values for an empty tracker', () => {
    const store = fight([]);
    const random = vi.spyOn(Math, 'random');
    const changed = vi.fn();
    const unsubscribe = store.subscribe(changed);
    store.getState().rollAllInitiative();
    store.getState().rollEntryInitiative('missing');
    expect(changed).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('rolls the collection\'s dice', () => {
    expect(rollInitiativeDice('1d10', () => 0.999)).toBe(10);
    expect(rollInitiativeDice('2d6', () => 0)).toBe(2);
    expect(rollInitiativeDice('2d6', () => 0.999)).toBe(12);
    // A roll that is none falls back to a d20
    expect(rollInitiativeDice('nonsense', () => 0.999)).toBe(20);
  });

  it('rolls them for every combatant, and for one', () => {
    // Entry ids are random too, so the fight is set up first
    const store = fight();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    store.getState().rollAllInitiative('1d10');
    expect(store.getState().initiative.entries.map((entry) => entry.initiative)).toEqual([10, 10, 10]);
    store.getState().rollEntryInitiative(store.getState().initiative.entries[1]!.id, '1d6');
    expect(store.getState().initiative.entries.map((entry) => entry.initiative)).toEqual([10, 6, 10]);
    store.getState().rollAllInitiative();
    expect(store.getState().initiative.entries.map((entry) => entry.initiative)).toEqual([20, 20, 20]);
    random.mockRestore();
  });
});
