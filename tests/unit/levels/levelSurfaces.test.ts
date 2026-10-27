import { describe, expect, it } from 'vitest';
import { floorAt, floorBelow, levelSurfaceList, MAX_LEVEL_SURFACES, surfacesOnLevel } from '../../../src/app/levels/levelSurfaces';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import { withLevelDeleted } from '../../../src/app/levels/levelEdits';
import { objectsMovedWithMap } from '../../../src/app/grid/mapStretchObjects';
import { migrateMapFile } from '../../../src/app/services/MapPersistence';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore, runHistoryTransaction } from '../../../src/app/stores/history';
import type { LevelLink, LevelSurface, SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { TokenEntity } from '../../../src/app/types';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const LEVELS: SceneLevel[] = [
  { id: 'cellar', name: 'Cellar', elevation: { bottom: -10, top: 0 }, background: null },
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];

const square = (x: number, y: number, side: number): LevelSurface['polygon'] => [{ x, y }, { x: x + side, y }, { x: x + side, y: y + side }, { x, y: y + side }];
const surface = (id: string, level: string, open: boolean, polygon = square(0, 0, 100)): LevelSurface => ({ id, kind: 'level-surface', level, open, polygon });
const token = (id: string, level = 'upper', x = 500, y = 500): TokenEntity => ({ id, kind: 'token', x, y, imagePath: `${id}.png`, level });

function sceneStore(surfaces: Record<string, LevelSurface>, tokens: Record<string, TokenEntity>, links: Record<string, LevelLink> = {}): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `level-surfaces-${Math.random()}`);
  store.setState({
    persistenceEnabled: false, mapLoaded: true, isMapLoading: false, levels: LEVELS, viewedLevel: 'upper',
    objects: { ...store.getState().objects, tokens, levelSurfaces: surfaces, levelLinks: links },
  });
  getHistoryStore(store)?.getState().clear();
  return store;
}

function drop(store: ViewAtlasStore, places: { id: string; x: number; y: number }[]): void {
  runHistoryTransaction(store, () => store.getState().dropTokens(places));
}

describe('a level\'s floor', () => {
  it('is floor everywhere without surfaces, open inside an open surface, and floor again where a later floor lies over it', () => {
    const list = [surface('hole', 'ground', true), surface('plank', 'ground', false, square(40, 40, 20))];
    expect(floorAt([], { x: 50, y: 50 })).toBe(true);
    expect(floorAt(list, { x: 10, y: 10 })).toBe(false);
    expect(floorAt(list, { x: 50, y: 50 })).toBe(true);
    expect(floorAt(list, { x: 200, y: 200 })).toBe(true);
  });

  it('reads what a file holds: areas only, anything but `open: true` as floor, at most the cap', () => {
    const many = Object.fromEntries(Array.from({ length: MAX_LEVEL_SURFACES + 5 }, (_, i) => [`s${i}`, surface(`s${i}`, 'ground', true)]));
    expect(levelSurfaceList(many)).toHaveLength(MAX_LEVEL_SURFACES);
    const list = levelSurfaceList({
      maybe: { ...surface('maybe', 'ground', true), open: 'yes' as unknown as boolean },
      line: surface('line', 'ground', true, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]),
      broken: 'no' as unknown as LevelSurface,
    });
    expect(list.map((entry) => [entry.id, entry.open])).toEqual([['maybe', false]]);
  });

  it('belongs to its level: the view reads only the surfaces of the level it shows', () => {
    const store = sceneStore({ a: surface('a', 'ground', true), b: surface('b', 'upper', true) }, {});
    expect(Object.keys(levelObjects(store.getState()).levelSurfaces ?? {})).toEqual(['b']);
    expect(surfacesOnLevel(store.getState().objects.levelSurfaces, 'ground', LEVELS).map((entry) => entry.id)).toEqual(['a']);
  });

  it('lets a point fall to the first level below with floor there, whatever each shows below it, and holds it over a chasm', () => {
    const scene = { levels: LEVELS, objects: { levelSurfaces: { up: surface('up', 'upper', true), mid: surface('mid', 'ground', true, square(0, 0, 50)) } } };
    expect(floorBelow(scene, 'upper', { x: 80, y: 80 })).toBe('ground');
    expect(floorBelow(scene, 'upper', { x: 20, y: 20 })).toBe('cellar');
    expect(floorBelow(scene, 'upper', { x: 500, y: 500 })).toBeNull();
    const chasm = { levels: LEVELS, objects: { levelSurfaces: { a: surface('a', 'ground', true), b: surface('b', 'cellar', true) } } };
    expect(floorBelow(chasm, 'ground', { x: 50, y: 50 })).toBeNull();
    expect(floorBelow({ levels: undefined, objects: chasm.objects }, 'ground', { x: 50, y: 50 })).toBeNull();
  });
});

