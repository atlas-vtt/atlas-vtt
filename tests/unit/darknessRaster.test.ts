import { describe, expect, it } from 'vitest';
import { showsMap } from '../../src/app/gameSystems/senseRules';
import { DARKNESS_MIN_CELL, darknessRaster, type ExploredImage } from '../../src/app/pixi/lighting/playerDarkness/darknessRaster';
import { insideSpans } from '../../src/app/pixi/lighting/playerDarkness/spans';
import type { PlayerLighting } from '../../src/app/pixi/lighting/playerLightingLayers';
import type { LightSource } from '../../src/app/types/lightingTypes';
import { lightLevelAt } from '../../src/app/vision/lightLevels';
import { perceive } from '../../src/app/vision/perception';
import { pointInPolygon } from '../../src/app/vision/visibility';
import { character, exploredImage, light, MAP, lightingFromStore, scene, wall, type Scene } from './lightingFixtures';

/** What the window's rules say of one point, asked point by point with Atlas's own functions. */
function shownByTheRules(lighting: PlayerLighting, explored: ExploredImage | null, x: number, y: number): boolean {
  const point = { x, y };
  const level = (): ReturnType<typeof lightLevelAt> => lightLevelAt(point, lighting.ambient, lighting.reaches);
  if (lighting.sight.all) return perceive(point, lighting.sight, level) === 'seen';
  const withMap = { all: false, regions: lighting.sight.regions.filter((region) => showsMap(region.sense) && region.polygon) };
  if (perceive(point, withMap, level) === 'seen') return true;
  if (lighting.spots.some((spot) => pointInPolygon(point, spot.polygon))) return true;
  if (!explored) return false;
  const tx = Math.floor((x / MAP.width) * explored.width);
  const ty = Math.floor((y / MAP.height) * explored.height);
  return (explored.coverage[ty * explored.width + tx] ?? 0) >= 128;
}

function expectRasterFollowsTheRules(state: Scene, explored: ExploredImage | null = null): void {
  const lighting = lightingFromStore(state, MAP)!;
  const grid = darknessRaster(lighting, explored, MAP);
  const differ: string[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const x = (col + 0.5) * grid.cellSize;
      const y = (row + 0.5) * grid.cellSize;
      if ((grid.dark[row * grid.cols + col] === 0) !== shownByTheRules(lighting, lighting.showsExplored ? explored : null, x, y)) differ.push(`${x},${y}`);
    }
  }
  expect(differ).toEqual([]);
  // Neither all dark nor all shown: the scene tests something.
  expect(new Set(grid.dark).size).toBe(2);
}

const hero = (x: number, y: number, vision: Record<string, unknown> = {}) => character('hero', x, y, { vision: { enabled: true, ...vision } });
const darkness = (id: string, x: number, y: number, dim: number, priority?: number): LightSource => {
  const source = light(id, x, y, dim);
  return { ...source, emission: { ...source.emission, darkness: true, ...(priority !== undefined && { priority }) } };
};

