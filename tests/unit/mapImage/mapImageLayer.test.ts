import { Sprite, Ticker, type Container } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapImageLayer, viewportCamera, type TileSource } from '../../../src/app/pixi/mapImage/MapImageLayer';
import type { TileView } from '../../../src/app/pixi/mapImage/levelOfDetail';
import { pyramidOf, tileContentFrame, tileKey, tileSourceRect, type TileRef } from '../../../src/app/pixi/mapImage/pyramid';
import { TileTextureCache } from '../../../src/app/pixi/mapImage/tileTextureCache';
import { MOTION_NORMAL_MS } from '../../../src/app/utils/motion';

class Bitmap {
  readonly close = vi.fn();
  constructor(readonly width: number, readonly height: number) {}
}

interface Pending {
  ref: TileRef;
  signal: AbortSignal;
  resolve: (bitmap: ImageBitmap) => void;
}

// 3000 × 2000: level 0 is 6 × 4 tiles, level 1 (the overview) 3 × 2, level 2 2 × 1, level 3 one tile.
const pyramid = pyramidOf(3000, 2000);
const OVERVIEW = ['1/0/0', '1/1/0', '1/2/0', '1/0/1', '1/1/1', '1/2/1'];

function harness(options: { camera?: TileView | null; reducedMotion?: boolean } = {}): {
  layer: MapImageLayer;
  cache: TileTextureCache;
  pending: Pending[];
  requested: () => string[];
  requestRender: ReturnType<typeof vi.fn>;
  frame: () => Promise<void>;
  serve: (until?: (ref: TileRef) => boolean) => Promise<void>;
  setCamera: (view: TileView | null) => void;
} {
  const ticker = new Ticker();
  let time = 0;
  const requestRender = vi.fn();
  const cache = new TileTextureCache({ ticker, renderer: null, requestRender, uploadsPerFrame: 64 });
  const pending: Pending[] = [];
  const all: string[] = [];
  const source: TileSource = {
    key: 'hash',
    pyramid,
    requestTile: (ref, signal) => new Promise<ImageBitmap>((resolve, reject) => {
      all.push(tileKey(ref));
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      pending.push({ ref, signal, resolve });
    }),
  };
  let camera = options.camera ?? null;
  const layer = new MapImageLayer({
    source, cache, ticker, requestRender, camera: () => camera, reducedMotion: () => options.reducedMotion ?? false,
  });
  const frame = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(16);
    ticker.update((time += 16));
  };
  const serve = async (accept: (ref: TileRef) => boolean = () => true): Promise<void> => {
    for (let round = 0; round < 40; round++) {
      const due = pending.filter(p => !p.signal.aborted && accept(p.ref));
      pending.splice(0, pending.length, ...pending.filter(p => !due.includes(p)));
      for (const { ref, resolve } of due) {
        const rect = tileSourceRect(pyramid, ref);
        resolve(new Bitmap(rect.width, rect.height) as unknown as ImageBitmap);
      }
      await frame();
      if (due.length === 0 && pending.every(p => p.signal.aborted || !accept(p.ref))) return;
    }
  };
  return { layer, cache, pending, requested: () => all, requestRender, frame, serve, setCamera: (view) => { camera = view; } };
}

const sprites = (layer: MapImageLayer): Sprite[] =>
  (layer.container.children as Container[]).flatMap(level => level.children.filter((c): c is Sprite => c instanceof Sprite));
const spriteOf = (layer: MapImageLayer, key: string): Sprite | undefined => sprites(layer).find(s => s.label === key);
const level0 = (rect: TileView['rect']): TileView => ({ rect, worldPerScreenPixel: 1 });

