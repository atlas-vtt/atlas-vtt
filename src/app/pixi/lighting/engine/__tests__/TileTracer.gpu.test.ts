import type { RenderTexture, WebGLRenderer } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { CapsuleField } from '../CapsuleField';
import { TileTracer } from '../TileTracer';
import { TileCache, type Tile } from '../TileCache';
import { sealWalls } from '../../../../lighting/sealWalls';
import { allSegments, splitBlocking } from '../../../../lighting/segments';
import { TILE_BAND_TEXELS, TILE_RAYS, sealTolerance, wallRadius } from '../../../../lighting/lightingConstants';
import { placeLight } from '../../../../lighting/lightPlacement';
import { createTestRenderer, readUnorm } from './gpuTestUtils';
import { distToOutline, fuzzRooms, insidePolygon, roomOutline, type P } from './fuzzRooms';
import type { EngineLight } from '../types';
import type { WallSegment } from '../../../../types/wallTypes';

const TEXEL = 2;

interface LitCount {
  rooms: number;
  outside: number;
  litOutside: number;
  litInside: number;
}

async function litOutside(gap: boolean, count: number, rays = TILE_RAYS): Promise<LitCount> {
  const renderer = await createTestRenderer(64);
  const result: LitCount = { rooms: 0, outside: 0, litOutside: 0, litInside: 0 };
  try {
    for (const room of fuzzRooms(17, count, gap)) {
      const walls = sealWalls(room.walls, sealTolerance(TEXEL));
      const outline = roomOutline(room);
      const light = room.lights[0]!;
      if (!insidePolygon(light, outline)) continue;
      // One-way outline walls block from the light's side: trace them as two-way walls.
      const blocking = allSegments(splitBlocking(walls));
      const placed = placeLight(light[0], light[1], 40, blocking, TEXEL);
      if (!placed) continue;
      result.rooms++;
      const field = new CapsuleField(renderer, [0, 0, 2048, 2048], TEXEL, wallRadius(TEXEL));
      const tracer = new TileTracer(renderer, field, { rays });
      let tile: RenderTexture | null = null;
      try {
        field.build(blocking);
        const reach = 500;
        const x0 = Math.floor((placed.x - reach) / TEXEL) * TEXEL, y0 = Math.floor((placed.y - reach) / TEXEL) * TEXEL;
        tile = tracer.trace([placed.x, placed.y], placed.flame, [x0, y0, 2 * reach, 2 * reach], null);
        const texels = readUnorm(renderer, tile);
        const w = tile.source.pixelWidth;
        for (let j = 0; j < tile.source.pixelHeight; j += 2) {
          for (let i = 0; i < w; i += 2) {
            const p: P = [x0 + (i + 0.5) * TEXEL, y0 + (j + 0.5) * TEXEL];
            const past = !insidePolygon(p, outline) && distToOutline(p, outline) > 0.01;
            const lit = texels[(j * w + i) * 4]! > 0;
            if (past) {
              result.outside++;
              if (lit) result.litOutside++;
            } else if (lit) result.litInside++;
          }
        }
      } finally {
        tile?.destroy(true);
        tracer.destroy();
        field.destroy();
      }
    }
  } finally {
    renderer.destroy();
  }
  return result;
}

describe('TileTracer', () => {
  it('never lights a texel past the walls of a closed room', async () => {
    const r = await litOutside(false, 12);
    expect(r.rooms).toBeGreaterThanOrEqual(8);
    expect(r.outside).toBeGreaterThan(10_000);
    expect(r.litInside).toBeGreaterThan(1_000);
    expect(r.litOutside).toBe(0);
  });

  it('does light past a wall with a gap (the check can fail)', async () => {
    expect((await litOutside(true, 6)).litOutside).toBeGreaterThan(0);
  });

  it('never lights a texel past the walls of a closed room with the fewest rays a quality traces', async () => {
    const r = await litOutside(false, 12, 8);
    expect(r.litInside).toBeGreaterThan(1_000);
    expect(r.litOutside).toBe(0);
  });

  it('traces as many rays across the flame as it is given', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 1024, 1024], TEXEL, wallRadius(TEXEL));
    const tile = (rays: number): Float32Array => {
      const tracer = new TileTracer(renderer, field, { rays });
      const traced = tracer.trace([300, 300], 60, [0, 0, 600, 600], null);
      try {
        return readUnorm(renderer, traced);
      } finally {
        traced.destroy(true);
        tracer.destroy();
      }
    };
    try {
      field.build([[360, 200, 360, 400]]);
      expect(Array.from(tile(8))).not.toEqual(Array.from(tile(TILE_RAYS)));
    } finally {
      field.destroy();
      renderer.destroy();
    }
  });

  it('traces a large tile in bands of at most TILE_BAND_TEXELS texels, as one draw would', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 2048, 2048], TEXEL, wallRadius(TEXEL));
    const render = vi.spyOn(renderer, 'render');
    const trace = (bandTexels: number): Float32Array => {
      const tracer = new TileTracer(renderer, field, { bandTexels });
      const tile = tracer.trace([1000, 1000], 80, [400, 400, 1200, 1200], null);
      try {
        return readUnorm(renderer, tile);
      } finally {
        tile.destroy(true);
        tracer.destroy();
      }
    };
    try {
      field.build([
        [900, 800, 900, 1300],
        [1100, 950, 1250, 1050],
      ]);
      const whole = trace(Infinity);
      render.mockClear();
      const banded = trace(TILE_BAND_TEXELS);
      // 600 × 600 texels, traced and then smoothed in bands of floor(budget / 600) rows each,
      // after the new tracer's first trace built its empty one-way field.
      const bands = Math.ceil(600 / Math.floor(TILE_BAND_TEXELS / 600));
      expect(bands).toBeGreaterThan(1);
      expect(render.mock.calls.length).toBe(1 + 2 * bands);
      expect(Array.from(banded)).toEqual(Array.from(whole));
    } finally {
      render.mockRestore();
      field.destroy();
      renderer.destroy();
    }
  });
});

