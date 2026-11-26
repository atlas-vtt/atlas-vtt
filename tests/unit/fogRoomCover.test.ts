import { describe, expect, it } from 'vitest';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { coveredShare, roomsToHide } from '../../src/app/fog/fogRoomCover';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { FogLassoFill, FogOperation } from '../../src/app/types/fogTypes';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import type { QShape } from '../../src/app/types/shapeTypes';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallInput } from '../../src/app/types/wallTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const rect = (x: number, y: number, width: number, height: number): Point[] => [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
const HALL = rect(140, 140, 280, 280);
const VAULT = rect(700, 140, 210, 280);
/** Fog over `outlines`, as the level's coverage. */
const fogOver = (...outlines: Point[][]): QShape => fogCoverage(Object.fromEntries(outlines.map((points, index): [string, FogOperation] => [`f${index}`, { id: `f${index}`, kind: 'fog', type: 'lasso', timestamp: index, isErasing: false, points }]))).shape;

describe('the share of a room that is fog', () => {
  it('is all of it, a part, or nothing', () => {
    expect(coveredShare(HALL, fogOver(rect(100, 100, 400, 400)))).toBe(1);
    expect(coveredShare(HALL, fogOver(rect(280, 140, 280, 280)))).toBeCloseTo(0.5, 9);
    expect(coveredShare(HALL, fogOver(rect(500, 140, 100, 100)))).toBe(0);
    expect(coveredShare(HALL, [])).toBe(0);
    // A room that encloses nothing has no share.
    expect(coveredShare([{ x: 0, y: 0 }, { x: 10, y: 0 }], fogOver(HALL))).toBe(0);
    expect(coveredShare([{ x: Number.NaN, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }], fogOver(HALL))).toBe(0);
  });
});

describe('the rooms that still need fog', () => {
  it('are those the fog does not cover all but whole: a room half in fog is painted, one a hair short of covered is not', () => {
    expect(roomsToHide([HALL, VAULT], [])).toEqual([HALL, VAULT]);
    expect(roomsToHide([HALL, VAULT], fogOver(HALL))).toEqual([VAULT]);
    expect(roomsToHide([HALL, VAULT], fogOver(rect(140, 140, 140, 280)))).toEqual([HALL, VAULT]);
    // Fog drawn by hand a pixel inside the walls is the room's.
    expect(roomsToHide([HALL], fogOver(rect(141, 141, 278, 278)))).toEqual([]);
    // One with a strip of a tenth left open is not hidden yet.
    expect(roomsToHide([HALL], fogOver(rect(140, 140, 252, 280)))).toEqual([HALL]);
    expect(roomsToHide([], fogOver(HALL))).toEqual([]);
  });
});

const MAP = { x: 0, y: 0, width: 1400, height: 1050 };
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
const roomWalls = (x: number, y: number, width: number, height: number): WallInput[] => rect(x, y, width, height).map((corner, index, corners) => ({ type: 'solid', p1: corner, p2: corners[(index + 1) % corners.length]! }));

