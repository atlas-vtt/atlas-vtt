import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crosses, distToSeg, segOf } from '../../lighting/segments';
import { sealedWalls } from '../../lighting/sealWalls';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import { computeVisibility } from '../../vision/visibility';
import { shapedArea, type ShapedArea } from '../measureGeometry';
import type { Measurement } from '../measureTypes';
import { areaWithinWalls, shapesWithinWalls, wallSweepPoint } from '../measureWalls';
import { AREA_SHAPES, distanceToOutline, inOutline, RULES, seeded } from './areaTestKit';

vi.mock('../../vision/visibility', async (original) => {
  const actual = await original<typeof import('../../vision/visibility')>();
  return { ...actual, computeVisibility: vi.fn(actual.computeVisibility) };
});

function area(measurement: Measurement, rules = RULES): ShapedArea {
  const made = shapedArea(measurement, rules);
  if (!made) throw new Error('no area');
  return made;
}

function wall(id: string, p1: Point, p2: Point, more: Partial<WallSegment> = {}): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1, p2, ...more };
}

const circle = (radius: number, origin: Point = { x: 0, y: 0 }): ShapedArea => area({ shape: 'circle', points: [origin, { x: origin.x + radius, y: origin.y }] });
const ringArea = (ring: readonly Point[]): number => Math.abs(ring.reduce((sum, a, i) => sum + a.x * ring[(i + 1) % ring.length]!.y - ring[(i + 1) % ring.length]!.x * a.y, 0)) / 2;

beforeEach(() => {
  vi.mocked(computeVisibility).mockClear();
});

