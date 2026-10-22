import { describe, expect, it } from 'vitest';
import { DAGGERHEART } from '../../src/app/gameSystems/presets/daggerheart';
import { DND_5E } from '../../src/app/gameSystems/presets/dnd5e';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { parseUvtt } from '../../src/app/import/uvtt/parseUvtt';
import { wallsCrowd } from '../../src/app/import/uvtt/uvttCrowding';
import { uvttCellSize, uvttToScene, type UvttScene, type UvttTarget } from '../../src/app/import/uvtt/uvttToScene';
import type { UvttMap } from '../../src/app/import/uvtt/uvttTypes';
import { sealTolerance } from '../../src/app/lighting/lightingConstants';
import { gameUnitsToWorld, unitScaleOf } from '../../src/app/lighting/lightingUnits';
import { sealWalls } from '../../src/app/lighting/sealWalls';
import type { CollectionGridDefaults } from '../../src/app/types/collectionSettingsTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { cryptFile, cryptSetting, cryptWith } from '../fixtures/uvttFiles';

const FEET: UvttTarget['unit'] = { unitType: 'feet', unitDistance: 5 };

function mapOf(file: unknown): UvttMap {
  const result = parseUvtt(JSON.stringify(file));
  if (!result.ok) throw new Error(result.problem);
  return result.map;
}

const sceneOf = (file: unknown, cellSize = 100, unit: UvttTarget['unit'] = FEET): UvttScene => uvttToScene(mapOf(file), { cellSize, unit });
const ends = (wall: WallSegment): number[] => [wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y];
const wallsOf = (scene: UvttScene): WallSegment[] => Object.values(scene.walls);