describe('TileCache', () => {
  const light = (key: string, x: number, y: number): EngineLight => ({ key, x, y, bright: 40, dim: 80, flame: 8, color: [1, 1, 1], intensity: 1, animation: 'none' });
  const litAt = (renderer: WebGLRenderer, tile: Tile, at: P): number => {
    const i = Math.floor((at[0] - tile.rect[0]) / TEXEL), j = Math.floor((at[1] - tile.rect[1]) / TEXEL);
    return readUnorm(renderer, tile.texture)[(j * tile.texture.source.pixelWidth + i) * 4]!;
  };

  it('rebuilds only tiles a wall change touches, with the same result as a full rebuild', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 1024, 1024], TEXEL, wallRadius(TEXEL));
    const cache = new TileCache(renderer, field, { width: 1024, height: 1024 });
    const fresh = new TileCache(renderer, field, { width: 1024, height: 1024 });
    try {
      const door = { id: 'd', kind: 'wall' as const, type: 'door' as const, closed: true, p1: { x: 100, y: 0 }, p2: { x: 100, y: 200 } };
      const lights = [light('near', 60, 100), light('far', 800, 800)];
      field.build(splitBlocking([door]).twoWay);
      cache.sync(lights, [door], 'all');
      const farBefore = cache.tiles().get('far')!.texture;
      expect(litAt(renderer, cache.tiles().get('near')!, [140, 100])).toBe(0);
      const opened = [{ ...door, closed: false }];
      field.build(splitBlocking(opened).twoWay);
      expect(cache.sync(lights, opened, [[97, -3, 6, 206]])).toBe(true);
      expect(cache.tiles().get('far')!.texture).toBe(farBefore);
      expect(litAt(renderer, cache.tiles().get('near')!, [140, 100])).toBeGreaterThan(0.5);
      const partial = readUnorm(renderer, cache.tiles().get('near')!.texture);
      fresh.sync(lights, opened, 'all');
      expect(Array.from(partial)).toEqual(Array.from(readUnorm(renderer, fresh.tiles().get('near')!.texture)));
      expect(cache.sync(lights, opened, [])).toBe(false);
    } finally {
      fresh.destroy();
      cache.destroy();
      field.destroy();
      renderer.destroy();
    }
  });

  /** A pacer that lets `texels` through on every look, or nothing at all (0: the device is busy). */
  const pacing = (texels: number): { allowance: () => number; submitted: () => void; batches: number } => {
    const pacer = { batches: 0, allowance: (): number => texels, submitted: (): void => { pacer.batches++; } };
    return pacer;
  };
  const roomWalls = (closed: boolean): WallSegment[] => [
    { id: 'n', kind: 'wall', type: 'solid', p1: { x: 200, y: 200 }, p2: { x: 800, y: 200 } },
    { id: 'd', kind: 'wall', type: 'door', closed, p1: { x: 800, y: 200 }, p2: { x: 800, y: 800 } },
    { id: 's', kind: 'wall', type: 'solid', p1: { x: 200, y: 800 }, p2: { x: 800, y: 800 } },
  ];
  const big = (key: string, x: number): EngineLight => ({ ...light(key, x, 500), bright: 300, dim: 600, flame: 40 });

  it('builds a tile in steps within what the pacer allows, as it builds it at once', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 2048, 1024], TEXEL, wallRadius(TEXEL));
    const paced = new TileCache(renderer, field, { width: 2048, height: 1024 });
    const whole = new TileCache(renderer, field, { width: 2048, height: 1024 });
    try {
      const walls = roomWalls(true);
      field.build(splitBlocking(walls).twoWay);
      const pacer = pacing(TILE_BAND_TEXELS);
      paced.sync([big('l', 500)], walls, 'all', pacer);
      let pumps = 1;
      while (paced.busy()) {
        paced.pump(pacer);
        pumps++;
      }
      expect(pumps).toBeGreaterThan(2);
      expect(pacer.batches).toBe(pumps);
      whole.sync([big('l', 500)], walls, 'all');
      expect(Array.from(readUnorm(renderer, paced.tiles().get('l')!.texture))).toEqual(Array.from(readUnorm(renderer, whole.tiles().get('l')!.texture)));
    } finally {
      whole.destroy();
      paced.destroy();
      field.destroy();
      renderer.destroy();
    }
  });

  it("keeps a moved light's tile until its new one is built, and drops a tile at once when walls change within it", async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 2048, 1024], TEXEL, wallRadius(TEXEL));
    const cache = new TileCache(renderer, field, { width: 2048, height: 1024 });
    try {
      const closed = roomWalls(true);
      field.build(splitBlocking(closed).twoWay);
      cache.sync([big('l', 500)], closed, 'all');
      const before = cache.tiles().get('l')!;
      const busy = pacing(0);
      expect(cache.sync([big('l', 520)], closed, [], busy)).toBe(false);
      expect(cache.busy()).toBe(true);
      expect(cache.tiles().get('l')).toBe(before);
      // The door opens beside the moved light while its new tile waits: the old one may not show past it.
      const open = roomWalls(false);
      field.build(splitBlocking(open).twoWay);
      expect(cache.sync([big('l', 520)], open, [[797, 197, 6, 606]], busy)).toBe(true);
      expect(cache.tiles().has('l')).toBe(false);
      expect(cache.pump(pacing(Infinity))).toBe(true);
      expect(cache.busy()).toBe(false);
      expect(cache.tiles().get('l')!.x).toBe(520);
    } finally {
      cache.destroy();
      field.destroy();
      renderer.destroy();
    }
  });

  it('starts a tile again when walls change within it while it is built', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 2048, 1024], TEXEL, wallRadius(TEXEL));
    const cache = new TileCache(renderer, field, { width: 2048, height: 1024 });
    const fresh = new TileCache(renderer, field, { width: 2048, height: 1024 });
    try {
      const closed = roomWalls(true);
      field.build(splitBlocking(closed).twoWay);
      cache.sync([big('l', 500)], closed, 'all', pacing(TILE_BAND_TEXELS));
      expect(cache.busy()).toBe(true);
      const open = roomWalls(false);
      field.build(splitBlocking(open).twoWay);
      cache.sync([big('l', 500)], open, [[797, 197, 6, 606]], pacing(TILE_BAND_TEXELS));
      while (cache.busy()) cache.pump(pacing(TILE_BAND_TEXELS));
      fresh.sync([big('l', 500)], open, 'all');
      expect(Array.from(readUnorm(renderer, cache.tiles().get('l')!.texture))).toEqual(Array.from(readUnorm(renderer, fresh.tiles().get('l')!.texture)));
    } finally {
      fresh.destroy();
      cache.destroy();
      field.destroy();
      renderer.destroy();
    }
  });

  it('clips tiles to the map, however far a light shines', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 1000, 600], TEXEL, wallRadius(TEXEL));
    const cache = new TileCache(renderer, field, { width: 1000, height: 600 });
    try {
      field.build([]);
      // A 500 ft light on a 5 ft grid of 70 px: 7,000 px dim, a 16k px tile unclipped.
      const huge = { ...light('huge', 300, 200), bright: 3500, dim: 7000 };
      cache.sync([huge, light('outside', -500, 200)], [], 'all');
      const tile = cache.tiles().get('huge')!;
      expect(tile.rect).toEqual([0, 0, 1000, 600]);
      expect([tile.texture.source.pixelWidth, tile.texture.source.pixelHeight]).toEqual([500, 300]);
      expect(litAt(renderer, tile, [990, 590])).toBeGreaterThan(0.5);
      expect(cache.tiles().has('outside')).toBe(false);
    } finally {
      cache.destroy();
      field.destroy();
      renderer.destroy();
    }
  });

  it('binds a one-way wall only for lights on its blocking side', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 1024, 1024], TEXEL, wallRadius(TEXEL));
    const cache = new TileCache(renderer, field, { width: 1024, height: 1024 });
    try {
      const lit = (direction: 'left' | 'right'): number => {
        const wall = { id: 'o', kind: 'wall' as const, type: 'solid' as const, direction, p1: { x: 100, y: 0 }, p2: { x: 100, y: 200 } };
        field.build(splitBlocking([wall]).twoWay);
        cache.sync([light('l', 60, 100)], [wall], 'all');
        return litAt(renderer, cache.tiles().get('l')!, [140, 100]);
      };
      const values = [lit('left'), lit('right')].sort((a, b) => a - b);
      expect(values[0]).toBe(0);
      expect(values[1]).toBeGreaterThan(0.5);
    } finally {
      cache.destroy();
      field.destroy();
      renderer.destroy();
    }
  });
});
