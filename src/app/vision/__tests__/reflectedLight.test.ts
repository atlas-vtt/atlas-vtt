import { describe, expect, it } from 'vitest';
import { REFLECTION } from '../../lighting/lightingConstants';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import type { EngineLight } from '../../pixi/lighting/engine/types';
import { lightLevelAt } from '../lightLevels';
import { LightReaches } from '../lightReaches';
import { MAX_REFLECTION_SAMPLES, floorLight, reflectedArea, reflectedAt, type ReflectionSampling } from '../reflectedLight';
import { exploredShapes } from '../exploredShapes';
import { litPolygons, type LightReach } from '../sight';
import { computeVisibility, pointInPolygon } from '../visibility';
import { NORMAL_SIGHT } from '../../gameSystems/senses/generic';

/** 50 px cells: a torch of 20/40 ft is bright to 200 px and dim to 400 px. */
const CELL = 50;
const AREA = { spacing: CELL / 4, clearance: 3 };
const SAMPLING: ReflectionSampling = { ...AREA, reach: REFLECTION.cells * CELL };
const DARK = { enabled: true, ambient: 0 };

function wall(x1: number, y1: number, x2: number, y2: number): WallSegment {
  return { id: `w${x1},${y1},${x2},${y2}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
}

function torch(x: number, y: number, extra: Partial<EngineLight> = {}): EngineLight {
  return { key: 'torch', x, y, bright: 200, dim: 400, flame: 20, color: [1, 1, 1], intensity: 1, animation: 'none', ...extra };
}

/**
 * Room A (0..400 square) and room B (520..900 × 0..400), joined at their south ends by a corridor
 * (400..520 × 320..400) that room A's light enters at an angle: the light reaches the corridor's
 * floor and not room B, round the corridor's north corner. A nook (900..1000 × 0..60) opens from
 * room B's north-east corner, round a second corner.
 */
function rooms(): WallSegment[] {
  return [
    wall(0, 0, 400, 0), wall(0, 0, 0, 400), wall(0, 400, 900, 400),
    wall(400, 0, 400, 320), wall(400, 320, 520, 320), wall(520, 320, 520, 0),
    wall(520, 0, 1000, 0), wall(900, 60, 900, 400), wall(900, 60, 1000, 60), wall(1000, 0, 1000, 60),
  ];
}

function reachesOf(lights: EngineLight[], walls: WallSegment[] = rooms()): LightReach[] {
  return new LightReaches().sync(lights, walls, AREA, SAMPLING);
}

const level = (point: Point, reaches: LightReach[]) => lightLevelAt(point, DARK, reaches);

describe('reflected light', () => {
  it('dimly lights a room round the corner from a light, as far as what is left of its range', () => {
    const [reach] = reachesOf([torch(300, 250)]);
    // In the corridor's mouth and just inside room B: no straight line to the torch.
    expect(pointInPolygon({ x: 560, y: 330 }, reach!.polygon)).toBe(false);
    expect(level({ x: 560, y: 330 }, [reach!])).toBe('dim');
    expect(level({ x: 540, y: 360 }, [reach!])).toBe('dim');
    // Without its reflection the same point is dark.
    expect(level({ x: 560, y: 330 }, [{ ...reach!, reflection: [] }])).toBe('dark');
    // Far into room B the light's range is spent.
    expect(level({ x: 800, y: 200 }, [reach!])).toBe('dark');
    // Round a second corner, in the nook, nothing.
    expect(level({ x: 950, y: 30 }, [reach!])).toBe('dark');
  });

  it('never reaches past the light\'s own dim range, and no farther from the floor than its own reach', () => {
    const light = torch(300, 250);
    const [reach] = reachesOf([light]);
    const parts = reach!.reflection!;
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.length).toBeLessThanOrEqual(MAX_REFLECTION_SAMPLES);
    for (const part of parts) {
      const travelled = Math.hypot(part.origin.x - light.x, part.origin.y - light.y);
      expect(travelled + part.reach).toBeLessThanOrEqual(light.dim + 1e-6);
      expect(part.reach).toBeLessThanOrEqual(REFLECTION.share * light.dim * part.strength + 1e-9);
      expect(part.strength).toBeCloseTo(floorLight(light, travelled), 12);
    }
    for (let y = 5; y < 400; y += 15) {
      for (let x = 5; x < 1000; x += 15) {
        if (reflectedAt({ x, y }, parts)) expect(Math.hypot(x - light.x, y - light.y)).toBeLessThanOrEqual(light.dim);
      }
    }
  });

  it('changes nothing in the open: a light without walls in reach reflects nothing', () => {
    const [reach] = reachesOf([torch(300, 250)], []);
    expect(reach!.reflection).toEqual([]);
    expect(level({ x: 300, y: 670 }, [reach!])).toBe('dark');
  });

  it('fills a shadow behind a pillar near the light, but not past the light\'s range', () => {
    // A pillar 100 px east of the light.
    const pillar = [wall(400, 280, 440, 280), wall(440, 280, 440, 320), wall(440, 320, 400, 320), wall(400, 320, 400, 280)];
    const [reach] = reachesOf([torch(300, 300)], pillar);
    expect(level({ x: 500, y: 300 }, [{ ...reach!, reflection: [] }])).toBe('dark');
    expect(level({ x: 500, y: 300 }, [reach!])).toBe('dim');
    expect(level({ x: 720, y: 300 }, [reach!])).toBe('dark');
  });

  it('is swallowed by magical darkness like its light', () => {
    const [reach] = reachesOf([torch(300, 250)]);
    const darkness: LightReach = { origin: { x: 560, y: 330 }, bright: 0, dim: 60, darkness: true, polygon: computeVisibility({ x: 560, y: 330 }, 60, rooms()) };
    expect(level({ x: 560, y: 330 }, [reach!, darkness])).toBe('magical-dark');
  });

  it('comes from an area light\'s lit floor too', () => {
    const lava = torch(250, 250, { key: 'lava', bright: 150, dim: 400, flame: 0, surface: [{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 300 }, { x: 200, y: 300 }] });
    const [reach] = reachesOf([lava]);
    expect(reach!.reflection!.length).toBeGreaterThan(0);
    // The lava lights most of the corridor straight; beside the edge of its light only its reflection does.
    const reflected: Point[] = [];
    for (let y = 320; y < 400; y += 2) {
      for (let x = 400; x < 700; x += 2) {
        if (level({ x, y }, [{ ...reach!, reflection: [] }]) === 'dark' && level({ x, y }, [reach!]) === 'dim') reflected.push({ x, y });
      }
    }
    expect(reflected.length).toBeGreaterThan(50);
    expect(level({ x: 950, y: 30 }, [reach!])).toBe('dark');
  });

  it('gives nothing back from a darkness', () => {
    const [reach] = reachesOf([torch(300, 250, { darkness: true, bright: 0 })]);
    expect(reach!.reflection).toBeUndefined();
  });

  it('is traced again with its light, and worked out anew from the kept polygon when only the bright range changes', () => {
    const cache = new LightReaches();
    const walls = rooms();
    const [first] = cache.sync([torch(300, 250)], walls, AREA, SAMPLING);
    const [brighter] = cache.sync([torch(300, 250, { bright: 250 })], walls, AREA, SAMPLING);
    // How far and how strongly the lit floor reflects follows the bright range: as a fresh trace has it.
    expect(brighter!.polygon).toBe(first!.polygon);
    expect(brighter!.reflection).toEqual(reachesOf([torch(300, 250, { bright: 250 })])[0]!.reflection);
    expect(brighter!.reflection).not.toEqual(first!.reflection);
    const [moved] = cache.sync([torch(310, 250)], walls, AREA, SAMPLING);
    expect(moved!.reflection).not.toBe(first!.reflection);
    expect(cache.sync([torch(310, 250)], walls, AREA)[0]!.reflection).toBeUndefined();
  });

  it('is recorded as explored where a token sees it', () => {
    const [reach] = reachesOf([torch(300, 250)]);
    const polygons = litPolygons(reach!);
    const area = reflectedArea(reach!.reflection!);
    expect(polygons).toEqual([reach!.polygon, ...area]);
    // One outline or a few for the memory to stamp, holding every point the rule counts.
    expect(area.length).toBeLessThan(reach!.reflection!.length);
    for (let y = 5; y < 400; y += 9) {
      for (let x = 400; x < 900; x += 9) {
        if (reflectedAt({ x, y }, reach!.reflection!)) expect([x, y, area.some((ring) => pointInPolygon({ x, y }, ring))]).toEqual([x, y, true]);
      }
    }
    const sight = { all: false, regions: [{ tokenId: 'hero', sense: NORMAL_SIGHT, polygon: computeVisibility({ x: 700, y: 300 }, 1000, rooms()), precise: true }] };
    const shapes = exploredShapes(sight as never, { ...DARK }, [reach!]);
    expect(shapes!.polygons.some((polygon) => pointInPolygon({ x: 560, y: 330 }, polygon))).toBe(true);
  });
});

describe('floorLight', () => {
  it('is the light\'s bright level near it, halfway at its bright radius, and fades to nothing at its dim radius', () => {
    expect(floorLight({ bright: 200, dim: 400 }, 0)).toBe(1);
    expect(floorLight({ bright: 200, dim: 400 }, 200)).toBeCloseTo((1 + 0.4 / 1.25) / 2, 12);
    expect(floorLight({ bright: 200, dim: 400 }, 300)).toBeLessThan(0.4 / 1.25);
    expect(floorLight({ bright: 200, dim: 400 }, 400)).toBe(0);
    expect(floorLight({ bright: 0, dim: 400 }, 200)).toBeLessThan(0.4 / 1.25);
  });
});