describe('areaWithinWalls', () => {
  it('stops an area at a wall', () => {
    const cut = areaWithinWalls(circle(200), [wall('w', { x: 100, y: -300 }, { x: 100, y: 300 })]);
    expect(cut.contains({ x: 90, y: 0 })).toBe(true);
    expect(cut.contains({ x: -150, y: 0 })).toBe(true);
    expect(cut.contains({ x: 110, y: 0 })).toBe(false);
    expect(cut.rings).toHaveLength(1);
    expect(cut.bounds.maxX).toBeCloseTo(100, 0);
    expect(cut.bounds.minX).toBeCloseTo(-200, 0);
    // The disc without the part beyond the wall.
    const beyond = 200 * 200 * Math.acos(0.5) - 100 * Math.sqrt(200 * 200 - 100 * 100);
    expect(ringArea(cut.rings[0]!) / (Math.PI * 200 * 200 - beyond)).toBeCloseTo(1, 2);
  });

  it('leaves what lies behind a wall\'s end in its shadow', () => {
    const cut = areaWithinWalls(circle(300), [wall('w', { x: 100, y: -50 }, { x: 100, y: 50 })]);
    expect(cut.contains({ x: 200, y: 0 })).toBe(false);
    expect(cut.contains({ x: 200, y: 99 })).toBe(false);
    expect(cut.contains({ x: 200, y: 101 })).toBe(true);
    expect(cut.contains({ x: 100, y: 60 })).toBe(true);
  });

  it('stops at closed doors and at walls that stop one thing, and passes open doors and windows', () => {
    const across = (more: Partial<WallSegment>): WallSegment[] => [wall('w', { x: 100, y: -300 }, { x: 100, y: 300 }, more)];
    const behind = { x: 150, y: 0 };
    expect(areaWithinWalls(circle(200), across({ type: 'door', closed: true })).contains(behind)).toBe(false);
    expect(areaWithinWalls(circle(200), across({ type: 'secret-door' })).contains(behind)).toBe(false);
    expect(areaWithinWalls(circle(200), across({ blocks: 'sight' })).contains(behind)).toBe(false);
    expect(areaWithinWalls(circle(200), across({ blocks: 'light' })).contains(behind)).toBe(false);
    expect(areaWithinWalls(circle(200), across({ type: 'door', closed: false })).contains(behind)).toBe(true);
    expect(areaWithinWalls(circle(200), across({ blocks: 'movement' })).contains(behind)).toBe(true);
  });

  it('is the area itself where no wall stands in its reach', () => {
    const open = circle(200);
    expect(areaWithinWalls(open, [])).toBe(open);
    expect(areaWithinWalls(open, [wall('far', { x: 5000, y: 0 }, { x: 5000, y: 100 }), wall('open', { x: 50, y: -90 }, { x: 50, y: 90 }, { type: 'door', closed: false })])).toBe(open);
  });

  it('passes a gap between two walls, and not the same gap once the walls are sealed as light has them', () => {
    const walls = [wall('a', { x: 100, y: -300 }, { x: 100, y: -3 }), wall('b', { x: 100, y: 3 }, { x: 100, y: 300 })];
    const behind = { x: 180, y: 0 };
    expect(areaWithinWalls(circle(200), walls).contains(behind)).toBe(true);
    expect(areaWithinWalls(circle(200), sealedWalls(walls, 2)).contains(behind)).toBe(false);
  });

  it('keeps a cone from the foot of a wall on the side it points to', () => {
    // The apex lies on the wall, where an area's origin snaps to; the cone points a little below it.
    const walls = [wall('w', { x: -200, y: 0 }, { x: 400, y: 0 })];
    const down = area({ shape: 'cone', points: [{ x: 0, y: 0 }, { x: 290, y: 78 }] }, { ...RULES, coneAngle: 90 });
    expect(down.contains({ x: 200, y: -60 })).toBe(true);
    const cut = areaWithinWalls(down, walls);
    expect(cut.contains({ x: 200, y: -60 })).toBe(false);
    expect(cut.contains({ x: 200, y: 60 })).toBe(true);
    expect(cut.bounds.minY).toBeGreaterThanOrEqual(-0.2);
    expect(wallSweepPoint(down, walls).y).toBeGreaterThan(0);
    // Off every wall an area is reached from its origin itself.
    expect(wallSweepPoint(circle(100, { x: 0, y: 40 }), walls)).toEqual({ x: 0, y: 40 });
  });

  it('keeps a circle whose centre lies on a wall on the side it was dragged to', () => {
    const walls = [wall('w', { x: -400, y: 0 }, { x: 400, y: 0 })];
    const dragged = (end: Point): ReturnType<typeof areaWithinWalls> => areaWithinWalls(area({ shape: 'circle', points: [{ x: 0, y: 0 }, end] }), walls);
    const below = dragged({ x: 60, y: 80 });
    expect(below.contains({ x: 0, y: 50 })).toBe(true);
    expect(below.contains({ x: 0, y: -50 })).toBe(false);
    expect(below.bounds.minY).toBeGreaterThanOrEqual(-0.2);
    const above = dragged({ x: 60, y: -80 });
    expect(above.contains({ x: 0, y: -50 })).toBe(true);
    expect(above.contains({ x: 0, y: 50 })).toBe(false);
    // A drag along the wall itself still takes one side, never both.
    const along = dragged({ x: 100, y: 0 });
    expect(along.contains({ x: 0, y: 50 })).not.toBe(along.contains({ x: 0, y: -50 }));
  });

  it('keeps an area that starts in a corner of walls in the part of the ground it points into', () => {
    // Two walls end at the origin: one runs east, one south. They part a quarter from the rest.
    const walls = [wall('east', { x: 0, y: 0 }, { x: 400, y: 0 }), wall('south', { x: 0, y: 0 }, { x: 0, y: 400 })];
    const dragged = (end: Point): ReturnType<typeof areaWithinWalls> => areaWithinWalls(area({ shape: 'circle', points: [{ x: 0, y: 0 }, end] }), walls);
    const quarter = dragged({ x: 70, y: 70 });
    expect(quarter.contains({ x: 40, y: 40 })).toBe(true);
    expect([{ x: -40, y: 40 }, { x: -40, y: -40 }, { x: 40, y: -40 }].some((point) => quarter.contains(point))).toBe(false);
    const rest = dragged({ x: -70, y: -70 });
    expect([{ x: -40, y: 40 }, { x: -40, y: -40 }, { x: 40, y: -40 }].every((point) => rest.contains(point))).toBe(true);
    expect(rest.contains({ x: 40, y: 40 })).toBe(false);
  });

  it('sweeps once for an area turned and resized on one side of the wall its origin lies on', () => {
    const walls = [wall('w', { x: -400, y: 0 }, { x: 400, y: 0 })];
    const sweeps = (): number => vi.mocked(computeVisibility).mock.calls.length;
    for (const degrees of [10, 45, 90, 135, 170]) {
      const end = { x: 150 * Math.cos((degrees * Math.PI) / 180), y: 150 * Math.sin((degrees * Math.PI) / 180) };
      areaWithinWalls(area({ shape: 'circle', points: [{ x: 0, y: 0 }, end] }), walls);
      areaWithinWalls(area({ shape: 'cone', points: [{ x: 0, y: 0 }, end] }), walls);
    }
    expect(sweeps()).toBe(1);
    areaWithinWalls(area({ shape: 'cone', points: [{ x: 0, y: 0 }, { x: 0, y: -150 }] }), walls);
    expect(sweeps()).toBe(2);
  });

  it('holds nothing where it lies beyond what can be clipped', () => {
    const cut = areaWithinWalls(circle(200, { x: 5e6, y: 0 }), [wall('w', { x: 5e6 + 100, y: -300 }, { x: 5e6 + 100, y: 300 })]);
    expect(cut.rings).toEqual([]);
    expect(cut.contains({ x: 5e6, y: 0 })).toBe(false);
  });

  it('sweeps the walls again only for another origin, other walls or a reach past the next power of two', () => {
    const walls = [wall('w', { x: 100, y: -300 }, { x: 100, y: 300 })];
    const sweeps = (): number => vi.mocked(computeVisibility).mock.calls.length;
    for (const radius of [140, 150, 200, 255, 141]) areaWithinWalls(circle(radius), walls);
    expect(sweeps()).toBe(1);
    areaWithinWalls(circle(300), walls);
    expect(sweeps()).toBe(2);
    areaWithinWalls(circle(150, { x: 1, y: 0 }), walls);
    expect(sweeps()).toBe(3);
    areaWithinWalls(circle(150), [...walls]);
    expect(sweeps()).toBe(4);
    // A square, a line and a cone share the sweep of their origin with the circle there, whichever way they point.
    for (const length of [200, 210, 225]) {
      areaWithinWalls(area({ shape: 'square', points: [{ x: 0, y: 0 }, { x: 0, y: length }] }), walls);
      areaWithinWalls(area({ shape: 'line', points: [{ x: 0, y: 0 }, { x: 0, y: length }] }), walls);
      areaWithinWalls(area({ shape: 'cone', points: [{ x: 0, y: 0 }, { x: length - 60, y: 60 }] }), walls);
    }
    expect(sweeps()).toBe(4);
  });

  it('holds exactly the points of the shape a straight way from its origin reaches', () => {
    const random = seeded(23);
    for (let run = 0; run < 24; run++) {
      const walls = Array.from({ length: 12 }, (_, i) => {
        const from = { x: random() * 800 - 400, y: random() * 800 - 400 };
        const angle = random() * 2 * Math.PI;
        const length = 40 + random() * 300;
        const door = i % 4 === 0 ? { type: 'door' as const, closed: i % 8 === 0 } : {};
        return wall(`w${i}`, from, { x: from.x + length * Math.cos(angle), y: from.y + length * Math.sin(angle) }, door);
      });
      const origin = { x: random() * 200 - 100, y: random() * 200 - 100 };
      const angle = random() * 2 * Math.PI;
      const length = 100 + random() * 300;
      const shape = AREA_SHAPES[run % AREA_SHAPES.length]!;
      const made = area({ shape, points: [origin, { x: origin.x + length * Math.cos(angle), y: origin.y + length * Math.sin(angle) }] }, { coneAngle: 40 + random() * 200, coneEnd: run % 3 ? 'round' : 'flat', lineWidth: 60 + random() * 100 });
      const cut = areaWithinWalls(made, walls);
      const from = wallSweepPoint(made, walls);
      const stopping = walls.filter((candidate) => candidate.type === 'solid' || candidate.closed !== false);
      for (let i = 0; i < 300; i++) {
        const point = { x: made.bounds.minX + random() * (made.bounds.maxX - made.bounds.minX), y: made.bounds.minY + random() * (made.bounds.maxY - made.bounds.minY) };
        // Beside a wall, or on a way that grazes a wall's end, a hair decides.
        const grazes = stopping.some((candidate) => distToSeg(point.x, point.y, segOf(candidate)) < 1
          || [candidate.p1, candidate.p2].some((end) => distToSeg(end.x, end.y, [from.x, from.y, point.x, point.y]) < 1));
        if (grazes || distanceToOutline(made, point) < 1) continue;
        const reached = !stopping.some((candidate) => crosses(from.x, from.y, point.x, point.y, segOf(candidate)));
        expect(cut.contains(point), `run ${run}, ${shape} at ${point.x},${point.y}`).toBe(made.contains(point) && reached);
        if (distanceToOutline(cut, point) > 1) expect(inOutline(cut, point), `outline, run ${run}`).toBe(cut.contains(point));
      }
    }
  });
});

