import { describe, expect, it } from 'vitest';
import { fogCoverage, type FogCoverage } from '../../src/app/fog/fogCoverage';
import { exploredShapes, exploreReach, FOG_EXPLORE_DISTANCE, readFogExplore, revealOperations, revealsOf } from '../../src/app/fog/fogExplore';
import { sealedWalls } from '../../src/app/lighting/sealWalls';
import type { FogOperation } from '../../src/app/types/fogTypes';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { pointInPolygon } from '../../src/app/vision/visibility';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSegment> = {}): WallSegment => (
  { id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...extra }
);
const rectFog = (id: string, x: number, y: number, width: number, height: number, timestamp: number, isErasing = false): FogOperation => (
  { id, kind: 'fog', type: 'rectangle', timestamp, isErasing, x, y, width, height }
);
const coverageOf = (...operations: FogOperation[]): FogCoverage => fogCoverage(Object.fromEntries(operations.map((operation) => [operation.id, operation])));
/** The whole of a 2000 px map under fog. */
const ALL = coverageOf(rectFog('all', 0, 0, 2000, 2000, 1));
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The fog left once `outlines` are revealed. */
function after(coverage: FogOperation[], outlines: Point[][]): FogCoverage {
  const reveals = revealOperations(outlines).map((input, index): FogOperation => ({ id: `reveal${index}`, kind: 'fog', timestamp: 1000 + index, ...input }));
  return coverageOf(...coverage, ...reveals);
}

describe('readFogExplore', () => {
  it('reads a distance in cells within the range', () => {
    expect(readFogExplore({ distance: 4 })).toEqual({ distance: 4 });
    expect(readFogExplore({ distance: FOG_EXPLORE_DISTANCE.min })).toEqual({ distance: 1 });
    expect(readFogExplore({ distance: FOG_EXPLORE_DISTANCE.max })).toEqual({ distance: 50 });
    expect(readFogExplore({ distance: 2.5 })).toEqual({ distance: 2.5 });
  });

  it('reads as unset what is no distance from 1 to 50 cells', () => {
    for (const value of [undefined, null, 4, 'on', true, [], [4], {}, { distance: '4' }, { distance: null }, { distance: 0 }, { distance: 0.99 }, { distance: -3 },
      { distance: 50.01 }, { distance: Number.NaN }, { distance: Number.POSITIVE_INFINITY }, JSON.parse('{"distance":1e999}')]) {
      expect(readFogExplore(value)).toBeUndefined();
    }
  });

  it('keeps what a later version wrote beside the distance', () => {
    expect(readFogExplore({ distance: 6, shape: 'cone' })).toEqual({ distance: 6, shape: 'cone' });
  });
});

describe('exploreReach', () => {
  it('is the distance in cells of the scene\'s grid, and of 70 px cells where the scene has none', () => {
    expect(exploreReach({ distance: 4 }, { size: 50 })).toBe(200);
    expect(exploreReach({ distance: 4 }, null)).toBe(280);
    expect(exploreReach({ distance: 2 }, { size: 0 })).toBe(140);
  });
});

describe('exploredShapes', () => {
  it('is a disc of the reach around each place where no wall is near', () => {
    const [shape, other] = exploredShapes([{ x: 500, y: 400 }, { x: 1200, y: 900 }], 280, []);
    expect(shape).toHaveLength(48);
    for (const corner of shape!) expect(distance(corner, { x: 500, y: 400 })).toBeCloseTo(280, 9);
    for (const corner of other!) expect(distance(corner, { x: 1200, y: 900 })).toBeCloseTo(280, 9);
  });

  it('stays a disc beside walls out of reach, walls that stop only light and open doors', () => {
    const walls = [
      wall('far', 900, 0, 900, 800),
      wall('glass', 520, 0, 520, 800, { blocks: 'light' }),
      wall('door', 480, 0, 480, 800, { type: 'door', closed: false }),
    ];
    expect(exploredShapes([{ x: 500, y: 400 }], 280, walls)[0]).toHaveLength(48);
  });

  it('ends at a wall that stops sight, and reaches the full distance on the near side', () => {
    const centre = { x: 500, y: 400 };
    // A wall 100 px to the right, longer than the disc is tall.
    const [shape] = exploredShapes([centre], 280, [wall('w', 600, 0, 600, 800)]);
    expect(Math.max(...shape!.map((corner) => corner.x))).toBeCloseTo(600, 6);
    expect(Math.min(...shape!.map((corner) => corner.x))).toBeCloseTo(220, 0);
    expect(pointInPolygon({ x: 590, y: 400 }, shape!)).toBe(true);
    expect(pointInPolygon({ x: 610, y: 400 }, shape!)).toBe(false);
    for (const corner of shape!) expect(distance(corner, centre)).toBeLessThanOrEqual(280 + 1e-6);
  });

  it('stops at a closed door and at a curtain, and passes the gap beside a wall', () => {
    const centre = { x: 500, y: 400 };
    const behind = { x: 650, y: 400 };
    expect(pointInPolygon(behind, exploredShapes([centre], 280, [wall('d', 600, 0, 600, 800, { type: 'door', closed: true })])[0]!)).toBe(false);
    expect(pointInPolygon(behind, exploredShapes([centre], 280, [wall('c', 600, 0, 600, 800, { blocks: 'sight' })])[0]!)).toBe(false);
    // The wall ends above the token's row: the ground behind it on that row is in view.
    expect(pointInPolygon(behind, exploredShapes([centre], 280, [wall('short', 600, 0, 600, 300)])[0]!)).toBe(true);
    expect(pointInPolygon({ x: 650, y: 200 }, exploredShapes([centre], 280, [wall('short', 600, 0, 600, 300)])[0]!)).toBe(false);
  });

  it('stays inside a room whose corner joints sight takes for closed', () => {
    // Four walls whose ends stop 4 px short of each other at every corner.
    const room = [wall('n', 304, 300, 696, 300), wall('e', 700, 304, 700, 496), wall('s', 696, 500, 304, 500), wall('w', 300, 496, 300, 304)];
    const [shape] = exploredShapes([{ x: 500, y: 400 }], 400, sealedWalls(room, 2));
    for (const corner of shape!) {
      expect(corner.x).toBeGreaterThanOrEqual(300 - 1e-6);
      expect(corner.x).toBeLessThanOrEqual(700 + 1e-6);
      expect(corner.y).toBeGreaterThanOrEqual(300 - 1e-6);
      expect(corner.y).toBeLessThanOrEqual(500 + 1e-6);
    }
  });

  it('reveals nothing for a reach or a place that is no finite number', () => {
    expect(exploredShapes([{ x: 500, y: 400 }], 0, [])).toEqual([]);
    expect(exploredShapes([{ x: 500, y: 400 }], Number.NaN, [])).toEqual([]);
    expect(exploredShapes([{ x: 500, y: 400 }], Number.POSITIVE_INFINITY, [])).toEqual([]);
    expect(exploredShapes([{ x: Number.NaN, y: 400 }, { x: 500, y: Number.POSITIVE_INFINITY }], 280, [])).toEqual([]);
  });
});

