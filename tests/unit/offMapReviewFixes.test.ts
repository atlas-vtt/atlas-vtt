import { describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { addOffMapCombatants, takePlacedCombatants } from '../../src/app/initiative/offMapCombatants';
import { cutSelection } from '../../src/app/clipboard/mapClipboardActions';
import { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { isOffMap, placedByOlderVersion } from '../../src/app/tokens/offMap';
import type { TokenInput } from '../../src/app/types/viewState';
import { createInMemoryApp } from '../mocks/inMemoryVault';

function sceneStore(): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `off-map-review-${Math.random()}`);
  store.setState({ persistenceEnabled: false });
  getHistoryStore(store)?.getState().clear();
  return store;
}

const goblin = { kind: 'token', x: 0, y: 0, imagePath: 'art/goblin.png' } as TokenInput;
const history = (store: ViewAtlasStore) => getHistoryStore(store)!.getState();

/** A combatant placed on the map, selected, and the placing undone: beside the map again, still in the selection. */
function undonePlacement(): { store: ViewAtlasStore; id: string } {
  const store = sceneStore();
  const [id] = addOffMapCombatants(store, [goblin]);
  store.getState().placeOffMapToken(id!, 140, 140);
  history(store).undo();
  expect(isOffMap(store.getState().objects.tokens[id!])).toBe(true);
  expect(store.getState().selectedIds).toEqual([id]);
  return { store, id: id! };
}

describe('a combatant that went beside the map again by an undone Place on Map', () => {
  it('leaves the selection with its sprite', () => {
    const { store, id } = undonePlacement();
    const harness = {
      store,
      tokenSprites: { [id]: {} },
      tokenRings: {},
      glide: { cancel: vi.fn() },
      interactionController: { removeInteractionHandlers: vi.fn() },
      uiManager: { destroyTokenUI: vi.fn() },
      deselect: Reflect.get(TokenRenderer.prototype, 'deselect') as unknown,
    };
    const release = Reflect.get(TokenRenderer.prototype, 'releaseLeavingTokens') as (ids: Iterable<string>) => unknown[];
    expect(release.call(harness, [id])).toHaveLength(1);
    expect(store.getState().selectedIds).toEqual([]);
  });

  it('is never deleted by Delete on the selection, nor cut', async () => {
    const { store, id } = undonePlacement();
    store.getState().deleteSelected();
    expect(store.getState().objects.tokens[id]).toBeDefined();
    expect(await cutSelection(store)).toBe(false);
    expect(store.getState().objects.tokens[id]).toBeDefined();
  });
});

describe('a combatant an older version moved onto the map', () => {
  const MAP = { x: 0, y: 0, width: 1000, height: 600 };

  it('is the one whose centre lies on the map image', () => {
    const tokens = {
      moved: { x: 300, y: 200, offMap: true as const },
      waiting: { x: -105, y: 35, offMap: true as const },
      onMap: { x: 300, y: 200 },
    };
    expect(placedByOlderVersion(tokens, MAP)).toEqual(['moved']);
  });

  it('is on the map once its scene loads, in a write that is no undo step', () => {
    const store = sceneStore();
    const [moved, waiting] = addOffMapCombatants(store, [goblin, goblin]);
    store.getState().updateTokens([{ id: moved!, changes: { x: 300, y: 200 } }]);
    history(store).clear();
    takePlacedCombatants(store, MAP);
    expect(isOffMap(store.getState().objects.tokens[moved!])).toBe(false);
    expect(isOffMap(store.getState().objects.tokens[waiting!])).toBe(true);
    expect(history(store).pastStates).toHaveLength(0);
  });
});

describe('hit points rolled as creatures join', () => {
  it('roll with the dice tool\'s own random stream, which initiative rolls use too', async () => {
    const { diceRandom, offlineDiceInputs } = await import('../../src/app/services/offlineDiceInputs');
    expect(offlineDiceInputs().random).toBe(diceRandom);
  });
});