describe('shapesWithinWalls', () => {
  const square = (x: number, y: number, side: number): Point[] => [{ x, y }, { x: x + side, y }, { x: x + side, y: y + side }, { x, y: y + side }];

  it('cuts what is drawn with an area at the walls the area stops at: a tile a wall runs through keeps its near part', () => {
    const walls = [wall('w', { x: 100, y: -300 }, { x: 100, y: 300 })];
    const [tile, ...more] = shapesWithinWalls(circle(90), walls, [square(70, -35, 70)], 100);
    expect(more).toHaveLength(0);
    expect(Math.max(...tile!.map(({ x }) => x))).toBeCloseTo(100, 0);
    expect(ringArea(tile!)).toBeCloseTo(30 * 70, -1);
  });

  it('leaves out a tile wholly behind a wall, and keeps one wholly before it as it is', () => {
    const walls = [wall('w', { x: 100, y: -300 }, { x: 100, y: 300 })];
    const left = shapesWithinWalls(circle(90), walls, [square(110, 0, 40), square(-40, -20, 40)], 100);
    expect(left).toHaveLength(1);
    expect(ringArea(left[0]!)).toBeCloseTo(1600, 0);
    expect(Math.max(...left[0]!.map(({ x }) => x))).toBeCloseTo(0, 6);
  });

  it('is not cut by the edge of the sweep, which reaches as far past the area as the tiles do', () => {
    // A wall near, so there is a sweep; the tile lies just past the area's reach, on the open side.
    const walls = [wall('w', { x: 100, y: -300 }, { x: 100, y: 300 })];
    const tile = square(-330, -35, 70);
    const left = shapesWithinWalls(circle(255), walls, [tile], 100);
    expect(left).toHaveLength(1);
    expect(ringArea(left[0]!)).toBeCloseTo(4900, 0);
  });

  it('hands the shapes back where no wall stands near', () => {
    const tiles = [square(0, 0, 70)];
    expect(shapesWithinWalls(circle(90), [wall('far', { x: 5000, y: 0 }, { x: 5000, y: 100 })], tiles, 100)).toBe(tiles);
  });
});
