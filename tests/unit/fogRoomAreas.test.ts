import { describe, expect, it } from 'vitest';
import { coveredShare } from '../../src/app/fog/fogAreaShapes';
import { areaOutline, fogAreaList, MAX_FOG_AREAS, type FogArea } from '../../src/app/fog/fogAreas';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { areaOfRoom, isAreaOfRoom, planRoomAreas, type RoomPiece } from '../../src/app/fog/fogRoomAreas';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallInput } from '../../src/app/types/wallTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const rect = (x: number, y: number, width: number, height: number): Point[] => [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
/** A texel of a room's raster on an ordinary map. */
const REACH = 4;
const HALL = rect(140, 140, 280, 280);
const hidden = (...outlines: Point[][]): RoomPiece[] => outlines.map((outline) => ({ outline, hidden: true }));

describe('the share of an outline another covers', () => {
  it('is all of it, a part, or nothing', () => {
    expect(coveredShare(HALL, rect(100, 100, 400, 400))).toBe(1);
    expect(coveredShare(HALL, rect(280, 140, 280, 280))).toBeCloseTo(0.5, 9);
    expect(coveredShare(HALL, rect(500, 140, 100, 100))).toBe(0);
    // An outline that encloses nothing has no share.
    expect(coveredShare([{ x: 0, y: 0 }, { x: 10, y: 0 }], HALL)).toBe(0);
    expect(coveredShare(HALL, [{ x: Number.NaN, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }])).toBe(0);
  });
});

describe('whether an area is a room already', () => {
  it('is, with the same corners, each within a texel of its like, whatever corner it starts at', () => {
    expect(isAreaOfRoom(HALL, rect(140, 140, 280, 280), REACH)).toBe(true);
    expect(isAreaOfRoom(HALL, rect(142, 138, 277, 284), REACH)).toBe(true);
    expect(isAreaOfRoom(HALL, [...HALL.slice(2), ...HALL.slice(0, 2)].reverse(), REACH)).toBe(true);
  });

  it('is, where the two cover nearly all of each other though their corners differ', () => {
    // A corner more on one wall, and an outline a few pixels inside the walls.
    expect(isAreaOfRoom(HALL, [...HALL.slice(0, 1), { x: 280, y: 140 }, ...HALL.slice(1)], REACH)).toBe(true);
    expect(isAreaOfRoom(HALL, rect(146, 141, 273, 278), REACH)).toBe(true);
  });

  it('is not, where it covers less of the room, more than the room, or lies elsewhere', () => {
    expect(isAreaOfRoom(HALL, rect(140, 140, 140, 280), REACH)).toBe(false);
    expect(isAreaOfRoom(HALL, rect(100, 100, 400, 400), REACH)).toBe(false);
    expect(isAreaOfRoom(HALL, rect(160, 160, 240, 240), REACH)).toBe(false);
    expect(isAreaOfRoom(HALL, rect(700, 140, 280, 280), REACH)).toBe(false);
    expect(isAreaOfRoom(HALL, [], REACH)).toBe(false);
    // A long passage and one a tenth shorter are two.
    expect(isAreaOfRoom(rect(0, 0, 1000, 40), rect(0, 0, 900, 40), REACH)).toBe(false);
    expect(isAreaOfRoom(rect(0, 0, 1000, 40), rect(0, 0, 980, 40), REACH)).toBe(true);
  });

  it('finds the area among a level\'s', () => {
    const areas = [rect(700, 140, 280, 280), rect(141, 141, 279, 279)];
    expect(areaOfRoom(HALL, areas, REACH)).toBe(1);
    expect(areaOfRoom(rect(0, 500, 100, 100), areas, REACH)).toBe(-1);
  });
});

