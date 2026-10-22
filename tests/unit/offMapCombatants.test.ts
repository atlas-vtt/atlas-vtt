import { describe, expect, it } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { addOffMapCombatants, clearCombatants, joinInitiative, offMapWithoutEntry, removeCombatant } from '../../src/app/initiative/offMapCombatants';
import { isOffMap } from '../../src/app/tokens/offMap';
import type { TokenEntity } from '../../src/app/types';
import type { TokenInput } from '../../src/app/types/viewState';
import { createInMemoryApp } from '../mocks/inMemoryVault';

function sceneStore(tokens: TokenEntity[] = []): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `off-map-${Math.random()}`);
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: Object.fromEntries(tokens.map((token) => [token.id, token])) } });
  getHistoryStore(store)?.getState().clear();
  return store;
}

const goblin = (): TokenInput => ({ kind: 'character', name: 'Goblin', x: 400, y: 400, imagePath: 'art/goblin.png', resources: { hp: { current: 7, max: 7 } } } as TokenInput);
const history = (store: ViewAtlasStore) => getHistoryStore(store)!.getState();
const tokensOf = (store: ViewAtlasStore): TokenEntity[] => Object.values(store.getState().objects.tokens);

describe('combatants kept beside the map', () => {
  it('join the scene and the tracker together, each a look-alike of its own, as one undo step', () => {
    const store = sceneStore();
    const ids = addOffMapCombatants(store, [goblin(), goblin()]);
    const tokens = tokensOf(store);
    expect(tokens.every(isOffMap)).toBe(true);
    expect(tokens.map((token) => token.instanceNumber)).toEqual([1, 2]);
    // Left of the map image, where an older version draws them off to the side
    expect(tokens.every((token) => token.x < 0)).toBe(true);
    expect(store.getState().initiative.entries.map((entry) => entry.tokenId)).toEqual(ids);
    expect(store.getState().initiativeTrackerOpen).toBe(true);
    expect(history(store).pastStates).toHaveLength(1);
  });

  it('are placed on the map as one undo step, on top and selected, and are ordinary tokens then', () => {
    const store = sceneStore([{ id: 'wolf', kind: 'token', x: 0, y: 0, imagePath: 'art/wolf.png', layer: 3 }]);
    const [id] = addOffMapCombatants(store, [goblin()]);
    history(store).clear();
    store.getState().placeOffMapToken(id!, 210, 140);
    const placed = store.getState().objects.tokens[id!]!;
    expect(isOffMap(placed)).toBe(false);
    expect(placed).toMatchObject({ x: 210, y: 140, layer: 4 });
    expect(store.getState().selectedIds).toEqual([id]);
    expect(history(store).pastStates).toHaveLength(1);
    history(store).undo();
    expect(isOffMap(store.getState().objects.tokens[id!])).toBe(true);
  });

  it('go with their token when removed from the tracker; a token on the map stays', () => {
    const store = sceneStore([{ id: 'wolf', kind: 'token', x: 0, y: 0, imagePath: 'art/wolf.png' }]);
    joinInitiative(store, ['wolf']);
    const [id] = addOffMapCombatants(store, [goblin()]);
    const entries = store.getState().initiative.entries;
    removeCombatant(store, entries.find((entry) => entry.tokenId === id)!, new Set());
    removeCombatant(store, entries.find((entry) => entry.tokenId === 'wolf')!, new Set());
    expect(Object.keys(store.getState().objects.tokens)).toEqual(['wolf']);
    expect(store.getState().initiative.entries).toEqual([]);
    // Undo brings the token back; the tracker lists it again (`offMapWithoutEntry`)
    history(store).undo();
    expect(offMapWithoutEntry(store.getState().objects.tokens, store.getState().initiative.entries).map((token) => token.id)).toEqual([id]);
  });

  it('go when the tracker is cleared, in one undo step', () => {
    const store = sceneStore([{ id: 'wolf', kind: 'token', x: 0, y: 0, imagePath: 'art/wolf.png' }]);
    joinInitiative(store, ['wolf']);
    addOffMapCombatants(store, [goblin(), goblin()]);
    history(store).clear();
    clearCombatants(store);
    expect(Object.keys(store.getState().objects.tokens)).toEqual(['wolf']);
    expect(store.getState().initiative.entries).toEqual([]);
    expect(history(store).pastStates).toHaveLength(1);
  });

  it('are put in the tracker once, whoever adds them', () => {
    const store = sceneStore([{ id: 'wolf', kind: 'token', x: 0, y: 0, imagePath: 'art/wolf.png' }]);
    joinInitiative(store, ['wolf']);
    joinInitiative(store, ['wolf']);
    expect(store.getState().initiative.entries).toHaveLength(1);
  });
});
