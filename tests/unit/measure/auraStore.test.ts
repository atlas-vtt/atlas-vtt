import { describe, expect, it } from 'vitest';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import { aurasOf, aurasToTokenLevels, dropAurasOf } from '../../../src/app/measure/auraUpkeep';
import { isAura, measureList } from '../../../src/app/measure/keptMeasures';
import type { KeptMeasure } from '../../../src/app/measure/measureTypes';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore, runHistoryTransaction } from '../../../src/app/stores/history';
import type { TokenEntity } from '../../../src/app/types';
import type { LevelLink, SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
const POINTS = [{ x: 105, y: 105 }, { x: 280, y: 105 }];
const token = (id: string, more: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'character', name: id, imagePath: '', x: 105, y: 105, ...more });

interface Setup {
  store: ViewAtlasStore;
  steps: () => number;
  undo: () => void;
  redo: () => void;
  auras: () => KeptMeasure[];
}

/** A scene with the tokens `hero` and `goblin`, each on the first level where it has levels. */
function setup(levels?: SceneLevel[]): Setup {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `auras-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/auras.atlasmap');
  if (levels) store.setState({ levels, viewedLevel: null });
  const first = levels ? { level: levels[0]!.id } : {};
  store.setState({ objects: { ...store.getState().objects, tokens: { hero: token('hero', first), goblin: token('goblin', { ...first, x: 385 }) } } });
  const history = getHistoryStore(store)!;
  history.getState().clear();
  return {
    store,
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
    redo: () => history.getState().redo(),
    auras: () => Object.values(store.getState().objects.measures ?? {}),
  };
}

describe('the auras of tokens in the store', () => {
  it('are given, stepped and taken away for several tokens in one undo step each', () => {
    const { store, steps, undo, auras } = setup();
    expect(store.getState().setTokenAuras([{ tokenId: 'hero', aura: 10, points: POINTS }, { tokenId: 'goblin', aura: 5, points: POINTS }], { color: '#e93147', hidden: true })).toBe(true);
    expect(steps()).toBe(1);
    expect(auras()).toHaveLength(2);
    const [hero] = auras();
    expect(hero).toEqual({ id: hero!.id, kind: 'measure', shape: 'circle', points: POINTS, follows: 'hero', aura: 10, color: '#e93147', hidden: true });
    expect(auras().every(isAura)).toBe(true);

    // A step changes the aura the token has, and takes none of its other fields.
    const wider = [{ x: 105, y: 105 }, { x: 350, y: 105 }];
    store.getState().setTokenAuras([{ tokenId: 'hero', aura: 15, points: wider }]);
    expect(auras()[0]).toEqual({ ...hero, aura: 15, points: wider });
    expect(auras()).toHaveLength(2);
    expect(steps()).toBe(2);

    // No reach takes it away; a token that has none is left as it is, and one that is gone gets none.
    store.getState().setTokenAuras([{ tokenId: 'hero', aura: 0, points: POINTS }, { tokenId: 'ghost', aura: 5, points: POINTS }]);
    expect(auras().map((aura) => aura.follows)).toEqual(['goblin']);
    expect(steps()).toBe(3);
    undo();
    expect(auras().map((aura) => aura.follows)).toEqual(['hero', 'goblin']);
  });

  it('steps the first aura of a token that has several, and closes the popover of one it takes away', () => {
    const { store, auras } = setup();
    store.getState().setTokenAuras([{ tokenId: 'hero', aura: 10, points: POINTS }]);
    const second = store.getState().addMeasure({ shape: 'circle', points: POINTS, follows: 'hero', aura: 30 })!;
    const first = auras()[0]!.id;
    store.getState().openMeasurePopover(first);
    store.getState().setTokenAuras([{ tokenId: 'hero', aura: 0, points: POINTS }]);
    expect(Object.keys(store.getState().objects.measures ?? {})).toEqual([second]);
    expect(store.getState().measurePopover).toBeNull();
  });

  it.each([
    ['the selection is deleted', (store: ViewAtlasStore): void => store.getState().removeMapObjects(['hero'])],
    ['it is deleted as a map object', (store: ViewAtlasStore): void => store.getState().deleteMapObject('token', 'hero')],
    ['it is deleted by id', (store: ViewAtlasStore): void => store.getState().deleteToken('hero')],
    ['tokens are deleted by ids', (store: ViewAtlasStore): void => store.getState().deleteTokens(['hero'])],
  ])('go with their token when %s, in the same undo step, and come back with it', (_case, remove) => {
    const { store, steps, undo, redo, auras } = setup();
    store.getState().setTokenAuras([{ tokenId: 'hero', aura: 10, points: POINTS }, { tokenId: 'goblin', aura: 5, points: POINTS }]);
    const circle = store.getState().addMeasure({ shape: 'circle', points: POINTS })!;
    const before = store.getState().objects.measures;
    const hero = auras().find((aura) => aura.follows === 'hero')!;
    store.getState().openMeasurePopover(hero.id);
    const taken = steps();

    remove(store);
    expect(store.getState().objects.tokens.hero).toBeUndefined();
    expect(auras().map((aura) => aura.follows ?? aura.id)).toEqual(['goblin', circle]);
    expect(store.getState().measurePopover).toBeNull();
    expect(steps()).toBe(taken + 1);

    undo();
    expect(store.getState().objects.tokens.hero).toBeDefined();
    expect(store.getState().objects.measures).toEqual(before);
    // It takes its old place among the others, so it is drawn where it lay in the pile.
    expect(Object.keys(store.getState().objects.measures ?? {})).toEqual(Object.keys(before ?? {}));
    redo();
    expect(store.getState().objects.tokens.hero).toBeUndefined();
    expect(auras().some((aura) => aura.follows === 'hero')).toBe(false);
  });

  it('lie on the level their token stands on: a token sent to another level takes them along, in the same undo step', () => {
    const { store, steps, undo, auras } = setup(LEVELS);
    store.getState().setTokenAuras([{ tokenId: 'hero', aura: 10, points: POINTS }, { tokenId: 'goblin', aura: 5, points: POINTS }]);
    expect(auras().map((aura) => aura.level)).toEqual(['ground', 'ground']);
    const taken = steps();
    store.getState().moveTokensToLevel(['hero'], 'upper');
    expect(auras().map((aura) => aura.level)).toEqual(['upper', 'ground']);
    expect(steps()).toBe(taken + 1);
    // The level shown keeps the goblin's, the other level shows the hero's.
    expect(measureList(levelObjects(store.getState()).measures).map((aura) => aura.follows)).toEqual(['goblin']);
    store.getState().setViewedLevel('upper');
    expect(measureList(levelObjects(store.getState()).measures).map((aura) => aura.follows)).toEqual(['hero']);
    undo();
    expect(auras().map((aura) => aura.level)).toEqual(['ground', 'ground']);
  });

  it('go up the stairs with their token: a drop at the far end of a flight takes token and aura to the other level, one undo step', () => {
    const { store, steps, undo, auras } = setup(LEVELS);
    // Two cells wide and three long, walked up northwards: the last row at the top leads to the upper level.
    const stairs: LevelLink = { id: 'stairs', kind: 'level-link', polygon: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 }], levels: ['ground', 'upper'], flight: { foot: 2, rows: 3 } };
    store.setState({ objects: { ...store.getState().objects, levelLinks: { stairs } } });
    store.getState().setTokenAuras([{ tokenId: 'hero', aura: 10, points: POINTS }]);
    const taken = steps();
    runHistoryTransaction(store, () => store.getState().dropTokens([{ id: 'hero', x: 150, y: 50 }]));
    expect(store.getState().objects.tokens.hero?.level).toBe('upper');
    expect(auras().map((aura) => aura.level)).toEqual(['upper']);
    expect(steps()).toBe(taken + 1);
    undo();
    expect(store.getState().objects.tokens.hero?.level).toBe('ground');
    expect(auras().map((aura) => aura.level)).toEqual(['ground']);
  });

  it('are not copied with their token: a duplicate has none', () => {
    const { store, auras } = setup();
    store.getState().setTokenAuras([{ tokenId: 'hero', aura: 10, points: POINTS }]);
    const [copy] = store.getState().duplicateMapObjects(['hero']);
    expect(store.getState().objects.tokens[copy!]).toBeDefined();
    expect(auras().map((aura) => aura.follows)).toEqual(['hero']);
  });
});

describe('what keeps auras with their tokens', () => {
  const objects = (): { measures: Record<string, unknown>; tokens: Record<string, { level?: string }> } => ({
    measures: {
      a: { id: 'a', follows: 'hero', level: 'ground' },
      text: 'circle',
      b: { id: 'b', follows: 'goblin' },
      c: { id: 'c', follows: 'hero' },
      plain: { id: 'plain' },
    },
    tokens: { hero: { level: 'upper' }, goblin: {} },
  });

  it('finds the measurements that follow a token, whatever else the record holds', () => {
    expect(aurasOf(objects().measures, new Set(['hero']))).toEqual(['a', 'c']);
    expect(aurasOf(objects().measures, new Set())).toEqual([]);
    expect(aurasOf(undefined, new Set(['hero']))).toEqual([]);
    expect(aurasOf('measures' as never, new Set(['hero']))).toEqual([]);
  });

  it('drops the auras of tokens that are gone and leaves every other entry', () => {
    const held = objects();
    expect(dropAurasOf(held, ['hero', 'nobody'])).toEqual(['a', 'c']);
    expect(Object.keys(held.measures)).toEqual(['text', 'b', 'plain']);
    expect(dropAurasOf({ tokens: {} }, ['hero'])).toEqual([]);
  });

  it('puts auras on their token\'s level, and on none where the token names none', () => {
    const held = objects();
    held.tokens.goblin = {};
    (held.measures.b as { level?: string }).level = 'ground';
    aurasToTokenLevels(held, ['hero', 'goblin']);
    expect(held.measures.a).toEqual({ id: 'a', follows: 'hero', level: 'upper' });
    expect(held.measures.c).toEqual({ id: 'c', follows: 'hero', level: 'upper' });
    expect(held.measures.b).toEqual({ id: 'b', follows: 'goblin' });
  });
});
