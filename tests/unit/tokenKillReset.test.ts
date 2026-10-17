import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { HP, STR, STRESS } from '../mocks/resourceFixtures';
import { DEAD_CONDITION } from '../../src/app/gameSystems/deadCondition';
import { getHistoryStore } from '../../src/app/stores/history';
import * as mapRules from '../../src/app/services/mapRules';

afterEach(() => vi.restoreAllMocks());

function storeWith(resources: NonNullable<Character['resources']>) {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `kill-reset-${Math.random()}`);
  const token: Character = { id: 't1', kind: 'character', name: 'Troll', imagePath: 'troll.png', x: 0, y: 0, resources, conditions: ['prone'], conditionValues: { prone: 2 } };
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t1: token } } });
  return { store, token: (): Character => store.getState().objects.tokens.t1 as Character };
}

describe('killing and resetting tokens', () => {
  it('kill spends only the resources that defeat the token', () => {
    const { store, token } = storeWith({ hp: { current: 9, max: 14 }, str: { current: 14, max: 14 } });
    store.getState().killTokens(['t1'], [HP, STR]);
    expect(token().resources).toEqual({ hp: { current: 0, max: 14 }, str: { current: 14, max: 14 } });
    expect(token().conditions).toEqual(['prone', DEAD_CONDITION.id]);
    expect(token().conditionValues).toEqual({ prone: 2 });
  });

  it('adds Dead only once, even without an HP resource', () => {
    const { store, token } = storeWith({});
    store.getState().killTokens(['t1', 'missing'], []);
    store.getState().killTokens(['t1'], []);
    expect(token().conditions).toEqual(['prone', DEAD_CONDITION.id]);
  });

  it('uses the active map system\'s existing Dead condition', () => {
    vi.spyOn(mapRules, 'mapRules').mockReturnValue({ source: { kind: 'campaign', id: 'campaign' }, settings: { conditions: [{ ...DEAD_CONDITION, id: 'custom-dead' }] } });
    const { store, token } = storeWith({ hp: { current: 9, max: 14 } });
    store.getState().killTokens(['t1'], [HP]);
    expect(token().conditions).toEqual(['prone', 'custom-dead']);
  });

  it('preserves Blinded and other conditions through death, healing and removing Dead', () => {
    const { store, token } = storeWith({ hp: { current: 9, max: 14 } });
    const conditions = ['prone', 'blinded'];
    const vision = { enabled: true, range: 30, senses: [{ id: 'blindsight', range: 10 }] };
    store.getState().updateToken('t1', { conditions, vision });

    store.getState().killTokens(['t1'], [HP]);
    expect(token().conditions).toEqual([...conditions, DEAD_CONDITION.id]);
    expect(token().resources?.hp?.current).toBe(0);

    store.getState().updateToken('t1', { resources: { hp: { current: 1, max: 14 } } });
    store.getState().setTokensCondition(['t1'], DEAD_CONDITION.id, false);
    expect(token().conditions).toEqual(conditions);
    expect(token().conditionValues).toEqual({ prone: 2 });
    expect(token().vision).toEqual(vision);
    expect(token().resources?.hp?.current).toBe(1);
  });

  it('undoes and redoes spending HP and adding Dead together; Reset restores both', () => {
    const { store, token } = storeWith({ hp: { current: 9, max: 14 } });
    const history = getHistoryStore(store)!;
    const before = history.getState().pastStates.length;
    store.getState().killTokens(['t1'], [HP]);
    expect(history.getState().pastStates).toHaveLength(before + 1);
    history.getState().undo();
    expect(token().resources?.hp?.current).toBe(9);
    expect(token().conditions).toEqual(['prone']);
    history.getState().redo();
    expect(token().resources?.hp?.current).toBe(0);
    expect(token().conditions).toContain(DEAD_CONDITION.id);
    store.getState().resetTokens(['t1'], [HP]);
    expect(token().resources?.hp?.current).toBe(14);
    expect(token().conditions).toBeUndefined();
  });

  it('reset returns every defined resource to its start and clears conditions', () => {
    const { store, token } = storeWith({ hp: { current: 2, max: 14 }, stress: { current: 5, max: 6 }, mana: { current: 1, max: 4 } });
    store.getState().resetTokens(['t1'], [HP, STRESS]);
    expect(token().resources).toEqual({ hp: { current: 14, max: 14 }, stress: { current: 0, max: 6 }, mana: { current: 1, max: 4 } });
    expect(token().conditions).toBeUndefined();
    expect(token().conditionValues).toBeUndefined();
  });
});
