import { describe, expect, it } from 'vitest';
import { MAX_AREA_CORNERS, lightMovedTo, readArea } from '../../lighting/lightArea';
import { lightList, readLight } from '../../lighting/lightingObjects';
import type { LightEmission, LightSource } from '../../types/lightingTypes';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import { MAX_AREA_SAMPLES, areaDistance, areaSamples } from '../areaReach';
import { lightLevelAt } from '../lightLevels';
import { LightReaches } from '../lightReaches';
import { activeLights, engineLight } from '../lightSources';
import { exploredShapes } from '../exploredShapes';
import { NORMAL_SIGHT } from '../../gameSystems/senses/generic';
import type { EngineLight } from '../../pixi/lighting/engine/types';

const EMISSION: LightEmission = { bright: 10, dim: 30, color: '#ff7a2a', intensity: 1, animation: 'smoulder' };
/** 5 ft cells of 50 px: bright 100 px, dim 300 px from the shore. */
const SCALE = { unitDistance: 5, cellSize: 50 };
/** A lava pool from (400, 400) to (600, 600). */
const POOL: Point[] = [{ x: 400, y: 400 }, { x: 600, y: 400 }, { x: 600, y: 600 }, { x: 400, y: 600 }];
const SAMPLING = { spacing: 12.5, clearance: 3 };

function placed(area: unknown = POOL, emission: LightEmission = EMISSION): LightSource {
  return { id: 'lava', kind: 'light', x: 500, y: 500, emission, area } as LightSource;
}

