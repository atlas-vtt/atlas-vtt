import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { produce } from 'immer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { TokenPlace } from '../../src/app/stores/tokenStacking';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { dropTokens as frozenDrop, type DropState } from '../oracles/dropTokensBaseline/dropTokens';

const RUNS = Number(process.env.VITE_DROP_RUNS ?? 200);

interface DropScene {
  tokens: Record<string, TokenEntity>;
  positions: TokenPlace[];
  held: Record<string, { x: number; y: number }>;
  audioDirty: boolean;
}

/** Ids as scenes hold them, with keys JavaScript orders first; the last two are never tokens. */
const TOKEN_IDS = ['a', 'b', 'c', '0', '7', '10'];
const LISTED_IDS = [...TOKEN_IDS, 'drawing_1', 'gone'];

const coordinate = fc.oneof(fc.double({ min: -2000, max: 2000, noNaN: true }), fc.constantFrom(-0, 0, 35, 105));
const layer = fc.oneof(fc.constant(undefined), fc.integer({ min: -3, max: 6 }), fc.constantFrom(0.5, Number.NaN));

const scenes: fc.Arbitrary<DropScene> = fc.record({
  ids: fc.shuffledSubarray(TOKEN_IDS),
  layers: fc.array(layer, { minLength: TOKEN_IDS.length, maxLength: TOKEN_IDS.length }),
  places: fc.array(fc.record({ x: coordinate, y: coordinate }), { minLength: TOKEN_IDS.length, maxLength: TOKEN_IDS.length }),
  picks: fc.array(fc.record({ id: fc.constantFrom(...LISTED_IDS), x: coordinate, y: coordinate, stays: fc.boolean() }), { maxLength: 5 }),
  heldIds: fc.subarray(LISTED_IDS, { maxLength: 3 }),
  audioDirty: fc.boolean(),
}).map(({ ids, layers, places, picks, heldIds, audioDirty }) => {
  const tokens: Record<string, TokenEntity> = {};
  ids.forEach((id, index) => {
    const at = places[index]!;
    const height = layers[index];
    tokens[id] = { id, kind: 'token', imagePath: `${id}.png`, ...at, ...(height !== undefined && { layer: height }) };
  });
  // A pick that stays lists its token at the place it already has.
  const positions = picks.map(({ id, x, y, stays }) => {
    const own = stays ? tokens[id] : undefined;
    return own ? { id, x: own.x, y: own.y } : { id, x, y };
  });
  return { tokens, positions, held: Object.fromEntries(heldIds.map((id) => [id, { x: 1, y: 2 }])), audioDirty };
});

let stores = 0;

function createStore(scene: DropScene): ViewAtlasStore {
  const store = createViewAtlasStore(createInMemoryApp().app, `token-drop-${stores++}`);
  store.setState({
    persistenceEnabled: false,
    objects: { ...store.getState().objects, tokens: scene.tokens },
    heldTokens: scene.held,
    _audioDirty: scene.audioDirty,
  });
  getHistoryStore(store)?.getState().clear();
  return store;
}

/** Which of a drop's objects are still the ones `base` holds: renderers rebuild by reference. */
function kept(base: DropState, result: DropState): Record<string, boolean> {
  const same: Record<string, boolean> = {
    state: result === base,
    objects: result.objects === base.objects,
    tokens: result.objects.tokens === base.objects.tokens,
    heldTokens: result.heldTokens === base.heldTokens,
  };
  for (const [key, token] of Object.entries(result.objects.tokens)) same[`token ${key}`] = token === base.objects.tokens[key];
  return same;
}

const written = ({ objects, heldTokens, _audioDirty }: DropState): DropState => ({ objects, heldTokens, _audioDirty });

describe('dropTokens against the drop it replaces', () => {
  it('drops as before for random scenes: the same state, the same objects kept, one write, one undo step', () => {
    fc.assert(fc.property(scenes, (scene) => {
      const store = createStore(scene);
      const before = store.getState();
      const expected = produce(before, (draft) => frozenDrop(draft, scene.positions));
      let writes = 0;
      const stop = store.subscribe(() => { writes += 1; });

      store.getState().dropTokens(scene.positions);
      stop();

      const after = store.getState();
      expect(written(after)).toStrictEqual(written(expected));
      expect(kept(before, after)).toEqual(kept(before, expected));
      expect(writes).toBe(expected === before ? 0 : 1);
      const history = getHistoryStore(store)!.getState();
      expect(history.pastStates).toHaveLength(expected.objects === before.objects ? 0 : 1);
      history.undo();
      expect(store.getState().objects).toStrictEqual(before.objects);
    }), { numRuns: RUNS });
  });
});
