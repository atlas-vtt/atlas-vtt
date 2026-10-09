import { BufferImageSource, Texture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { CapsuleField } from '../CapsuleField';
import { LightMap } from '../LightMap';
import { TileCache } from '../TileCache';
import { RadianceCascades } from '../RadianceCascades';
import { BOUNCE, wallRadius } from '../../../../lighting/lightingConstants';
import { splitBlocking } from '../../../../lighting/segments';
import { createTestRenderer, readFloats } from './gpuTestUtils';
import type { WallSegment } from '../../../../types/wallTypes';
import type { MapBounds } from '../../../../vision/visibility';
import { MapAlbedo } from '../../../mapImage/mapAlbedo';
import type { MapTiles } from '../../../mapImage/mapImageTiles';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });

const bounds = { width: 1024, height: 512 };
/** Two rooms sharing the wall x = 512; the light is in the left one. */
const walls = [wall('t', 32, 32, 992, 32), wall('b', 32, 480, 992, 480), wall('l', 32, 32, 32, 480), wall('r', 992, 32, 992, 480), wall('m', 512, 32, 512, 480)];

/** A 4 × 4 map image of one premultiplied RGBA colour. */
function flatTexture(rgba: readonly [number, number, number, number]): Texture {
  const pixels = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(rgba, i);
  return new Texture({ source: new BufferImageSource({ resource: pixels, width: 4, height: 4 }) });
}

/**
 * A mipmapped map image, one texel per world pixel, white where both coordinates are 1 or 2
 * modulo 4 and black elsewhere: a quarter white, yet every emission texel's centre lies between
 * four white texels.
 */
function dottedTexture(): Texture {
  const pixels = new Uint8Array(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      const white = (x % 4 === 1 || x % 4 === 2) && (y % 4 === 1 || y % 4 === 2);
      pixels.set(white ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * bounds.width + x) * 4);
    }
  }
  return new Texture({ source: new BufferImageSource({ resource: pixels, width: bounds.width, height: bounds.height, autoGenerateMipmaps: true }) });
}

/** A map's colours in world pixels: blocks of 64 px in each channel, opaque. */
function blocks(x: number, y: number): [number, number, number] {
  return [(x >> 6) & 1 ? 200 : 110, (y >> 6) & 1 ? 170 : 90, ((x + y) >> 7) & 1 ? 150 : 60];
}

interface Painted { pixels: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }

/**
 * `world` painted by `colour` at one pixel per `step` world pixels: each pixel the average of the
 * world pixels it covers, as the map image's pyramid halves its levels.
 */
function painted(world: MapBounds, colour: (x: number, y: number) => [number, number, number], step: number): Painted {
  const width = Math.ceil(world.width / step);
  const height = Math.ceil(world.height / step);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const sum: [number, number, number] = [0, 0, 0];
      let count = 0;
      for (let y = ty * step; y < Math.min((ty + 1) * step, world.height); y++) {
        for (let x = tx * step; x < Math.min((tx + 1) * step, world.width); x++) {
          colour(x, y).forEach((channel, i) => { sum[i as 0 | 1 | 2] += channel; });
          count++;
        }
      }
      pixels.set([...sum.map((channel) => Math.round(channel / count)), 255], (ty * width + tx) * 4);
    }
  }
  return { pixels, width, height };
}

/** The lighting's albedo texture of a map image whose overview is `overview`, and its owner (`MapAlbedo`). */
async function albedoOf(overview: Painted): Promise<{ texture: Texture; albedo: MapAlbedo }> {
  const bitmap = await createImageBitmap(new ImageData(overview.pixels, overview.width, overview.height));
  const tiles = { overview: () => Promise.resolve(bitmap) } as unknown as MapTiles;
  let made = (): void => undefined;
  const ready = new Promise<void>((resolve) => { made = resolve; });
  const albedo = new MapAlbedo(() => made());
  albedo.textureOf(tiles);
  await ready;
  return { texture: albedo.textureOf(tiles)!, albedo };
}