function wall(x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSegment> = {}): WallSegment {
  return { id: `w${x1},${y1},${x2},${y2}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...extra };
}

function reachOf(walls: WallSegment[], light: LightSource = placed()) {
  const shining = activeLights({ lava: light }, {}).map((active) => engineLight(active, SCALE));
  return new LightReaches().sync(shining, walls, SAMPLING);
}

describe('reading an area light', () => {
  it('keeps an area of three or more corners that encloses something, as the light itself', () => {
    const light = placed();
    expect(readLight(light)).toBe(light);
    expect(readLight(light)!.area).toBe(POOL);
  });

  it.each([
    ['two corners', POOL.slice(0, 2)],
    ['corners on one line', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]],
    ['a corner that is no number', [...POOL.slice(0, 3), { x: Number.NaN, y: 4 }]],
    ['too many corners', Array.from({ length: MAX_AREA_CORNERS + 1 }, (_, i) => ({ x: Math.cos(i), y: Math.sin(i) }))],
    ['no list', { x: 1, y: 2 }],
  ])('reads a light whose area is %s as a light at its middle', (_name, area) => {
    const read = readLight(placed(area))!;
    expect(read).not.toBeNull();
    expect(read.area).toBeUndefined();
    expect(read.x).toBe(500);
  });

  it('gives a source of magical darkness no area: it has no surface to glow from', () => {
    expect(readLight(placed(POOL, { ...EMISSION, darkness: true }))!.area).toBeUndefined();
  });

  it('reads the most corners the engine draws', () => {
    const many = Array.from({ length: MAX_AREA_CORNERS }, (_, i) => ({ x: 100 * Math.cos((2 * Math.PI * i) / MAX_AREA_CORNERS), y: 100 * Math.sin((2 * Math.PI * i) / MAX_AREA_CORNERS) }));
    expect(readArea(many)).toBe(many);
  });

  it('moves the area with its middle', () => {
    expect(lightMovedTo(placed(), 520, 490)).toEqual({ x: 520, y: 490, area: POOL.map(({ x, y }) => ({ x: x + 20, y: y - 10 })) });
    expect(lightMovedTo({ x: 0, y: 0 }, 5, 6)).toEqual({ x: 5, y: 6 });
  });

  it('hands the area to the engine without a beam or flame of its own', () => {
    const [active] = activeLights({ lava: placed(POOL, { ...EMISSION, angle: 90 }) }, {});
    const light = engineLight(active!, SCALE);
    expect(light.surface).toBe(POOL);
    expect(light.cone).toBeUndefined();
    expect([light.bright, light.dim]).toEqual([100, 300]);
  });

  it('leaves an area light that sleeps in daylight out, as any light that follows the ambient light', () => {
    expect(activeLights({ lava: { ...placed(), activeBelowAmbient: 0.3 } }, {}, 0.9)).toEqual([]);
    expect(lightList({ lava: placed() })[0]!.area).toBe(POOL);
  });
});

describe('the rule of an area light', () => {
  const ambient = { ambient: 0 };

  it('lights the area brightly throughout, and counts bright and dim from its shore', () => {
    const reaches = reachOf([]);
    for (const point of [{ x: 500, y: 500 }, { x: 401, y: 599 }]) expect(lightLevelAt(point, ambient, reaches)).toBe('bright');
    // 90 px from the eastern shore is within the bright range, 200 px dim, 320 px dark.
    expect(lightLevelAt({ x: 690, y: 500 }, ambient, reaches)).toBe('bright');
    expect(lightLevelAt({ x: 800, y: 500 }, ambient, reaches)).toBe('dim');
    expect(lightLevelAt({ x: 920, y: 500 }, ambient, reaches)).toBe('dark');
    // Off a corner the distance is to the corner: 80 px each way is 113 px, dim.
    expect(lightLevelAt({ x: 680, y: 680 }, ambient, reaches)).toBe('dim');
  });

  it('is stopped by a wall, and counts from the shore the point still sees', () => {
    // A wall in front of the eastern shore from y 350 to 650: east of it, nothing but what comes round its ends.
    const reaches = reachOf([wall(650, 350, 650, 650)]);
    expect(lightLevelAt({ x: 700, y: 500 }, ambient, reaches)).toBe('dark');
    // Past the wall's northern end the northern shore is in view west of x 525, 188 px away: dim.
    expect(lightLevelAt({ x: 700, y: 330 }, ambient, reaches)).toBe('dim');
    expect(areaDistance({ x: 700, y: 330 }, reaches[0]!)).toBeGreaterThanOrEqual(188);
    expect(areaDistance({ x: 700, y: 330 }, reaches[0]!)).toBeLessThan(188 + SAMPLING.spacing);
  });

  it('lets no light through a one-way wall from either side: the area may lie on both', () => {
    const reaches = reachOf([wall(650, 0, 650, 1000, { direction: 'left' }), wall(650, 0, 650, 1000, { direction: 'right', id: 'other' })]);
    expect(lightLevelAt({ x: 700, y: 500 }, ambient, reaches)).toBe('dark');
    const one = reachOf([wall(650, 0, 650, 1000, { direction: 'left' })]);
    expect(lightLevelAt({ x: 700, y: 500 }, ambient, one)).toBe('dark');
    const other = reachOf([wall(650, 0, 650, 1000, { direction: 'right' })]);
    expect(lightLevelAt({ x: 700, y: 500 }, ambient, other)).toBe('dark');
  });

  it('keeps an area that lies on a wall from seeing past it', () => {
    // The eastern shore is a wall: nothing east of it is lit.
    const reaches = reachOf([wall(600, 300, 600, 700)]);
    expect(lightLevelAt({ x: 590, y: 500 }, ambient, reaches)).toBe('bright');
    expect(lightLevelAt({ x: 610, y: 500 }, ambient, reaches)).toBe('dark');
    expect(areaDistance({ x: 610, y: 500 }, reaches[0]!)).toBe(Infinity);
  });

  it('samples a long shore more thinly, never more than its cap', () => {
    const long = [{ x: 0, y: 0 }, { x: 20_000, y: 0 }, { x: 20_000, y: 50 }, { x: 0, y: 50 }];
    expect(areaSamples(long, [], SAMPLING).length).toBe(MAX_AREA_SAMPLES);
    // Its four corners and a point every 12.5 px along its 800 px.
    expect(areaSamples(POOL, [], SAMPLING).length).toBe(68);
  });

  it('records the area and its reach as explored where a token sees by light', () => {
    const reaches = reachOf([]);
    const region = { tokenId: 't', sense: NORMAL_SIGHT, origin: { x: 500, y: 900 }, radius: 2000, polygon: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }], apex: 0, seesInvisible: false };
    const shapes = exploredShapes({ all: false, regions: [region] }, ambient, reaches)!;
    expect(shapes.polygons[0]).toBe(POOL);
    expect(shapes.polygons.length).toBe(1 + reaches[0]!.parts!.length);
  });
});

describe('LightReaches with area lights', () => {
  const lava = (area: Point[], bright = 100): EngineLight => ({ key: 'lava', x: 500, y: 500, bright, dim: 300, flame: 0, color: [1, 1, 1], intensity: 1, animation: 'none', surface: area });

  it('traces an area light again only when its area, its reach or the walls change', () => {
    const cache = new LightReaches();
    const walls: WallSegment[] = [];
    const [first] = cache.sync([lava(POOL)], walls, SAMPLING);
    expect(cache.sync([lava(POOL)], walls, SAMPLING)[0]).toBe(first);
    const [brighter] = cache.sync([lava(POOL, 150)], walls, SAMPLING);
    expect(brighter!.parts).toBe(first!.parts);
    expect(brighter!.bright).toBe(150);
    const moved = POOL.map(({ x, y }) => ({ x: x + 10, y }));
    expect(cache.sync([lava(moved, 150)], walls, SAMPLING)[0]!.parts).not.toBe(first!.parts);
  });
});