describe('a drop over an opening', () => {
  it('lets the token fall to the level below in the drop\'s one undo step', () => {
    const store = sceneStore({ hole: surface('hole', 'upper', true) }, { knight: token('knight') });
    store.getState().setSelection(['knight']);

    drop(store, [{ id: 'knight', x: 50, y: 50 }]);

    const fallen = store.getState().objects.tokens.knight!;
    expect({ x: fallen.x, y: fallen.y, level: fallen.level }).toEqual({ x: 50, y: 50, level: 'ground' });
    expect(store.getState().selectedIds).toEqual([]);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);

    getHistoryStore(store)!.getState().undo();
    const back = store.getState().objects.tokens.knight!;
    expect({ x: back.x, y: back.y, level: back.level }).toEqual({ x: 500, y: 500, level: 'upper' });
  });

  it('leaves a token put down on floor, or over a chasm, where it is', () => {
    const store = sceneStore({ hole: surface('hole', 'ground', true), deep: surface('deep', 'cellar', true) }, { a: token('a', 'upper'), b: token('b', 'ground') });
    drop(store, [{ id: 'a', x: 50, y: 50 }, { id: 'b', x: 50, y: 50 }]);
    expect(store.getState().objects.tokens.a!.level).toBe('upper');
    expect(store.getState().objects.tokens.b!.level).toBe('ground');
  });

  it('lets a token that takes stairs to an open floor fall on from there', () => {
    const stairs: LevelLink = { id: 'stairs', kind: 'level-link', polygon: square(0, 0, 100), levels: ['ground', 'upper'] };
    const store = sceneStore({ hole: surface('hole', 'upper', true) }, { knight: token('knight', 'ground') }, { stairs });
    drop(store, [{ id: 'knight', x: 50, y: 50 }]);
    expect(store.getState().objects.tokens.knight!.level).toBe('ground');
  });
});

describe('a drop over transparent art', () => {
  // The view lays the upper level's map out transparent left of x 100, the ground's left of x 40.
  const art = (level: string, point: { x: number; y: number }): boolean | null => {
    if (level === 'upper') return point.x >= 100;
    if (level === 'ground') return point.x >= 40;
    return null;
  };

  it('lets the token fall to the first level whose map holds floor there, in the drop\'s one undo step', () => {
    const store = sceneStore({}, { knight: token('knight') });
    runHistoryTransaction(store, () => store.getState().dropTokens([{ id: 'knight', x: 60, y: 300 }], art));
    expect(store.getState().objects.tokens.knight!.level).toBe('ground');
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
    getHistoryStore(store)!.getState().undo();
    expect(store.getState().objects.tokens.knight!.level).toBe('upper');

    runHistoryTransaction(store, () => store.getState().dropTokens([{ id: 'knight', x: 20, y: 300 }], art));
    // The cellar's map is not known to the view: it counts as floor.
    expect(store.getState().objects.tokens.knight!.level).toBe('cellar');
  });

  it('holds a token on its map, where the view does not know, and where a drawn floor lies over the transparent art', () => {
    const store = sceneStore({ plank: surface('plank', 'upper', false, square(0, 0, 50)) }, { a: token('a'), b: token('b'), c: token('c', 'cellar') });
    store.getState().dropTokens([{ id: 'a', x: 150, y: 300 }, { id: 'b', x: 25, y: 25 }], art);
    store.getState().dropTokens([{ id: 'c', x: 20, y: 20 }], art);
    expect(['a', 'b', 'c'].map((id) => store.getState().objects.tokens[id]!.level)).toEqual(['upper', 'upper', 'cellar']);
    // Without the view's answer, only drawn openings let a token fall.
    store.getState().dropTokens([{ id: 'a', x: 60, y: 300 }]);
    expect(store.getState().objects.tokens.a!.level).toBe('upper');
  });
});

describe('surfaces and the scene', () => {
  it('are added on the level shown and changed and deleted, each one undo step', () => {
    const store = sceneStore({}, {});
    const id = store.getState().addLevelSurface({ polygon: square(0, 0, 100), open: true });
    expect(store.getState().objects.levelSurfaces![id]).toMatchObject({ kind: 'level-surface', level: 'upper', open: true });
    store.getState().updateLevelSurface(id, { open: false });
    store.getState().openLevelSurfacePopover(id);
    store.getState().deleteLevelSurface(id);
    expect(store.getState().objects.levelSurfaces).toEqual({});
    expect(store.getState().levelSurfacePopover).toBeNull();
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(3);
    getHistoryStore(store)!.getState().undo();
    expect(store.getState().objects.levelSurfaces![id]!.open).toBe(false);
  });

  it('go with their level when it is deleted, and move to the level that takes its objects', () => {
    const store = sceneStore({ a: surface('a', 'upper', true), b: surface('b', 'ground', true) }, {});
    expect(Object.keys(withLevelDeleted(store.getState(), 'upper', null).objects.levelSurfaces ?? {})).toEqual(['b']);
    expect(withLevelDeleted(store.getState(), 'upper', 'ground').objects.levelSurfaces!.a!.level).toBe('ground');
  });

  it('move with the map, and are kept as the file holds them', () => {
    const store = sceneStore({ a: surface('a', 'upper', true) }, {});
    const moved = objectsMovedWithMap(store.getState().objects, (point) => ({ x: point.x * 2, y: point.y }));
    expect(moved.levelSurfaces!.a!.polygon.map((point) => point.x)).toEqual([0, 200, 200, 0]);
    const file = migrateMapFile({ objects: { tokens: {}, levelSurfaces: { a: surface('a', 'upper', true), odd: { future: true } } } });
    expect(file.objects.levelSurfaces).toEqual({ a: surface('a', 'upper', true), odd: { future: true } });
    expect(migrateMapFile({ objects: { tokens: {}, levelSurfaces: 'broken' } }).objects.levelSurfaces).toBeUndefined();
  });
});