describe('revealsOf', () => {
  it('keeps a shape that meets fog, with its corners on eighths of a pixel', () => {
    const shapes = exploredShapes([{ x: 500, y: 400 }], 280, []);
    const [outline, ...more] = revealsOf(shapes, ALL);
    expect(more).toEqual([]);
    expect(outline).toHaveLength(48);
    for (const { x, y } of outline!) {
      expect(Number.isInteger(x * 8)).toBe(true);
      expect(Number.isInteger(y * 8)).toBe(true);
    }
    const left = after([rectFog('all', 0, 0, 2000, 2000, 1)], [outline!]);
    expect(left.covers({ x: 500, y: 400 })).toBe(false);
    expect(left.covers({ x: 500 + 270, y: 400 })).toBe(false);
    expect(left.covers({ x: 500 + 290, y: 400 })).toBe(true);
  });

  it('writes nothing where no fog lies', () => {
    const shapes = exploredShapes([{ x: 500, y: 400 }], 280, []);
    expect(revealsOf(shapes, coverageOf())).toEqual([]);
    // Fog elsewhere on the map, and ground this shape lies in revealed already.
    expect(revealsOf(shapes, coverageOf(rectFog('east', 1000, 0, 1000, 2000, 1)))).toEqual([]);
    expect(revealsOf(shapes, coverageOf(rectFog('all', 0, 0, 2000, 2000, 1), rectFog('open', 200, 100, 600, 600, 2, true)))).toEqual([]);
  });

  it('keeps of several shapes only those that meet fog', () => {
    const shapes = exploredShapes([{ x: 300, y: 400 }, { x: 1500, y: 400 }], 100, []);
    const reveals = revealsOf(shapes, coverageOf(rectFog('east', 1000, 0, 1000, 2000, 1)));
    expect(reveals).toHaveLength(1);
    expect(pointInPolygon({ x: 1500, y: 400 }, reveals[0]!)).toBe(true);
  });

  it('joins shapes that overlap into one outline, and leaves those apart as they are', () => {
    const near = exploredShapes([{ x: 500, y: 400 }, { x: 600, y: 400 }, { x: 1500, y: 1500 }], 100, []);
    const reveals = revealsOf(near, ALL);
    expect(reveals).toHaveLength(2);
    const joined = reveals.find((outline) => pointInPolygon({ x: 550, y: 400 }, outline))!;
    expect(pointInPolygon({ x: 410, y: 400 }, joined)).toBe(true);
    expect(pointInPolygon({ x: 690, y: 400 }, joined)).toBe(true);
    const left = after([rectFog('all', 0, 0, 2000, 2000, 1)], reveals);
    for (const centre of [{ x: 500, y: 400 }, { x: 600, y: 400 }, { x: 1500, y: 1500 }]) expect(left.covers(centre)).toBe(false);
    expect(left.covers({ x: 1000, y: 1000 })).toBe(true);
  });

  it('keeps each shape by itself where joining them would enclose fog', () => {
    // Four discs around a middle none of them reaches.
    const ring = exploredShapes([{ x: 400, y: 500 }, { x: 500, y: 400 }, { x: 600, y: 500 }, { x: 500, y: 600 }], 90, []);
    const reveals = revealsOf(ring, ALL);
    expect(reveals).toHaveLength(4);
    const left = after([rectFog('all', 0, 0, 2000, 2000, 1)], reveals);
    expect(left.covers({ x: 500, y: 500 })).toBe(true);
    expect(left.covers({ x: 400, y: 500 })).toBe(false);
  });

  it('leaves out a shape that lies outside what fog can hold', () => {
    const far = exploredShapes([{ x: 1e9, y: 0 }], 100, []);
    expect(revealsOf(far, ALL)).toEqual([]);
  });
});

describe('revealOperations', () => {
  it('makes one erasing lasso of each outline', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(revealOperations([points])).toEqual([{ type: 'lasso', isErasing: true, points }]);
    expect(revealOperations([])).toEqual([]);
  });
});