describe('the areas made of a map\'s rooms', () => {
  const VAULT = rect(420, 140, 280, 280);
  const CELL = rect(700, 490, 140, 140);

  it('are one per room, as the room is, and none of a room that is an area already', () => {
    const plan = planRoomAreas([HALL, VAULT, CELL], hidden(rect(141, 141, 279, 279)), REACH);
    expect(plan).toEqual({ shapes: [{ type: 'lasso', points: VAULT }, { type: 'lasso', points: CELL }], hide: [] });
    expect(planRoomAreas([], [], REACH)).toEqual({ shapes: [], hide: [] });
  });

  it('hide the area of a room again where it is revealed, and make none of it', () => {
    const pieces: RoomPiece[] = [{ outline: VAULT, hidden: true }, { outline: rect(141, 141, 279, 279), hidden: false }, { outline: CELL, hidden: false }];
    expect(planRoomAreas([HALL, VAULT, CELL], pieces, REACH)).toEqual({ shapes: [], hide: [1, 2] });
  });

  it('end where the areas there are begin', () => {
    // An area over the right two fifths of the vault: the vault's area is the rest of it.
    const { shapes } = planRoomAreas([VAULT], hidden(rect(588, 100, 400, 400)), REACH);
    expect(shapes).toHaveLength(1);
    const [shape] = shapes;
    expect(shape?.type === 'lasso' ? shape.points.map(({ x, y }) => `${x},${y}`).sort() : []).toEqual(['420,140', '420,420', '588,140', '588,420']);
  });

  it('are none of a room the areas there are cover more than half of, one area or several together', () => {
    // An area drawn by hand over the left three fifths of the hall: pressed again, nothing is stacked on it.
    expect(planRoomAreas([HALL, VAULT], hidden(rect(100, 100, 208, 400)), REACH).shapes).toEqual([{ type: 'lasso', points: VAULT }]);
    // Two areas of a third and a quarter of the hall, apart: together more than half.
    expect(planRoomAreas([HALL], hidden(rect(140, 140, 94, 280), rect(350, 140, 70, 280)), REACH).shapes).toEqual([]);
    // The same two over each other cover a third: the hall gets its area, less them.
    const { shapes } = planRoomAreas([HALL], hidden(rect(140, 140, 94, 280), rect(140, 140, 70, 280)), REACH);
    expect(shapes).toHaveLength(1);
    // Exactly half is not more than half.
    expect(planRoomAreas([HALL], hidden(rect(140, 140, 140, 280)), REACH).shapes).toHaveLength(1);
  });
});

const MAP = { x: 0, y: 0, width: 1400, height: 1050 };
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
const roomWalls = (x: number, y: number, width: number, height: number): WallInput[] => rect(x, y, width, height).map((corner, index, corners) => ({ type: 'solid', p1: corner, p2: corners[(index + 1) % corners.length]! }));

