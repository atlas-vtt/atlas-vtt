import { describe, expect, it } from 'vitest';
import { levelLinkList, linkChoice, linkLandings, linkTargets } from '../../../src/app/levels/levelLinks';
import { withLevelDeleted } from '../../../src/app/levels/levelEdits';
import { objectsMovedWithMap } from '../../../src/app/grid/mapStretchObjects';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore, runHistoryTransaction } from '../../../src/app/stores/history';
import type { LevelLink, SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { TokenEntity } from '../../../src/app/types';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const LEVELS: SceneLevel[] = [
  { id: 'cellar', name: 'Cellar', elevation: { bottom: -10, top: 0 }, background: null },
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];

const SQUARE = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const link = (id: string, levels: LevelLink['levels'], direction?: LevelLink['direction'], polygon = SQUARE): LevelLink =>
  ({ id, kind: 'level-link', polygon, levels, ...(direction && { direction }) });
/** A token on `level`; tokens stand on the ground floor unless named otherwise (the first level is the cellar). */
const token = (id: string, level = 'ground', x = 500, y = 500): TokenEntity => ({ id, kind: 'token', x, y, imagePath: `${id}.png`, level });

function sceneStore(links: Record<string, LevelLink>, tokens: Record<string, TokenEntity>, viewed = 'ground'): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `level-links-${Math.random()}`);
  store.setState({
    persistenceEnabled: false, mapLoaded: true, isMapLoading: false, levels: LEVELS, viewedLevel: viewed,
    objects: { ...store.getState().objects, tokens, levelLinks: links },
  });
  getHistoryStore(store)?.getState().clear();
  return store;
}

/** A drag that ends with `places`, as the token renderer drops tokens: one transaction. */
function drop(store: ViewAtlasStore, places: { id: string; x: number; y: number }[]): void {
  runHistoryTransaction(store, () => store.getState().dropTokens(places));
}

describe('where a level link leads', () => {
  it('joins the levels it stands on, either way unless it says otherwise', () => {
    const stairs = link('stairs', ['ground', 'upper']);
    expect(linkTargets(stairs, 'ground', LEVELS)).toEqual(['upper']);
    expect(linkTargets(stairs, 'upper', LEVELS)).toEqual(['ground']);
    expect(linkTargets(stairs, 'cellar', LEVELS)).toEqual([]);
  });

  it('leads only down or only up where it is one-way', () => {
    const trapdoor = link('trapdoor', ['cellar', 'ground'], 'down');
    expect(linkTargets(trapdoor, 'ground', LEVELS)).toEqual(['cellar']);
    expect(linkTargets(trapdoor, 'cellar', LEVELS)).toEqual([]);
    const lift = link('lift', 'all', 'up');
    expect(linkTargets(lift, 'cellar', LEVELS)).toEqual(['ground', 'upper']);
    expect(linkTargets(lift, 'upper', LEVELS)).toEqual([]);
  });

  it('leads nowhere in a scene with one level', () => {
    expect(linkTargets(link('stairs', ['ground', 'upper']), 'ground', undefined)).toEqual([]);
  });

  it('reads what a file holds: areas only, an unknown direction as both ways', () => {
    const list = levelLinkList({
      ok: { ...link('x', ['ground', 'upper']), direction: 'sideways' as LevelLink['direction'] },
      line: link('line', ['ground', 'upper'], undefined, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]),
      broken: 'not a link' as unknown as LevelLink,
    });
    expect(list.map((entry) => entry.id)).toEqual(['ok']);
    expect(list[0]!.direction).toBeUndefined();
  });
});

