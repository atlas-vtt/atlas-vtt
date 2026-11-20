import { describe, expect, it } from 'vitest';
import { fogAreaList, lassoOutline } from '../../src/app/fog/fogAreas';
import { areaAt, fogBodyAt } from '../../src/app/fog/fogBody';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { keyholed, outlineRings } from '../../src/app/fog/fogKeyhole';
import { fogOperationShape } from '../../src/app/fog/fogOperationShape';
import { roomAt } from '../../src/app/fog/fogRooms';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { FogOperation } from '../../src/app/types/fogTypes';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallInput, WallSegment } from '../../src/app/types/wallTypes';
import { pointInPolygon } from '../../src/app/vision/visibility';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const MAP = { x: 0, y: 0, width: 1400, height: 1050 };
const CELL = 70;
const rect = (x: number, y: number, width: number, height: number): Point[] => [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
const at = (x: number, y: number): Point => ({ x, y });
const insideOutline = (point: Point, outline: readonly Point[]): boolean => pointInPolygon(point, [...outline]);
const sides = (corners: readonly Point[]): WallInput[] => corners.map((corner, index) => ({ type: 'solid', p1: corner, p2: corners[(index + 1) % corners.length]! }));
/** The walls of the review's scene: a corridor all round a block of two rooms. */
const WALLS: WallInput[] = [...sides(rect(140, 140, 700, 560)), ...sides(rect(210, 210, 560, 420)), { type: 'solid', p1: at(490, 210), p2: at(490, 630) }];
const segments = (walls: readonly WallInput[]): WallSegment[] => walls.map((wall, index) => ({ ...wall, id: `w${index}`, kind: 'wall' }) as WallSegment);

const OUTER = rect(140, 140, 700, 560);
const BLOCK = rect(210, 210, 560, 420);
/** The corridor as one outline. */
const CORRIDOR = keyholed(OUTER, [BLOCK]);
/** A place on each side of the corridor, and one in each room it runs round. */
const IN_CORRIDOR = [at(175, 400), at(500, 175), at(805, 400), at(500, 665)];
const IN_ROOMS = [at(350, 420), at(630, 420)];

const signedArea = (outline: readonly Point[]): number => {
  let twice = 0;
  outline.forEach((a, index) => {
    const b = outline[(index + 1) % outline.length]!;
    twice += a.x * b.y - b.x * a.y;
  });
  return twice / 2;
};
const lasso = (id: string, points: readonly Point[], isErasing: boolean, timestamp: number): FogOperation => ({ id, kind: 'fog', type: 'lasso', points: [...points], isErasing, timestamp });
const keys = (outline: readonly Point[]): string[] => outline.map(({ x, y }) => `${x},${y}`);

describe('an outline with a slit to each hole', () => {
  it('runs round the outline, out to the hole\'s nearest corner, round it the other way and back', () => {
    expect(keys(CORRIDOR)).toEqual(['140,140', '210,210', '210,630', '770,630', '770,210', '210,210', '140,140', '840,140', '840,700', '140,700']);
    // The slit takes nothing: the outline encloses the ground less the hole.
    expect(Math.abs(signedArea(CORRIDOR))).toBe(700 * 560 - 560 * 420);
  });

  it('turns a hole that runs the outline\'s way round, and leaves an outline without holes as it is', () => {
    expect(keys(keyholed(OUTER, [[...BLOCK].reverse()])).sort()).toEqual(keys(CORRIDOR).sort());
    expect(Math.abs(signedArea(keyholed(OUTER, [[...BLOCK].reverse()])))).toBe(700 * 560 - 560 * 420);
    expect(keyholed(OUTER, [])).toEqual(OUTER);
    expect(keyholed(OUTER, [[at(300, 300), at(400, 300)]])).toEqual(OUTER);
  });

  it('reaches every hole on a slit that crosses no edge, a hole behind a hole from that one', () => {
    // Three blocks in a row from the left wall: the middle and the far one are nearest their neighbour.
    const holes = [rect(700, 350, 70, 140), rect(280, 350, 70, 140), rect(490, 350, 70, 140)];
    const outline = keyholed(OUTER, holes);
    expect(outline).toHaveLength(4 + 3 * 6);
    expect(Math.abs(signedArea(outline))).toBe(700 * 560 - 3 * 70 * 140);
    for (const hole of holes) expect(insideOutline(at(hole[0]!.x + 35, hole[0]!.y + 70), outline)).toBe(false);
    expect(insideOutline(at(420, 420), outline)).toBe(true);
    expect(outlineRings(outline).map((ring) => ring.length).sort()).toEqual([4, 4, 4, 4]);
  });

  it('is given back as its rings, without the slit: itself where it has none', () => {
    expect(outlineRings(OUTER)).toEqual([OUTER]);
    expect(outlineRings(OUTER)[0]).toBe(OUTER);
    const rings = outlineRings(CORRIDOR);
    expect(rings.map((ring) => keys(ring).sort())).toEqual([keys(BLOCK).sort(), keys(OUTER).sort()]);
    // The same rings for the same outline, and the same wherever the outline begins.
    expect(outlineRings(CORRIDOR)).toBe(rings);
    const turned = [...CORRIDOR.slice(4), ...CORRIDOR.slice(0, 4)];
    expect(outlineRings(turned).map((ring) => keys(ring).sort()).sort()).toEqual([keys(BLOCK).sort(), keys(OUTER).sort()].sort());
  });
});

describe('fog of an outline with a hole', () => {
  it('covers the ground and leaves the hole, as one shape of an outer ring and a hole', () => {
    const shape = fogOperationShape(lasso('a', CORRIDOR, false, 1));
    expect(shape).toHaveLength(2);
    const fog = fogCoverage({ a: lasso('a', CORRIDOR, false, 1) });
    expect(IN_CORRIDOR.map((place) => fog.covers(place))).toEqual([true, true, true, true]);
    expect(IN_ROOMS.map((place) => fog.covers(place))).toEqual([false, false]);
    // Along the slit the corridor is covered like the rest of it.
    expect(fog.covers(at(175, 175))).toBe(true);
    expect(fog.covers(at(160, 190))).toBe(true);
  });

  it('is revealed without the rooms inside: they stay hidden', () => {
    const fog = fogCoverage({ all: { id: 'all', kind: 'fog', type: 'rectangle', x: 0, y: 0, width: 1400, height: 1050, isErasing: false, timestamp: 1 }, a: lasso('a', CORRIDOR, true, 2) });
    expect(IN_CORRIDOR.map((place) => fog.covers(place))).toEqual([false, false, false, false]);
    expect(IN_ROOMS.map((place) => fog.covers(place))).toEqual([true, true]);
    expect(fog.covers(at(100, 100))).toBe(true);
  });

  it('is the room a click in the corridor finds: the review\'s scene', () => {
    const corridor = roomAt(at(175, 400), segments(WALLS), MAP, CELL)!;
    const fog = fogCoverage({ all: { id: 'all', kind: 'fog', type: 'rectangle', x: 0, y: 0, width: 1400, height: 1050, isErasing: false, timestamp: 1 }, a: lasso('a', corridor, true, 2) });
    expect(IN_CORRIDOR.map((place) => fog.covers(place))).toEqual([false, false, false, false]);
    expect(IN_ROOMS.map((place) => fog.covers(place))).toEqual([true, true]);
  });
});

describe('revealed fog with a hole, which is remembered', () => {
  it('is found by a place on its ground, and not by one in its hole', () => {
    const corridor = { ...lasso('corridor', CORRIDOR, true, 1), area: {} };
    const room = { ...lasso('room', rect(210, 210, 280, 420), true, 2), area: {} };
    const areas = fogAreaList({ corridor, room });
    expect(areaAt(areas, at(175, 400))?.id).toBe('corridor');
    expect(areaAt(areas, at(350, 420))?.id).toBe('room');
    expect(areaAt(areas, at(630, 420))).toBeNull();
  });

  it('keeps its outline as it is, however many corners it has', () => {
    expect(lassoOutline(CORRIDOR)).toEqual(CORRIDOR);
    // A round court of 400 corners round a round block of 100.
    const round = (radius: number, count: number): Point[] => Array.from({ length: count }, (_, i) => at(500 + radius * Math.cos((i / count) * 2 * Math.PI), 500 + radius * Math.sin((i / count) * 2 * Math.PI)));
    const court = keyholed(round(400, 400), [round(100, 100)]);
    expect(lassoOutline(court)).toEqual(court);
  });
});

describe('a body of fog round a hole', () => {
  it('is one outline with a slit to the hole: revealed with it, fog that stands free in the hole stays', () => {
    const fog = { corridor: lasso('corridor', CORRIDOR, false, 1), island: { ...lasso('island', rect(350, 350, 70, 70), false, 2) } };
    const body = fogBodyAt(fogCoverage(fog).shape, at(175, 400))!;
    expect(Math.abs(signedArea(body))).toBe(700 * 560 - 560 * 420);
    expect(outlineRings(body).map((ring) => keys(ring).sort()).sort()).toEqual([keys(BLOCK).sort(), keys(OUTER).sort()].sort());
    const after = fogCoverage({ ...fog, reveal: lasso('reveal', body, true, 3) });
    expect(IN_CORRIDOR.map((place) => after.covers(place))).toEqual([false, false, false, false]);
    expect(after.covers(at(385, 385))).toBe(true);
    // The island is a body of its own, and the open ground of the hole is none.
    expect(keys(fogBodyAt(fogCoverage(fog).shape, at(385, 385))!).sort()).toEqual(keys(rect(350, 350, 70, 70)).sort());
    expect(fogBodyAt(fogCoverage(fog).shape, at(600, 420))).toBeNull();
  });
});

describe('hiding every room of walls round rooms, in the store', () => {
  function scene(): { store: ViewAtlasStore; undo: () => void } {
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, `fog-keyhole-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    for (const wall of WALLS) store.getState().addWall(wall);
    return { store, undo: () => getHistoryStore(store)!.getState().undo() };
  }
  const covered = (store: ViewAtlasStore, places: readonly Point[]): boolean[] => {
    const fog = fogCoverage(store.getState().objects.fog);
    return places.map((place) => fog.covers(place));
  };

  it('paints the corridor without the rooms it runs round, and each room: together they are one body of fog', () => {
    const { store, undo } = scene();
    expect(store.getState().hideRooms(MAP)).toEqual({ rooms: 3, hidden: 3 });
    expect(Object.values(store.getState().objects.fog).every((operation) => operation.type === 'lasso' && !operation.isErasing && !('area' in operation))).toBe(true);
    expect(covered(store, [...IN_CORRIDOR, ...IN_ROOMS])).toEqual([true, true, true, true, true, true]);
    // The corridor's own fog leaves its rooms out: erased again, they stay.
    const corridor = Object.values(store.getState().objects.fog).find((operation) => operation.type === 'lasso' && operation.points.length > 4)!;
    store.getState().addFogOperation({ type: 'lasso', isErasing: true, points: corridor.type === 'lasso' ? corridor.points : [] });
    expect(covered(store, IN_CORRIDOR)).toEqual([false, false, false, false]);
    expect(covered(store, IN_ROOMS)).toEqual([true, true]);
    // Pressed again, the corridor alone is painted: the rooms are fog already.
    expect(store.getState().hideRooms(MAP)).toEqual({ rooms: 3, hidden: 1 });
    expect(store.getState().hideRooms(MAP)).toEqual({ rooms: 3, hidden: 0 });
    // Rooms that share walls touch: the three are one body.
    const body = fogBodyAt(fogCoverage(store.getState().objects.fog).shape, IN_CORRIDOR[0]!)!;
    expect(keys(body).sort()).toEqual(keys(OUTER).sort());
    undo();
    undo();
    undo();
    expect(store.getState().objects.fog).toEqual({});
  });
});