describe('MapImageLayer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a render group bounded by the world rect, with one container per level scaled to cover the world', () => {
    const { layer } = harness();
    expect(layer.container.isRenderGroup).toBe(true);
    expect(layer.container.boundsArea).toMatchObject({ x: 0, y: 0, width: 3000, height: 2000 });
    const levels = layer.container.children;
    expect(levels).toHaveLength(pyramid.levels.length);
    // Coarsest first, so finer levels lie on top.
    expect(levels.map(level => level.scale.x)).toEqual([...pyramid.levels].reverse().map(level => level.scaleX));
    expect(levels[0]!.scale.y).toBeCloseTo(2000 / 250);
  });

  it('requests the overview first, then the camera\'s tiles by priority, at most six at once', async () => {
    const { requested, serve, frame } = harness({ camera: level0({ x: 0, y: 0, width: 800, height: 600 }) });
    await frame();
    expect(requested()).toEqual(OVERVIEW);
    await serve();
    // The camera's two by two tiles and the prefetch ring, nearest first.
    expect(requested().slice(6)).toEqual(['0/0/0', '0/1/0', '0/0/1', '0/1/1', '0/2/0', '0/0/2', '0/2/1', '0/1/2', '0/2/2']);
  });

  it('draws tiles at integer level-pixel positions with their content frames, untouchable', async () => {
    const { layer, serve, frame } = harness({ camera: level0({ x: 0, y: 0, width: 800, height: 600 }), reducedMotion: true });
    await frame();
    await serve();
    const tile = spriteOf(layer, '0/1/1')!;
    expect(tile).toBeDefined();
    expect([tile.x, tile.y]).toEqual([510, 510]);
    expect(tile.texture.frame).toMatchObject(tileContentFrame(pyramid, { level: 0, col: 1, row: 1 }));
    expect(tile.texture.frame).toMatchObject({ x: 1, y: 1, width: 510, height: 510 });
    expect(tile.eventMode).toBe('none');
    layer.addDemandRegion(level0({ x: 2600, y: 1600, width: 300, height: 300 }));
    await serve();
    const edge = spriteOf(layer, '0/5/3')!;
    expect([edge.x, edge.y, edge.width, edge.height]).toEqual([2550, 1530, 450, 470]);
    expect(edge.texture.frame).toMatchObject({ x: 1, y: 1, width: 450, height: 470 });
  });

  it('fades tiles in over the normal motion time, asking for a render at each step, then hides covered coarse tiles', async () => {
    const { layer, serve, frame, requestRender } = harness({ camera: level0({ x: 0, y: 0, width: 1020, height: 1020 }) });
    await frame();
    await serve(ref => ref.level === pyramid.overview);
    const overview = spriteOf(layer, '1/0/0')!;
    expect(overview.alpha).toBeLessThan(1);
    requestRender.mockClear();
    await vi.advanceTimersByTimeAsync(MOTION_NORMAL_MS / 2);
    expect(overview.alpha).toBeGreaterThan(0);
    expect(overview.alpha).toBeLessThan(1);
    expect(requestRender).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MOTION_NORMAL_MS);
    expect(overview.alpha).toBe(1);
    await serve();
    await vi.advanceTimersByTimeAsync(MOTION_NORMAL_MS * 2);
    await frame();
    // Its four children are opaque now: the overview tile is kept but not drawn.
    expect(spriteOf(layer, '0/1/1')!.alpha).toBe(1);
    expect(overview.visible).toBe(false);
    expect(overview.destroyed).toBe(false);
  });

  it('draws at once under reduced motion', async () => {
    const { layer, serve, frame } = harness({ camera: level0({ x: 0, y: 0, width: 500, height: 500 }), reducedMotion: true });
    await frame();
    await serve();
    expect(sprites(layer).every(sprite => sprite.alpha === 1)).toBe(true);
  });

  it('requests the union of every demand region, and stops once a region ends', async () => {
    const { layer, requested, serve, frame, pending } = harness();
    await frame();
    await serve();
    const end = layer.addDemandRegion(level0({ x: 0, y: 0, width: 100, height: 100 }));
    layer.addDemandRegion(level0({ x: 2900, y: 1900, width: 100, height: 100 }));
    await frame();
    expect(requested()).toEqual(expect.arrayContaining(['0/0/0', '0/5/3']));
    end();
    await frame();
    const open = pending.filter(p => !p.signal.aborted).map(p => tileKey(p.ref));
    expect(open).toContain('0/5/3');
    expect(open).not.toContain('0/0/0');
  });

  it('aborts requests for tiles no longer wanted, never the overview\'s', async () => {
    const { pending, frame, setCamera } = harness({ camera: level0({ x: 0, y: 0, width: 300, height: 300 }) });
    await frame();
    const overview = pending.slice();
    setCamera(level0({ x: 2900, y: 1900, width: 100, height: 100 }));
    await frame();
    expect(overview.every(p => !p.signal.aborted)).toBe(true);
    setCamera({ rect: { x: 0, y: 0, width: 3000, height: 2000 }, worldPerScreenPixel: 8 });
    await frame();
    expect(overview.every(p => !p.signal.aborted)).toBe(true);
  });

  it('aborts open requests of the camera\'s old place when it moves', async () => {
    const { pending, serve, frame, setCamera } = harness({ camera: level0({ x: 0, y: 0, width: 300, height: 300 }) });
    await frame();
    await serve(ref => ref.level === pyramid.overview);
    const near = pending.filter(p => p.ref.level === 0);
    expect(near.length).toBeGreaterThan(0);
    setCamera(level0({ x: 2900, y: 1900, width: 100, height: 100 }));
    await frame();
    expect(near.every(p => p.signal.aborted)).toBe(true);
  });

  it('resolves whenReady once the view\'s tiles are opaque, or at its timeout', async () => {
    const { layer, serve, frame } = harness({ reducedMotion: true });
    let ready = false;
    void layer.whenReady(level0({ x: 0, y: 0, width: 600, height: 600 }), 5000).then(() => { ready = true; });
    await frame();
    expect(ready).toBe(false);
    await serve();
    await frame();
    expect(ready).toBe(true);

    let timedOut = false;
    void layer.whenReady(level0({ x: 2500, y: 1500, width: 400, height: 400 }), 100).then(() => { timedOut = true; });
    await vi.advanceTimersByTimeAsync(120);
    expect(timedOut).toBe(true);
  });

  it('leaves no texture, sprite or open request when destroyed', async () => {
    const { layer, cache, pending, serve, frame } = harness({ camera: level0({ x: 0, y: 0, width: 600, height: 600 }) });
    await frame();
    await serve(ref => ref.level === pyramid.overview);
    const textures = sprites(layer).map(sprite => sprite.texture);
    expect(textures.length).toBeGreaterThan(0);
    layer.destroy();
    expect(cache.size).toBe(0);
    expect(textures.every(texture => texture.destroyed)).toBe(true);
    expect(layer.container.destroyed).toBe(true);
    expect(pending.every(p => p.signal.aborted)).toBe(true);
  });
});

describe('viewportCamera', () => {
  it('reads the visible world rect and world units per device pixel', () => {
    const camera = viewportCamera({ left: 100, top: 50, worldScreenWidth: 400, worldScreenHeight: 300, scale: { x: 2 } }, { resolution: 2 });
    expect(camera()).toEqual({ rect: { x: 100, y: 50, width: 400, height: 300 }, worldPerScreenPixel: 0.25 });
    expect(viewportCamera({ left: 0, top: 0, worldScreenWidth: 0, worldScreenHeight: 0, scale: { x: 1 } }, { resolution: 1 })()).toBeNull();
  });
});