describe('the walls of a Universal VTT file', () => {
  it('lie where the file says, to the pixel', () => {
    const walls = wallsOf(sceneOf(cryptFile()));

    expect(walls.filter((wall) => wall.type === 'solid').map(ends)).toEqual([
      [100, 100, 900, 100], [900, 100, 900, 700], [900, 700, 100, 700], [100, 700, 100, 100],
      [450, 100, 450, 325],
      [450, 425, 450, 700],
      [600, 500, 700, 500], [700, 500, 700, 600], [700, 600, 600, 600], [600, 600, 600, 500],
    ]);
  });

  it('are one segment per pair of points, joined at the very same coordinates', () => {
    const cellSize = 8192 / 10240 * 256;
    const walls = wallsOf(sceneOf(cryptSetting('line_of_sight', [[{ x: 0.1, y: 0.7 }, { x: 3.3, y: 1.9 }, { x: 5.7, y: 0.3 }]]), cellSize));

    expect(walls[0]!.p2).toEqual(walls[1]!.p1);
    expect(walls[0]!.p2.x).toBe(3.3 * cellSize);
    expect(walls[0]!.p2.y).toBe(1.9 * cellSize);
  });

  it('share a chain per line and have ids of their own', () => {
    const walls = wallsOf(sceneOf(cryptFile()));

    expect(walls.slice(0, 4).map((wall) => wall.chainId)).toEqual(Array(4).fill('chain_uvtt_1'));
    expect(walls[4]!.chainId).toBe('chain_uvtt_2');
    expect(walls[6]!.chainId).toBe('chain_uvtt_4');
    expect(new Set(walls.map((wall) => wall.id)).size).toBe(walls.length);
    expect(walls.every((wall) => wall.kind === 'wall' && sceneOf(cryptFile()).walls[wall.id]!.id === wall.id)).toBe(true);
  });

  it('are counted from the origin the file states', () => {
    const file = cryptWith((crypt) => { (crypt.resolution as Record<string, unknown>).map_origin = { x: 2, y: -3 }; });
    const scene = sceneOf(file, 64);

    expect(ends(wallsOf(scene)[0]!)).toEqual([(1 - 2) * 64, (1 + 3) * 64, (9 - 2) * 64, (1 + 3) * 64]);
    expect(scene.grid).toEqual({ size: 64, offsetX: 0, offsetY: 0 });
    expect(scene.lights.light_uvtt_1).toMatchObject({ x: 0.5 * 64, y: 5.5 * 64 });
  });

  it('skip a segment without length, and a line of one point', () => {
    const scene = sceneOf(cryptWith((crypt) => {
      crypt.line_of_sight = [[{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], [{ x: 5, y: 5 }], []];
      crypt.objects_line_of_sight = [];
      crypt.portals = [{ bounds: [{ x: 3, y: 3 }, { x: 3, y: 3 }] }];
    }));

    expect(wallsOf(scene).map(ends)).toEqual([[100, 100, 200, 100]]);
    expect(scene.counts).toMatchObject({ walls: 1, doors: 0 });
  });
});

describe('the doors of a Universal VTT file', () => {
  it('span the two ends of each closed portal', () => {
    const scene = sceneOf(cryptWith((crypt) => {
      crypt.portals = [
        { bounds: [{ x: 4.5, y: 3.25 }, { x: 4.5, y: 4.25 }], closed: true },
        { bounds: [{ x: 2, y: 7 }, { x: 3, y: 7 }], freestanding: true },
      ];
    }));
    const doors = wallsOf(scene).filter((wall) => wall.type === 'door');

    expect(doors.map(ends)).toEqual([[450, 325, 450, 425], [200, 700, 300, 700]]);
    expect(doors.map((door) => door.closed)).toEqual([true, true]);
    expect(scene.counts).toEqual({ walls: 10, doors: 2, lights: 1 });
  });

  it('leave out the open portals, which are windows: light and sight pass them', () => {
    const scene = sceneOf(cryptWith((crypt) => {
      crypt.portals = [
        { bounds: [{ x: 4.5, y: 3.25 }, { x: 4.5, y: 4.25 }], closed: true },
        { bounds: [{ x: 2, y: 7 }, { x: 3, y: 7 }], closed: false },
        { bounds: [{ x: 9, y: 2 }, { x: 9, y: 3 }], closed: false },
        { bounds: [{ x: 400, y: 2 }, { x: 400, y: 3 }], closed: false },
      ];
    }));

    expect(wallsOf(scene).filter((wall) => wall.type === 'door').map(ends)).toEqual([[450, 325, 450, 425]]);
    expect(scene.counts.doors).toBe(1);
    expect(scene.skipped).toMatchObject({ windows: 2, outside: 1 });
  });
});

describe('the grid of a Universal VTT file', () => {
  it('is the scene\'s grid: cells as wide as the file\'s on its image, from the image\'s corner', () => {
    expect(sceneOf(cryptFile()).grid).toEqual({ size: 100, offsetX: 0, offsetY: 0 });
  });

  it('starts inside the first cell where the image does', () => {
    const file = cryptWith((crypt) => { (crypt.resolution as Record<string, unknown>).map_origin = { x: 0.25, y: -0.5 }; });

    expect(sceneOf(file).grid).toEqual({ size: 100, offsetX: 75, offsetY: 50 });
  });

  it.each([
    ['as large as the file says', { width: 1000, height: 800 }, 100],
    ['exported at twice the size', { width: 2000, height: 1600 }, 200],
    ['scaled down to what a map keeps', { width: 8192, height: 6554 }, 819.2],
    ['a pixel off after rounding', { width: 1000, height: 801 }, 100],
  ])('has square cells on an image %s', (_label, image, cellSize) => {
    expect(uvttCellSize(mapOf(cryptFile()), image)).toBe(cellSize);
  });

  it('has none on an image of another shape', () => {
    expect(uvttCellSize(mapOf(cryptFile()), { width: 1000, height: 1000 })).toBeNull();
    expect(uvttCellSize(mapOf(cryptFile()), { width: 1000, height: 790 })).toBeNull();
  });
});

describe('the lights of a Universal VTT file', () => {
  const metres: CollectionGridDefaults = { unitType: 'meters', unitDistance: 1.5, measurementMode: 'metric' };
  const squares: CollectionGridDefaults = { unitType: 'units', unitDistance: 1, measurementMode: 'metric' };

  it.each([
    ['feet (D&D 5e)', DND_5E.rules.gridDefaults, 15, 30],
    ['metres', metres, 4.5, 9],
    ['range bands (Daggerheart)', DAGGERHEART.rules.gridDefaults, 15, 30],
    ['squares', squares, 3, 6],
    ['no measurement of its own', undefined, 15, 30],
  ])('are bright to half their range and end at it, in a collection measuring in %s', (_label, gridDefaults, bright, dim) => {
    const unit = resolveMeasurementSettings(gridDefaults, null);
    const light = sceneOf(cryptFile(), 100, unit).lights.light_uvtt_1!;

    expect(light.emission).toMatchObject({ bright, dim });
    // Six cells on the map, whatever the collection counts them in
    expect(gameUnitsToWorld(light.emission.dim, unitScaleOf(unit, { size: 100 }))).toBeCloseTo(600, 9);
    expect(gameUnitsToWorld(light.emission.bright, unitScaleOf(unit, { size: 100 }))).toBeCloseTo(300, 9);
  });

  it('stand where the file says, in its colour, as custom lights', () => {
    expect(sceneOf(cryptFile()).lights).toEqual({
      light_uvtt_1: {
        id: 'light_uvtt_1', kind: 'light', x: 250, y: 250,
        emission: { bright: 15, dim: 30, color: '#eccd8b', intensity: 1, animation: 'none', kind: 'custom' },
      },
    });
  });

  it('keep a range in fractions of a cell', () => {
    expect(sceneOf(cryptSetting('lights.0.range', 5.5)).lights.light_uvtt_1!.emission).toMatchObject({ bright: 13.75, dim: 27.5 });
  });

  it('stop at the farthest a light reaches on the map and at the brightest a light gets', () => {
    const file = cryptWith((crypt) => { crypt.lights = [{ position: { x: 1, y: 1 }, range: 500, intensity: 40 }]; });

    // 8,192 world pixels are 81.92 cells of 100 pixels, 409 whole feet; bright to half of where the light ends
    expect(sceneOf(file).lights.light_uvtt_1!.emission).toMatchObject({ bright: 204.5, dim: 409, intensity: 2 });
  });

  it('are left out, and not counted, where they have no range', () => {
    const scene = sceneOf(cryptWith((crypt) => {
      crypt.lights = [{ position: { x: 1, y: 1 }, range: 0 }, { position: { x: 2, y: 2 }, range: 3 }, { position: { x: 3, y: 3 }, range: 0 }];
    }));

    expect(Object.values(scene.lights).map((light) => [light.id, light.x, light.emission.dim])).toEqual([['light_uvtt_1', 200, 15]]);
    expect(scene.counts.lights).toBe(1);
    expect(scene.skipped).toMatchObject({ outside: 0, unlit: 2 });
  });

  it('are switched off where the image shows their glow already', () => {
    const scene = sceneOf(cryptSetting('environment.baked_lighting', true));

    expect(scene.lights.light_uvtt_1!.hidden).toBe(true);
    expect(sceneOf(cryptFile()).lights.light_uvtt_1).not.toHaveProperty('hidden');
  });
});

describe('the lighting of a scene from a Universal VTT file', () => {
  it.each([
    ['ff808080', 0.5],
    ['ffffffff', 1],
    ['ff000000', 0],
    ['ff0000ff', 0.07],
    ['ff1a1a40', 0.11],
  ])('is on, with the ambient light %s as %f', (color, ambient) => {
    expect(sceneOf(cryptSetting('environment.ambient_light', color)).lighting).toEqual({ enabled: true, ambient });
  });

  it('is daylight where the image carries its own light or the file names none', () => {
    expect(sceneOf(cryptSetting('environment.baked_lighting', true)).lighting).toEqual({ enabled: true, ambient: 1 });
    expect(sceneOf(cryptSetting('environment', undefined)).lighting).toEqual({ enabled: true, ambient: 1 });
  });
});

describe('what a Universal VTT file holds outside its map', () => {
  /** The crypt (10 × 8 cells at 100 px) with only `lines` as its walls, no door and no light. */
  const walled = (lines: Array<Array<{ x: number; y: number }>>): UvttScene => sceneOf(cryptWith((crypt) => {
    crypt.line_of_sight = lines;
    crypt.objects_line_of_sight = [];
    crypt.portals = [];
    crypt.lights = [];
  }));

  it('keeps a wall up to one cell beyond the image', () => {
    const scene = walled([[{ x: -1, y: -1 }, { x: 11, y: 9 }], [{ x: -0.5, y: 4 }, { x: 10.5, y: 4 }]]);

    expect(wallsOf(scene).map(ends)).toEqual([[-100, -100, 1100, 900], [-50, 400, 1050, 400]]);
    expect(scene.skipped.outside).toBe(0);
  });

  it('cuts a wall that leaves the map where it leaves, and keeps the end that stays as it is', () => {
    const scene = walled([[{ x: 3.3, y: 2.7 }, { x: 5000, y: 2.7 }], [{ x: 5, y: -16_000 }, { x: 5, y: 3.1 }]]);

    expect(wallsOf(scene).map(ends)).toEqual([[3.3 * 100, 2.7 * 100, 1100, 2.7 * 100], [500, -100, 500, 3.1 * 100]]);
  });

  it('cuts a wall that crosses the whole map at both ends', () => {
    const [wall] = wallsOf(walled([[{ x: -16_384, y: -16_384 }, { x: 16_384, y: 16_384 }]]));

    expect(ends(wall!)).toEqual([-100, -100, 900, 900]);
  });

  it('drops a wall that lies wholly outside, also one that only passes a corner', () => {
    const scene = walled([
      [{ x: 20, y: 1 }, { x: 30, y: 7 }],
      [{ x: -5, y: 3 }, { x: 3, y: -5 }],
      [{ x: 12, y: -1 }, { x: 12, y: 9 }],
      [{ x: 2, y: 2 }, { x: 4, y: 2 }],
    ]);

    expect(wallsOf(scene).map(ends)).toEqual([[200, 200, 400, 200]]);
    expect(scene.counts.walls).toBe(1);
    expect(scene.skipped.outside).toBe(3);
  });

  it('follows a line out of the map and back in, segment by segment', () => {
    const scene = walled([[{ x: 9, y: 4 }, { x: 14, y: 4 }, { x: 14, y: 6 }, { x: 9, y: 6 }]]);

    expect(wallsOf(scene).map(ends)).toEqual([[900, 400, 1100, 400], [1100, 600, 900, 600]]);
    expect(scene.skipped.outside).toBe(1);
  });

  it('counts the map from the origin the file states', () => {
    const scene = sceneOf(cryptWith((crypt) => {
      (crypt.resolution as Record<string, unknown>).map_origin = { x: 100, y: -50 };
      crypt.line_of_sight = [[{ x: 101, y: -49 }, { x: 5000, y: -49 }]];
      crypt.objects_line_of_sight = [];
      crypt.portals = [];
      crypt.lights = [{ position: { x: 105, y: -46 }, range: 2 }, { position: { x: 5, y: 4 }, range: 2 }];
    }));

    expect(wallsOf(scene).map(ends)).toEqual([[100, 100, 1100, 100]]);
    expect(Object.values(scene.lights).map((light) => [light.x, light.y])).toEqual([[500, 400]]);
    expect(scene.skipped.outside).toBe(1);
  });

  it('drops a door with an end outside and a light outside, and keeps those within a cell of the image', () => {
    const scene = sceneOf(cryptWith((crypt) => {
      crypt.line_of_sight = [];
      crypt.objects_line_of_sight = [];
      crypt.portals = [
        { bounds: [{ x: 10.5, y: 3 }, { x: 10.5, y: 4 }], closed: true },
        { bounds: [{ x: 10.5, y: 3 }, { x: 11.5, y: 3 }], closed: true },
        { bounds: [{ x: 400, y: 3 }, { x: 401, y: 3 }], closed: true },
      ];
      crypt.lights = [{ position: { x: -1, y: 9 }, range: 2 }, { position: { x: -1.01, y: 4 }, range: 2 }, { position: { x: 5, y: 9000 }, range: 2 }];
    }));

    expect(wallsOf(scene).map(ends)).toEqual([[1050, 300, 1050, 400]]);
    expect(Object.values(scene.lights).map((light) => [light.x, light.y])).toEqual([[-100, 900]]);
    expect(scene.counts).toEqual({ walls: 0, doors: 1, lights: 1 });
    expect(scene.skipped.outside).toBe(4);
    expect(scene.onImage).toBe(2);
  });

  it('tells when nothing of the file lies on its image', () => {
    const off = sceneOf(cryptWith((crypt) => { (crypt.resolution as Record<string, unknown>).map_origin = { x: 4000, y: 4000 }; }));

    expect(off).toMatchObject({ walls: {}, lights: {}, onImage: 0, counts: { walls: 0, doors: 0, lights: 0 } });
    expect(off.skipped.outside).toBe(12);
    expect(sceneOf(cryptFile()).onImage).toBe(12);
  });

  it('never places anything farther than one cell from the image, whatever the file says', () => {
    const far = [-1_000_000, -16_384, -3, 0.5, 4, 9.5, 14, 16_384, 1_000_000];
    const lines = far.flatMap((x1) => far.map((y2) => [{ x: x1, y: 4 }, { x: 5, y: y2 }]));
    const scene = sceneOf(cryptWith((crypt) => {
      crypt.line_of_sight = lines;
      crypt.portals = far.map((x) => ({ bounds: [{ x, y: 2 }, { x: 5, y: 2 }] }));
      crypt.lights = far.map((x) => ({ position: { x, y: x }, range: 3 }));
    }));

    const coordinates = [
      ...wallsOf(scene).flatMap((wall) => [wall.p1, wall.p2]),
      ...Object.values(scene.lights),
    ];
    expect(coordinates.length).toBeGreaterThan(50);
    for (const { x, y } of coordinates) {
      expect(x).toBeGreaterThanOrEqual(-100);
      expect(x).toBeLessThanOrEqual(1100);
      expect(y).toBeGreaterThanOrEqual(-100);
      expect(y).toBeLessThanOrEqual(900);
    }
  });
});

describe('walls that crowd', () => {
  const IMAGE = { width: 1000, height: 800 };
  const wallsFrom = (lines: Array<Array<{ x: number; y: number }>>): WallSegment[] => wallsOf(sceneOf(cryptWith((crypt) => {
    crypt.line_of_sight = lines;
    crypt.objects_line_of_sight = [];
    crypt.portals = [];
  })));
  const across = (count: number): Array<Array<{ x: number; y: number }>> => Array.from({ length: count }, (_, i) => [{ x: -16_384, y: -16_384 + i }, { x: 16_384, y: 16_384 - i }]);

  it('are not found in a map as a map maker draws it', () => {
    expect(wallsCrowd(wallsOf(sceneOf(cryptFile())), IMAGE)).toBe(false);
    // A cave wall drawn point by point, a point every 25 pixels
    const cave = [Array.from({ length: 400 }, (_, i) => ({ x: 5 + (3 + 0.4 * Math.sin(i / 3)) * Math.cos(i / 63.6), y: 4 + (3 + 0.4 * Math.sin(i / 3)) * Math.sin(i / 63.6) }))];
    expect(wallsCrowd(wallsFrom(cave), IMAGE)).toBe(false);
    // Twelve rooms meeting in one corner
    expect(wallsCrowd(wallsFrom(Array.from({ length: 12 }, (_, i) => [{ x: 5, y: 4 }, { x: 5 + 3 * Math.cos(i), y: 4 + 3 * Math.sin(i) }])), IMAGE)).toBe(false);
  });

  it('are found where a thousand walls end within a few pixels of each other', () => {
    expect(wallsCrowd(wallsFrom(across(1000)), IMAGE)).toBe(true);
  });

  it('are found where thousands of walls meet in one point', () => {
    expect(wallsCrowd(wallsFrom(Array.from({ length: 5000 }, (_, i) => [{ x: 5, y: 4 }, { x: 5 + 3 * Math.cos(i), y: 4 + 3 * Math.sin(i) }])), IMAGE)).toBe(true);
  });

  it('are told from the others before any joint is built, however many there are', () => {
    const walls = wallsFrom(across(20_000));

    const started = performance.now();
    expect(wallsCrowd(walls, IMAGE)).toBe(true);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('leave sealing quick wherever they are not found', () => {
    const walls = wallsFrom(across(300));
    expect(wallsCrowd(walls, IMAGE)).toBe(false);

    const started = performance.now();
    sealWalls(walls, sealTolerance(2));
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