describe('darkness raster', () => {
  it('follows the window\'s rules behind walls in daylight', () => {
    expectRasterFollowsTheRules(scene({ ambient: 1 }, {
      tokens: { hero: hero(140, 400) },
      walls: { a: wall('a', { x: 503, y: 0 }, { x: 503, y: 600 }), b: wall('b', { x: 200, y: 100 }, { x: 400, y: 300 }) },
    }));
  });

  it('follows them at night, with lights, a limited sight range and a cone', () => {
    expectRasterFollowsTheRules(scene({ ambient: 0 }, {
      tokens: { hero: hero(140, 400, { range: 60, angle: 120 }), other: character('other', 600, 300, { vision: { enabled: true } }) },
      lights: { a: light('a', 300, 400, 20), b: light('b', 700, 200, 15), c: light('c', 900, 700, 30) },
      walls: { a: wall('a', { x: 650, y: 0 }, { x: 650, y: 350 }) },
    }));
  });

  it('follows ambient zones, darkvision and magical darkness with a light that outranks it', () => {
    expectRasterFollowsTheRules(scene({ ambient: 0.1 }, {
      tokens: { hero: hero(500, 400, { senses: [{ id: 'darkvision', range: 30 }] }) },
      lightZones: { day: { id: 'day', kind: 'light-zone', polygon: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], ambient: 1 } },
      lights: { dark: darkness('dark', 500, 500, 20), lamp: { ...light('lamp', 560, 520, 10), emission: { ...light('lamp', 0, 0, 10).emission, priority: 2 } } },
    }));
  });

  it('follows them without vision tokens: whatever is lit shows', () => {
    expectRasterFollowsTheRules(scene({ ambient: 0 }, { tokens: {}, lights: { a: light('a', 300, 400, 20) } }));
  });

  it('shows the explored memory where no token sees, unless the scene keeps none', () => {
    const explored = exploredImage(MAP, (x) => x > 700);
    const night = scene({ ambient: 0 }, { tokens: { hero: hero(140, 400) }, lights: { a: light('a', 200, 400, 10) } });
    expectRasterFollowsTheRules(night, explored);
    expectRasterFollowsTheRules({ ...night, lighting: { ...night.lighting, exploredMemory: false } }, explored);
  });

  it('is dark everywhere while the view\'s sight is not the scene\'s', () => {
    const lighting = lightingFromStore(scene({ ambient: 1 }, { tokens: {} }), MAP)!;
    expect(new Set(darknessRaster({ ...lighting, ready: false }, null, MAP).dark)).toEqual(new Set([1]));
  });

  it('doubles its cells from the smallest until the long side holds at most the cells asked for', () => {
    const lighting = lightingFromStore(scene({ ambient: 1 }, { tokens: {} }), MAP)!;
    expect(darknessRaster(lighting, null, MAP).cellSize).toBe(DARKNESS_MIN_CELL);
    const coarse = darknessRaster(lighting, null, MAP, 16);
    expect(coarse.cellSize).toBe(64);
    expect([coarse.cols, coarse.rows]).toEqual([16, 13]);
    expect(coarse.dark.length).toBe(coarse.cols * coarse.rows);
  });
});

describe('coarse darkness cells', () => {
  it('shows a cell only when all of it is seen: a large cell a wall edge crosses is dark', () => {
    const state = scene({ ambient: 1 }, { tokens: { hero: hero(140, 400) }, walls: { a: wall('a', { x: 503, y: -10 }, { x: 503, y: 810 }) } });
    const lighting = lightingFromStore(state, MAP)!;
    const coarse = darknessRaster(lighting, null, MAP, 16);
    expect(coarse.cellSize).toBe(64);
    const row = Math.floor(400 / 64);
    // 448–512 straddles the wall at 503: its centre (480) is seen, its right edge is not.
    expect(coarse.dark[row * coarse.cols + 7]).toBe(1);
    expect(coarse.dark[row * coarse.cols + 6]).toBe(0);
    // Every cell shown is shown by the rules at every 8 px sample within it.
    for (let r = 0; r < coarse.rows; r++) {
      for (let c = 0; c < coarse.cols; c++) {
        if (coarse.dark[r * coarse.cols + c]) continue;
        for (let y = r * 64 + 4; y < Math.min(MAP.height, (r + 1) * 64); y += 8) {
          for (let x = c * 64 + 4; x < Math.min(MAP.width, (c + 1) * 64); x += 8) expect(shownByTheRules(lighting, null, x, y), `${x},${y}`).toBe(true);
        }
      }
    }
  });
});

describe('inside spans', () => {
  it('gives the ranges of a line inside a polygon by nonzero winding', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(insideSpans(square, 5)).toEqual([[0, 10]]);
    expect(insideSpans(square, 20)).toEqual([]);
    // A hole wound the other way, joined by a bridge, is left out.
    const outer = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }, { x: 0, y: 0 }];
    const hole = [{ x: 10, y: 10 }, { x: 10, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 10 }, { x: 10, y: 10 }];
    expect(insideSpans([...outer, ...hole], 15)).toEqual([[0, 10], [20, 30]]);
  });
});