describe('a drop inside stairs', () => {
  it('takes the token to the level they lead to, at the same place, in the drop\'s one undo step', () => {
    const store = sceneStore({ stairs: link('stairs', ['ground', 'upper']) }, { knight: token('knight') });
    store.getState().setSelection(['knight']);

    drop(store, [{ id: 'knight', x: 50, y: 50 }]);

    const moved = store.getState().objects.tokens.knight!;
    expect({ x: moved.x, y: moved.y, level: moved.level }).toEqual({ x: 50, y: 50, level: 'upper' });
    expect(store.getState().selectedIds).toEqual([]);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);

    getHistoryStore(store)!.getState().undo();
    const back = store.getState().objects.tokens.knight!;
    expect({ x: back.x, y: back.y, level: back.level }).toEqual({ x: 500, y: 500, level: 'ground' });
  });

  it('leaves a token dropped outside them, or on a level they do not stand on, where it is put', () => {
    const store = sceneStore({ stairs: link('stairs', ['upper', 'cellar']) }, { knight: token('knight'), mage: token('mage', 'upper') });

    drop(store, [{ id: 'knight', x: 50, y: 50 }, { id: 'mage', x: 300, y: 300 }]);

    expect(store.getState().objects.tokens.knight!.level).toBe('ground');
    expect(store.getState().objects.tokens.mage!.level).toBe('upper');
  });

  it('leaves the choice of an elevator\'s floors to the GM', () => {
    const store = sceneStore({ lift: link('lift', 'all') }, { knight: token('knight') });
    const places = [{ id: 'knight', x: 50, y: 50 }];
    const choice = linkChoice(linkLandings(store.getState(), places));

    drop(store, places);

    expect(choice).toEqual({ tokenIds: ['knight'], targets: ['cellar', 'upper'] });
    expect(store.getState().objects.tokens.knight!.level).toBe('ground');
  });

  it('offers a group only the floors every one of them may reach', () => {
    const scene = { levels: LEVELS, objects: { tokens: { a: token('a'), b: token('b', 'upper') }, levelLinks: { lift: link('lift', 'all') } } };
    const choice = linkChoice(linkLandings(scene, [{ id: 'a', x: 10, y: 10 }, { id: 'b', x: 10, y: 10 }]));
    expect(choice).toEqual({ tokenIds: ['a', 'b'], targets: ['cellar'] });
    // a on the ground floor may go to the cellar or up; b upstairs to the cellar or the ground floor
  });

  it('is the GM\'s pick and the drop in one undo step when the pick is made before the drag\'s step closes', () => {
    const store = sceneStore({ lift: link('lift', 'all') }, { knight: token('knight') });
    runHistoryTransaction(store, () => {
      store.getState().dropTokens([{ id: 'knight', x: 50, y: 50 }]);
      store.getState().moveTokensToLevel(['knight'], 'cellar');
    });
    expect(store.getState().objects.tokens.knight!.level).toBe('cellar');
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
  });
});

describe('stairs and the scene\'s levels', () => {
  it('go when a level they join is deleted and only one end is left', () => {
    const store = sceneStore({ stairs: link('stairs', ['ground', 'upper']), lift: link('lift', ['cellar', 'ground', 'upper']) }, {});
    const after = withLevelDeleted(store.getState(), 'upper', null);
    expect(Object.keys(after.objects.levelLinks ?? {})).toEqual(['lift']);
    expect(after.objects.levelLinks!.lift!.levels).toEqual(['cellar', 'ground']);
  });

  it('go when their other end is the level that takes a deleted level\'s objects', () => {
    const store = sceneStore({ stairs: link('stairs', ['ground', 'upper']) }, {});
    const after = withLevelDeleted(store.getState(), 'upper', 'ground');
    expect(after.objects.levelLinks).toEqual({});
  });

  it('lead to a level that takes a deleted level\'s objects', () => {
    const store = sceneStore({ stairs: link('stairs', ['cellar', 'upper']) }, {});
    const after = withLevelDeleted(store.getState(), 'upper', 'ground');
    expect(after.objects.levelLinks!.stairs!.levels).toEqual(['cellar', 'ground']);
  });

  it('move with the map like every other area', () => {
    const store = sceneStore({ stairs: link('stairs', ['ground', 'upper']) }, {});
    const moved = objectsMovedWithMap(store.getState().objects, (point) => ({ x: point.x * 2, y: point.y }));
    expect(moved.levelLinks!.stairs!.polygon.map((point) => point.x)).toEqual([0, 200, 200, 0]);
  });
});
