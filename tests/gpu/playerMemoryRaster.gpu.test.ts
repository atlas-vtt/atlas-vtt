import type { WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { CANVAS_MEMORY_IMAGES } from '../../src/app/online/gm/memory/canvasMemoryImages';
import type { MemoryPng, MemoryRaster } from '../../src/app/online/gm/memory/memoryPorts';
import { TextureRasters } from '../../src/app/online/gm/memory/TextureRasters';
import { ExploredTexture, exploredGrid } from '../../src/app/pixi/lighting/ExploredTexture';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { ExploredShapes } from '../../src/app/vision/exploredShapes';
import { computeVisibility } from '../../src/app/vision/visibility';

const MAP = { width: 3000, height: 3000 };
const GRID = exploredGrid(MAP);
const PLAYERS = 6;

/** The walls of the online perf test's floor: eight across the map in pieces with gaps, 320 in all. */
const WALLS: WallSegment[] = [600, 1200, 1800, 2400].flatMap((at) => Array.from({ length: 40 }, (_, piece) => [
  { id: `v${at}-${piece}`, kind: 'wall', type: 'solid', p1: { x: at, y: piece * 75 }, p2: { x: at, y: piece * 75 + 60 } } as WallSegment,
  { id: `h${at}-${piece}`, kind: 'wall', type: 'solid', p1: { x: piece * 75, y: at }, p2: { x: piece * 75 + 60, y: at } } as WallSegment,
]).flat());

/** What a token at (x, y) seeing 600 px records, drawn as a fan from where it stands as sight's regions are. */
function sight(x: number, y: number): ExploredShapes {
  const polygon = computeVisibility({ x, y }, 600, WALLS);
  return { polygons: [polygon], clip: null, fans: new Map([[polygon, { x, y }]]) };
}

const covered = (coverage: Uint8Array | null): number => coverage?.reduce((count, share) => count + (share > 0 ? 1 : 0), 0) ?? -1;
const median = (values: readonly number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

describe('a player\'s explored memory on the GM\'s renderer', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function rasters(): Promise<{ readonly renderer: WebGLRenderer; readonly make: () => MemoryRaster }> {
    const renderer = await createTestRenderer(64);
    const made = new TextureRasters(() => renderer);
    cleanup.push(() => {
      made.dispose();
      renderer.destroy();
    });
    return {
      renderer,
      make: () => {
        const raster = made.create(MAP);
        if (raster === null) throw new Error('no raster');
        cleanup.unshift(() => raster.destroy());
        return raster;
      },
    };
  }

  const coverageOf = (png: MemoryPng | null): Promise<Uint8Array | null> => (png === null ? Promise.resolve(null) : CANVAS_MEMORY_IMAGES.coverage(png, GRID.columns, GRID.rows));

  it('reads back as a PNG another memory takes in texel for texel, and holds nothing once replaced by none', async () => {
    const { make } = await rasters();
    const first = make();
    first.add(sight(300, 300));
    const saved = await first.encode();
    const second = make();
    if (saved !== null) await second.merge(saved);
    const again = await second.encode();
    const [a, b] = await Promise.all([coverageOf(saved), coverageOf(again)]);
    expect(covered(a)).toBeGreaterThan(50_000);
    expect(b).toEqual(a);
    await second.replace(null);
    expect(covered(await coverageOf(await second.encode()))).toBe(0);
  });

  it('gives nothing back while its context is lost, and all it held once the context is back', async () => {
    const { renderer, make } = await rasters();
    const raster = make();
    raster.add(sight(300, 300));
    const before = await coverageOf(await raster.encode());
    renderer.canvas.dispatchEvent(new Event('webglcontextlost'));
    raster.add(sight(2700, 2700));
    expect(await raster.encode()).toBeNull();
    renderer.canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(await coverageOf(await raster.encode())).toEqual(before);
  });

  it('stamps every player\'s memory through one scratch, each holding only what was stamped into it', async () => {
    const { renderer, make } = await rasters();
    const [ana, ben] = [make(), make()];
    ana.add(sight(300, 300));
    ben.add(sight(2700, 2700));
    ana.add(sight(400, 300));
    const alone = new ExploredTexture(renderer, MAP);
    cleanup.unshift(() => alone.destroy());
    alone.add(sight(300, 300));
    alone.add(sight(400, 300));
    const [own, theirs, expected] = await Promise.all([coverageOf(await ana.encode()), coverageOf(await ben.encode()), CANVAS_MEMORY_IMAGES.coverage(new Uint8Array(await (await new Promise<Blob>((resolve) => alone.toCanvas().toBlob((blob) => resolve(blob ?? new Blob()), 'image/png'))).arrayBuffer()), GRID.columns, GRID.rows)]);
    expect(own).toEqual(expected);
    expect(covered(theirs)).toBeGreaterThan(50_000);
    expect(own?.some((share, index) => share > 0 && (theirs?.[index] ?? 0) > 0)).toBe(false);
  });

  it('costs the GM a stamp and a read-back per player that moved', async () => {
    const { renderer, make } = await rasters();
    const memories = Array.from({ length: PLAYERS }, () => make());
    const { gl } = renderer;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const device = debug === null ? 'unknown' : String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
    const drawn: number[] = [];
    const stamps: number[] = [];
    const readBacks: number[] = [];
    const encodes: number[] = [];
    for (let round = 0; round < 12; round += 1) {
      for (const [index, raster] of memories.entries()) {
        const at = { x: 300 + (index % 3) * 1200 + round * 35, y: 300 + Math.floor(index / 3) * 1800 };
        const shapes = sight(at.x, at.y);
        const start = performance.now();
        raster.add(shapes);
        drawn.push(performance.now() - start);
        // The stamp is drawn once the GPU has done it: reading a pixel waits for that.
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        stamps.push(performance.now() - start);
      }
      if (round % 4 !== 3) continue;
      for (const raster of memories) {
        // The read-back itself, which the main thread waits for; the PNG is encoded off it (`toBlob`).
        await raster.encode();
        const texture = (raster as unknown as { texture: ExploredTexture }).texture;
        const read = performance.now();
        texture.toCanvas();
        readBacks.push(performance.now() - read);
        const start = performance.now();
        await raster.encode();
        encodes.push(performance.now() - start);
      }
    }
    const textures = renderer.texture.managedTextures.length;
    const report = `[player memory] ${device}, ${GRID.columns}×${GRID.rows} texels, ${PLAYERS} players hold ${textures} GPU textures; per player: stamp ${median(drawn).toFixed(2)} ms on the main thread, ${median(stamps).toFixed(2)} ms drawn (max ${Math.max(...stamps).toFixed(2)}); read-back ${median(readBacks).toFixed(2)} ms on the main thread, ${median(encodes).toFixed(2)} ms with its PNG`;
    console.info(report);
    // Bounds for a software renderer (headless Chromium's SwiftShader); a graphics card does far less.
    expect(median(stamps), report).toBeLessThan(60);
    expect(median(readBacks), report).toBeLessThan(150);
  });
});