describe('RadianceCascades', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  /** Builds the bounce of the two rooms with `albedo`; returns the fluence and its probe lookup. */
  async function bounce(albedo: Texture | null, world: MapBounds = bounds): Promise<{ probes: Float32Array; probe: (x: number, y: number) => number }> {
    const renderer: WebGLRenderer = await createTestRenderer(64);
    cleanup.push(() => renderer.destroy());
    const field = new CapsuleField(renderer, [0, 0, world.width, world.height], 2, wallRadius(2));
    const tiles = new TileCache(renderer, field, world);
    const map = new LightMap(renderer, world, 2);
    const cascades = new RadianceCascades(renderer, world, field);
    cleanup.push(() => {
      cascades.destroy();
      map.destroy();
      tiles.destroy();
      field.destroy();
    });
    field.build(splitBlocking(walls).twoWay);
    tiles.sync([{ key: 'l', x: 200, y: 256, bright: 120, dim: 240, flame: 20, color: [1, 1, 1], intensity: 1, animation: 'none' }], walls, 'all');
    const tile = tiles.tiles().get('l')!;
    map.draw([{ tile, bright: 120, dim: 240, reach: 240 * 1.12, color: [1, 1, 1], intensity: 1 }]);
    cascades.build(map, albedo, field);
    const probes = readFloats(renderer, cascades.fluence);
    const width = cascades.fluence.source.pixelWidth;
    const probe = (x: number, y: number): number => probes[(Math.floor(y / BOUNCE.probe) * width + Math.floor(x / BOUNCE.probe)) * 4]!;
    return { probes, probe };
  }

  it('bounces light into a lit room and none into the closed room beside it', async () => {
    const { probe } = await bounce(null);
    expect(probe(420, 256)).toBeGreaterThan(0);
    for (let x = 530; x < 980; x += 16) for (let y = 48; y < 470; y += 16) expect(probe(x, y)).toBe(0);
  });

  it('bounces a transparent map as mid grey, like no map at all, and an opaque one by its colour', async () => {
    const transparent = flatTexture([0, 0, 0, 0]);
    const white = flatTexture([255, 255, 255, 255]);
    cleanup.push(() => {
      transparent.destroy(true);
      white.destroy(true);
    });
    const none = await bounce(null);
    const clear = await bounce(transparent);
    const opaque = await bounce(white);
    for (let i = 0; i < none.probes.length; i++) {
      // Half floats keep 11 significant bits.
      expect(Math.abs(clear.probes[i]! - none.probes[i]!)).toBeLessThanOrEqual(Math.abs(none.probes[i]!) * 2 ** -10 + 1e-6);
    }
    // White reflects twice what mid grey does.
    expect(opaque.probe(420, 256) / none.probe(420, 256)).toBeCloseTo(2, 1);
  });

  it('bounces the average colour under each emission texel of a mipmapped map image', async () => {
    expect(BOUNCE.emitTexel).toBe(4);
    const dotted = dottedTexture();
    const average = flatTexture([64, 64, 64, 255]);
    cleanup.push(() => {
      dotted.destroy(true);
      average.destroy(true);
    });
    const mipmapped = await bounce(dotted);
    const flat = await bounce(average);
    // Read at the image's full resolution, the dots would bounce as pure white: about 20 times as much.
    expect(mipmapped.probe(420, 256) / flat.probe(420, 256)).toBeCloseTo(1, 1);
    expect(mipmapped.probe(120, 100) / flat.probe(120, 100)).toBeCloseTo(1, 1);
  });

  it('bounces an overview an eighth of the map\'s size as the map image at its full size', async () => {
    // A map of 8192 px whose albedo is its overview of 1024 px, as the map image's albedo texture is.
    const world = { width: 8192, height: 1024 };
    const image = painted(world, blocks, 1);
    const full = new Texture({ source: new BufferImageSource({ resource: image.pixels, width: image.width, height: image.height, autoGenerateMipmaps: true }) });
    const { texture: overview, albedo } = await albedoOf(painted(world, blocks, 8));
    cleanup.push(() => {
      full.destroy(true);
      albedo.reset();
    });
    expect(overview.source.pixelWidth).toBe(1024);
    const fromFull = await bounce(full, world);
    const fromOverview = await bounce(overview, world);
    // Uploaded by the bounce's renderer with its whole mip chain, read with linear filtering between levels.
    expect(overview.source.mipLevelCount).toBe(11);
    expect(overview.source.style.mipmapFilter).toBe('linear');
    const grey = await bounce(null, world);
    let largest = 0;
    let differs = 0;
    for (let i = 0; i < fromFull.probes.length; i++) {
      if (i % 4 === 3) continue;
      largest = Math.max(largest, fromFull.probes[i]!);
      differs = Math.max(differs, Math.abs(fromFull.probes[i]! - grey.probes[i]!));
    }
    // The picture's colours matter: it bounces far from mid grey.
    expect(differs).toBeGreaterThan(largest * 0.2);
    // Only the detail an overview lacks differs: the blocks' edges, blurred over an overview texel.
    let worst = 0;
    let difference = 0;
    let light = 0;
    for (let i = 0; i < fromFull.probes.length; i++) {
      if (i % 4 === 3) continue;
      const d = Math.abs(fromOverview.probes[i]! - fromFull.probes[i]!);
      worst = Math.max(worst, d);
      difference += d;
      light += fromFull.probes[i]!;
    }
    expect(worst).toBeLessThanOrEqual(largest * 0.05);
    expect(difference / light).toBeLessThan(0.02);
  });

  it('bounces a map image destroyed before the build as mid grey', async () => {
    const white = flatTexture([255, 255, 255, 255]);
    white.destroy(true);
    const none = await bounce(null);
    const gone = await bounce(white);
    expect(Array.from(gone.probes)).toEqual(Array.from(none.probes));
  });
});