function scene(): { store: ViewAtlasStore; fog: () => FogOperation[]; covers: (x: number, y: number) => boolean; steps: () => number; undo: () => void; redo: () => void } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `fog-room-cover-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const history = getHistoryStore(store)!;
  return {
    store,
    fog: () => Object.values(store.getState().objects.fog),
    covers: (x, y) => fogCoverage(store.getState().objects.fog).covers({ x, y }),
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
    redo: () => history.getState().redo(),
  };
}
const outlines = (fog: readonly FogOperation[]): string[][] => fog.map((operation) => (operation as FogLassoFill).points.map(({ x, y }) => `${x},${y}`).sort()).sort();

describe('hiding every room in the store', () => {
  it('paints plain fog over every room, in one undo step that undo takes back whole', () => {
    const { store, fog, covers, steps, undo, redo } = scene();
    for (const wall of [...roomWalls(140, 140, 280, 280), ...roomWalls(700, 140, 210, 280), ...roomWalls(700, 490, 280, 140)]) store.getState().addWall(wall);
    const before = steps();
    expect(store.getState().hideRooms(MAP)).toEqual({ rooms: 3, hidden: 3 });
    expect(steps()).toBe(before + 1);
    expect(outlines(fog())).toEqual([
      ['140,140', '140,420', '420,140', '420,420'],
      ['700,140', '700,420', '910,140', '910,420'],
      ['700,490', '700,630', '980,490', '980,630'],
    ]);
    expect(fog().every((operation) => operation.type === 'lasso' && !operation.isErasing && !('area' in operation))).toBe(true);
    expect([covers(300, 300), covers(800, 550), covers(560, 300)]).toEqual([true, true, false]);
    // Each acts after the one before, so they stay in the order they were made.
    expect(new Set(fog().map((operation) => operation.timestamp)).size).toBe(3);
    undo();
    expect(fog()).toEqual([]);
    redo();
    expect(fog()).toHaveLength(3);

    // Again there is nothing to paint, and no undo step.
    expect(store.getState().hideRooms(MAP)).toEqual({ rooms: 3, hidden: 0 });
    expect(steps()).toBe(before + 1);
  });

  it('paints the rooms that are not fog yet: one erased since, one half painted by hand, and none under a cover', () => {
    const { store, fog, covers, steps } = scene();
    for (const wall of [...roomWalls(140, 140, 280, 280), ...roomWalls(700, 140, 210, 280), ...roomWalls(700, 490, 280, 140)]) store.getState().addWall(wall);
    store.getState().hideRooms(MAP);
    store.getState().addFogOperation({ type: 'rectangle', isErasing: true, x: 100, y: 100, width: 400, height: 400 });
    store.getState().addFogOperation({ type: 'rectangle', isErasing: true, x: 800, y: 100, width: 200, height: 380 });
    expect([covers(300, 300), covers(850, 300)]).toEqual([false, false]);
    const before = steps();
    expect(store.getState().hideRooms(MAP)).toEqual({ rooms: 3, hidden: 2 });
    expect(steps()).toBe(before + 1);
    expect([covers(300, 300), covers(850, 300), covers(800, 550)]).toEqual([true, true, true]);
    // The level's fog as the view has it may be handed in: under a cover no room needs any.
    const count = fog().length;
    expect(store.getState().hideRooms(MAP, fogCoverage({ all: { id: 'all', kind: 'fog', type: 'rectangle', timestamp: 1, isErasing: false, ...MAP } }).shape)).toEqual({ rooms: 3, hidden: 0 });
    expect(fog()).toHaveLength(count);
  });

  it('paints nothing without a map, without walls, or where the walls enclose nothing', () => {
    const { store, fog, steps } = scene();
    expect(store.getState().hideRooms(MAP)).toEqual({ rooms: 0, hidden: 0 });
    for (const wall of roomWalls(140, 140, 280, 280).slice(0, 3)) store.getState().addWall(wall);
    const before = steps();
    expect(store.getState().hideRooms(MAP)).toEqual({ rooms: 0, hidden: 0 });
    expect(store.getState().hideRooms(null)).toEqual({ rooms: 0, hidden: 0 });
    expect(fog()).toEqual([]);
    expect(steps()).toBe(before);
  });

  it('reads the walls and the fog of the level shown, and puts the fog on it', () => {
    const { store, fog } = scene();
    store.setState({ levels: LEVELS, viewedLevel: 'ground' });
    for (const wall of roomWalls(140, 140, 280, 280)) store.getState().addWall(wall);
    store.getState().setViewedLevel('upper');
    expect(store.getState().hideRooms(MAP)).toEqual({ rooms: 0, hidden: 0 });
    for (const wall of roomWalls(140, 140, 280, 280)) store.getState().addWall(wall);
    expect(store.getState().hideRooms(MAP)).toEqual({ rooms: 1, hidden: 1 });
    expect(fog()).toEqual([expect.objectContaining({ level: 'upper' })]);
    // The room below is the same ground, and has no fog of its own.
    store.getState().setViewedLevel('ground');
    expect(store.getState().hideRooms(MAP)).toEqual({ rooms: 1, hidden: 1 });
    expect(fog().map((operation) => operation.level).sort()).toEqual(['ground', 'upper']);
  });

  it('paints nothing over fog that cannot be worked out: such a map draws covered', () => {
    const { store, fog } = scene();
    for (const wall of roomWalls(140, 140, 280, 280)) store.getState().addWall(wall);
    const broken = { id: 'broken', kind: 'fog', type: 'lasso', timestamp: 1, isErasing: false, points: [{ x: 0, y: 0 }, { x: Number.NaN, y: 5 }, { x: 9, y: 9 }] } as FogOperation;
    store.setState((state) => ({ objects: { ...state.objects, fog: { broken } } }));
    expect(store.getState().hideRooms(MAP)).toEqual({ rooms: 1, hidden: 0 });
    expect(fog()).toHaveLength(1);
  });
});
