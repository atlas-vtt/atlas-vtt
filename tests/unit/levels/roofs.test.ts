import { describe, expect, it } from 'vitest';
import { MAX_ROOF_PIECES, pieceAt, piecesTransform, piecesUnder, roofDrawnAt, roofPieces, type RoofCover } from '../../../src/app/levels/roofs';
import { ambientLevelOn, ambientRaster } from '../../../src/app/lighting/ambientRaster';
import { pointInPolygon } from '../../../src/app/vision/visibility';
import { ambientAt, ambientLevel } from '../../../src/app/vision/lightLevels';
import { roofSeenAt, roofViewers } from '../../../src/app/vision/roofSight';
import { NORMAL_SIGHT } from '../../../src/app/gameSystems/senses/generic';
import { NO_STRETCH } from '../../../src/app/grid/mapStretch';
import type { Sight, SightRegion } from '../../../src/app/vision/sight';
import type { SenseDefinition } from '../../../src/app/types/senseTypes';
import type { TokenEntity } from '../../../src/app/types';

/** An alpha raster from rows of characters: `#` opaque, `+` faint (60), `.` transparent. */
function alphaOf(rows: string[]): { alpha: Uint8Array; width: number; height: number } {
  const width = rows[0]!.length;
  const alpha = new Uint8Array(width * rows.length);
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    alpha[y * width + x] = c === '#' ? 255 : c === '+' ? 60 : c === '-' ? 4 : 0;
  }));
  return { alpha, width, height: rows.length };
}

function idsOf(rows: string[]): number[][] {
  const { alpha, width, height } = alphaOf(rows);
  const { ids } = roofPieces(alpha, width, height);
  return rows.map((_, y) => [...ids.subarray(y * width, (y + 1) * width)]);
}

describe('roof pieces', () => {
  it('are the 8-connected groups of opaque pixels, numbered in reading order', () => {
    expect(idsOf([
      '##..#',
      '.#..#',
      '..#..',
      '.....',
      '#...#',
    ])).toEqual([
      [1, 1, 0, 0, 2],
      [0, 1, 0, 0, 2],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0],
      [3, 0, 0, 0, 4],
    ]);
  });

  it('join groups that meet late in the scan, as a U does', () => {
    expect(idsOf([
      '#.#',
      '#.#',
      '###',
    ]).flat()).toEqual([1, 0, 1, 1, 0, 1, 1, 1, 1]);
  });

  it('take in faint pixels up to two pixels away, nearest first, and leave the faint ones beyond and the transparent ones out', () => {
    expect(idsOf([
      '#++++',
      '.....',
      '+++.#',
      '-....',
    ])).toEqual([
      [1, 1, 1, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 2],
      [0, 0, 0, 0, 0],
    ]);
  });

  it('count at most the ids there are', () => {
    const width = 2 * (MAX_ROOF_PIECES + 3);
    const alpha = new Uint8Array(width).map((_, i) => (i % 2 === 0 ? 255 : 0));
    const pieces = roofPieces(alpha, width, 1);
    expect(pieces.count).toBe(MAX_ROOF_PIECES);
    expect(pieces.ids[width - 2]).toBe(MAX_ROOF_PIECES);
  });
});

describe('where a roof lies on the world', () => {
  const { alpha, width, height } = alphaOf(['##..', '##..', '....', '..##']);
  const pieces = roofPieces(alpha, width, height);

  it('follows the level\'s placement: an image of 400 px drawn twice its size and moved', () => {
    const transform = piecesTransform(pieces, { width: 400, height: 400 }, { ...NO_STRETCH, x: 2, y: 2, offset: { x: 100, y: 50 } });
    expect(pieceAt(pieces, transform, { x: 150, y: 100 })).toBe(1);
    expect(pieceAt(pieces, transform, { x: 899, y: 849 })).toBe(2);
    expect(pieceAt(pieces, transform, { x: 99, y: 100 })).toBe(0);
    expect(pieceAt(pieces, transform, { x: 950, y: 900 })).toBe(0);
  });

  it('fades the pieces under the points it is given, and is drawn only where a piece lies that has not faded and is seen', () => {
    const transform = piecesTransform(pieces, { width: 4, height: 4 }, NO_STRETCH);
    const faded = piecesUnder(pieces, transform, [{ x: 0.5, y: 0.5 }, { x: 2.5, y: 0.5 }]);
    expect([...faded]).toEqual([1]);
    const cover: RoofCover = { pieces, transform, faded, seen: null };
    expect(roofDrawnAt(cover, { x: 1.5, y: 1.5 })).toBe(false);
    expect(roofDrawnAt(cover, { x: 3.5, y: 3.5 })).toBe(true);
    expect(roofDrawnAt(cover, { x: 2.5, y: 0.5 })).toBe(false);
    expect(roofDrawnAt({ ...cover, seen: (p) => p.x < 3 }, { x: 3.5, y: 3.5 })).toBe(false);
  });
});