function scene(): { store: ViewAtlasStore; areas: () => readonly FogArea[]; steps: () => number; undo: () => void; redo: () => void } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `fog-room-areas-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const history = getHistoryStore(store)!;
  return {
    store,
    areas: () => fogAreaList(store.getState().objects.fog),
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
    redo: () => history.getState().redo(),
  };
}
const outlines = (areas: readonly FogArea[]): string[][] => areas.map((area) => areaOutline(area).map(({ x, y }) => `${x},${y}`).sort()).sort();

describe('hiding every room in the store', () => {
  it('makes a hidden area of every room, in one undo step that undo takes back whole', () => {
    const { store, areas, steps, undo, redo } = scene();
    for (const wall of [...roomWalls(140, 140, 280, 280), ...roomWalls(700, 140, 210, 280), ...roomWalls(700, 490, 280, 140)]) store.getState().addWall(wall);
    const before = steps();
    expect(store.getState().addRoomAreas(MAP)).toEqual({ rooms: 3, made: 3 });
    expect(steps()).toBe(before + 1);
    expect(outlines(areas())).toEqual([
      ['140,140', '140,420', '420,140', '420,420'],
      ['700,140', '700,420', '910,140', '910,420'],
      ['700,490', '700,630', '980,490', '980,630'],
    ]);
    expect(areas().every((area) => area.isErasing === false && area.type === 'lasso')).toBe(true);
    const fog = fogCoverage(store.getState().objects.fog);
    expect([fog.covers({ x: 300, y: 300 }), fog.covers({ x: 800, y: 550 }), fog.covers({ x: 560, y: 300 })]).toEqual([true, true, false]);
    // Each acts after the one before, so they stay in the order they were made.
    const times = Object.values(store.getState().objects.fog).map((operation) => operation.timestamp);
    expect(new Set(times).size).toBe(3);
    undo();
    expect(areas()).toEqual([]);
    redo();
    expect(areas()).toHaveLength(3);

    // Again there is nothing to make, and no undo step.
    expect(store.getState().addRoomAreas(MAP)).toEqual({ rooms: 3, made: 0 });
    expect(steps()).toBe(before + 1);
  });

  it('hides a room again whose area was revealed, with the others, in the one undo step', () => {
    const { store, areas, steps, undo } = scene();
    for (const wall of [...roomWalls(140, 140, 280, 280), ...roomWalls(700, 140, 210, 280)]) store.getState().addWall(wall);
    store.getState().addRoomAreas(MAP);
    const hall = areas().find((area) => areaOutline(area).some((corner) => corner.x === 140))!;
    store.getState().flipFogArea(hall.id);
    // A room walled in since.
    for (const wall of roomWalls(700, 490, 280, 140)) store.getState().addWall(wall);
    const before = steps();
    expect(store.getState().addRoomAreas(MAP)).toEqual({ rooms: 3, made: 2 });
    expect(steps()).toBe(before + 1);
    expect(areas()).toHaveLength(3);
    expect(areas().every((area) => area.isErasing === false)).toBe(true);
    expect(fogCoverage(store.getState().objects.fog).covers({ x: 300, y: 300 })).toBe(true);
    undo();
    expect(areas()).toHaveLength(2);
    expect(areas().find((area) => area.id === hall.id)).toMatchObject({ isErasing: true });
  });

  it('makes nothing without a map, without walls, or where the walls enclose nothing', () => {
    const { store, areas, steps } = scene();
    expect(store.getState().addRoomAreas(MAP)).toEqual({ rooms: 0, made: 0 });
    for (const wall of roomWalls(140, 140, 280, 280).slice(0, 3)) store.getState().addWall(wall);
    const before = steps();
    expect(store.getState().addRoomAreas(MAP)).toEqual({ rooms: 0, made: 0 });
    expect(store.getState().addRoomAreas(null)).toEqual({ rooms: 0, made: 0 });
    expect(areas()).toEqual([]);
    expect(steps()).toBe(before);
  });

  it('reads the walls of the level shown, and puts the areas on it', () => {
    const { store, areas } = scene();
    store.setState({ levels: LEVELS, viewedLevel: 'ground' });
    for (const wall of roomWalls(140, 140, 280, 280)) store.getState().addWall(wall);
    store.getState().setViewedLevel('upper');
    expect(store.getState().addRoomAreas(MAP)).toEqual({ rooms: 0, made: 0 });
    for (const wall of roomWalls(700, 140, 210, 280)) store.getState().addWall(wall);
    expect(store.getState().addRoomAreas(MAP)).toEqual({ rooms: 1, made: 1 });
    expect(areas()).toEqual([expect.objectContaining({ level: 'upper' })]);
    store.getState().setViewedLevel('ground');
    expect(store.getState().addRoomAreas(MAP)).toMatchObject({ rooms: 1, made: 1 });
    expect(areas().map((area) => area.level).sort()).toEqual(['ground', 'upper']);
  });

  it(`hides the rooms past the areas a level holds (${MAX_FOG_AREAS}) as plain fog`, () => {
    const { store, areas } = scene();
    for (const wall of [...roomWalls(140, 140, 280, 280), ...roomWalls(700, 140, 210, 280)]) store.getState().addWall(wall);
    store.setState((state) => ({
      objects: {
        ...state.objects,
        fog: Object.fromEntries(Array.from({ length: MAX_FOG_AREAS - 1 }, (_, index) => [`a${String(index).padStart(4, '0')}`, { id: `a${String(index).padStart(4, '0')}`, kind: 'fog', timestamp: index, type: 'rectangle', isErasing: false, x: 1200, y: index, width: 1, height: 1, area: {} }])),
      },
    }));
    expect(store.getState().addRoomAreas(MAP)).toEqual({ rooms: 2, made: 2 });
    expect(areas()).toHaveLength(MAX_FOG_AREAS);
    expect(Object.keys(store.getState().objects.fog)).toHaveLength(MAX_FOG_AREAS + 1);
    const fog = fogCoverage(store.getState().objects.fog);
    expect([fog.covers({ x: 300, y: 300 }), fog.covers({ x: 800, y: 300 })]).toEqual([true, true]);
  });
});