describe('the ambient light of a scene with zones, by texel', () => {
  const light = {
    ambient: 1,
    zones: [
      { polygon: [{ x: 10, y: 10 }, { x: 70, y: 12 }, { x: 40, y: 75 }], ambient: 0.4 },
      { polygon: [{ x: 30, y: 0 }, { x: 90, y: 40 }, { x: 60, y: 90 }, { x: 35, y: 50 }, { x: 0, y: 99 }], ambient: 0 },
    ],
  };
  const grid = { texel: 1, columns: 100, rows: 100 };

  it('is what the rule reads at each texel\'s centre, the topmost zone over the scene', () => {
    const raster = ambientRaster(light, grid)!;
    for (let row = 0; row < grid.rows; row++) {
      for (let column = 0; column < grid.columns; column++) {
        const centre = { x: column + 0.5, y: row + 0.5 };
        expect(ambientLevelOn(raster, light, centre)).toBe(ambientLevel({ ...light, ambient: ambientAt(centre, light) }));
      }
    }
    expect(pointInPolygon({ x: 40.5, y: 30.5 }, light.zones[0]!.polygon)).toBe(true);
  });

  it('holds nothing without zones, and off its grid the scene\'s light counts', () => {
    expect(ambientRaster({ ambient: 0.5 }, grid)).toBeNull();
    expect(ambientLevelOn(null, { ambient: 0.1 }, { x: 3, y: 3 })).toBe('dark');
    expect(ambientLevelOn(ambientRaster(light, grid), light, { x: 500, y: 3 })).toBe('bright');
  });
});

describe('where the players see a roof', () => {
  const darkvision: SenseDefinition = { ...NORMAL_SIGHT, id: 'darkvision', name: 'Darkvision', sees: { ...NORMAL_SIGHT.sees, dark: 'as-dim' } };
  const tremorsense: SenseDefinition = { ...NORMAL_SIGHT, id: 'tremor', name: 'Tremorsense', reveals: 'creatures', lineOfSight: false, worksWhileBlinded: true, sees: { ...NORMAL_SIGHT.sees, dark: 'as-bright', magicalDark: 'as-bright' } };
  const region = (sense: SenseDefinition, radius: number): SightRegion => ({
    tokenId: 't', sense, origin: { x: 0, y: 0 }, radius, polygon: [], apex: 0, seesInvisible: false,
  });
  const facingRight = { t: { id: 't', kind: 'token', x: 0, y: 0, imagePath: 't.png', rotation: 90, vision: { enabled: true, angle: 90 } } as TokenEntity };

  it('is within a sense\'s reach and its token\'s cone, whatever walls stand between, in light the sense perceives in', () => {
    const viewers = roofViewers({ all: false, regions: [region(NORMAL_SIGHT, 100)] }, facingRight);
    expect(roofSeenAt({ x: 90, y: 0 }, viewers, 'bright')).toBe(true);
    expect(roofSeenAt({ x: 0, y: 90 }, viewers, 'bright')).toBe(false);
    expect(roofSeenAt({ x: 110, y: 0 }, viewers, 'bright')).toBe(false);
    expect(roofSeenAt({ x: 90, y: 0 }, viewers, 'dark')).toBe(false);
    // Without its token the cone is not known: the disc.
    expect(roofSeenAt({ x: 0, y: 90 }, roofViewers({ all: false, regions: [region(NORMAL_SIGHT, 100)] }, {}), 'bright')).toBe(true);
  });

  it('leaves out the senses another sees all of, largest first, and is seen where it was', () => {
    const at = (x: number, sense: SenseDefinition, radius: number): SightRegion => ({ ...region(sense, radius), tokenId: `t${x}`, origin: { x, y: 0 } });
    const regions = [at(0, NORMAL_SIGHT, 50), at(10, darkvision, 20), at(500, NORMAL_SIGHT, 5000), at(30, NORMAL_SIGHT, 10)];
    const viewers = roofViewers({ all: false, regions }, {}) as Exclude<ReturnType<typeof roofViewers>, 'all'>;
    expect(viewers.map((viewer) => [viewer.origin.x, viewer.radius])).toEqual([[500, 5000], [10, 20]]);
    for (const p of [{ x: 12, y: 3 }, { x: 40, y: 0 }, { x: 6000, y: 0 }]) {
      for (const level of ['dark', 'dim', 'bright'] as const) {
        const all = regions.some((r) => roofSeenAt(p, roofViewers({ all: false, regions: [r] }, {}), level));
        expect(roofSeenAt(p, viewers, level)).toBe(all);
      }
    }
  });

  it('is seen in the dark by a sense that perceives there, never by one that shows no map', () => {
    expect(roofSeenAt({ x: 50, y: 0 }, roofViewers({ all: false, regions: [region(darkvision, 60)] }, {}), 'dark')).toBe(true);
    expect(roofSeenAt({ x: 50, y: 0 }, roofViewers({ all: false, regions: [region(tremorsense, 60)] }, {}), 'bright')).toBe(false);
  });

  it('is seen wherever normal sight perceives while sight is all, and nowhere without regions', () => {
    expect(roofViewers({ all: true, regions: [] }, {})).toBe('all');
    expect(roofSeenAt({ x: 5000, y: 0 }, 'all', 'dim')).toBe(true);
    expect(roofSeenAt({ x: 5000, y: 0 }, 'all', 'dark')).toBe(false);
    expect(roofSeenAt({ x: 0, y: 0 }, [], 'bright')).toBe(false);
  });
});
