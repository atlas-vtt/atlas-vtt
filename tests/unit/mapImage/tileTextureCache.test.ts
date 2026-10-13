import { Ticker, type TextureSource } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { TileTextureCache, tileTextureKey, type TileUploader } from '../../../src/app/pixi/mapImage/tileTextureCache';

class Bitmap {
  readonly close = vi.fn();
  constructor(readonly width = 512, readonly height = 512) {}
}

const bitmap = (width?: number, height?: number): ImageBitmap => new Bitmap(width, height) as unknown as ImageBitmap;
const frame = { x: 1, y: 1, width: 510, height: 510 };
const TILE_BYTES = 512 * 512 * 4;

function harness(options: { budgetBytes?: number; renderer?: TileUploader | null } = {}): {
  cache: TileTextureCache;
  tick: () => void;
  uploaded: TextureSource[];
  requestRender: ReturnType<typeof vi.fn>;
} {
  const ticker = new Ticker();
  let time = 0;
  const uploaded: TextureSource[] = [];
  const renderer: TileUploader | null = options.renderer === undefined
    ? { texture: { initSource: (source: TextureSource): void => { uploaded.push(source); } } }
    : options.renderer;
  const requestRender = vi.fn();
  const cache = new TileTextureCache({ ticker, renderer, requestRender, budgetBytes: options.budgetBytes });
  return { cache, tick: () => ticker.update((time += 16)), uploaded, requestRender };
}

describe('TileTextureCache', () => {
  it('makes a texture of the tile content of its bitmap, which PIXI never collects', () => {
    const { cache } = harness();
    const owned = bitmap();
    const texture = cache.add('h/0/0/0', owned, frame);
    expect(texture.frame).toMatchObject(frame);
    expect(texture.source.resource).toBe(owned);
    expect(texture.source.autoGarbageCollect).toBe(false);
    expect(cache.bytes).toBe(TILE_BYTES);
  });

  it('spells keys hash/level/col/row', () => {
    expect(tileTextureKey('abc', { level: 2, col: 3, row: 4 })).toBe('abc/2/3/4');
  });

  it('uploads at most four textures a frame, then asks for a render and reports them ready', () => {
    const { cache, tick, uploaded, requestRender } = harness();
    const ready: string[] = [];
    cache.onReady(key => ready.push(key));
    const textures = Array.from({ length: 6 }, (_, i) => cache.add(`h/0/${i}/0`, bitmap(), frame));
    expect(cache.isReady('h/0/0/0')).toBe(false);
    tick();
    expect(uploaded).toEqual(textures.slice(0, 4).map(t => t.source));
    expect(ready).toEqual(['h/0/0/0', 'h/0/1/0', 'h/0/2/0', 'h/0/3/0']);
    expect(requestRender).toHaveBeenCalledTimes(1);
    tick();
    expect(uploaded).toHaveLength(6);
    expect(cache.isReady('h/0/5/0')).toBe(true);
    tick();
    expect(requestRender).toHaveBeenCalledTimes(2);
  });

  it('makes tiles ready without an upload where the renderer cannot upload ahead', () => {
    const { cache, tick } = harness({ renderer: null });
    cache.add('h/0/0/0', bitmap(), frame);
    tick();
    expect(cache.isReady('h/0/0/0')).toBe(true);
  });

  it('drops a tile whose upload throws, without stopping the ticker', () => {
    const { cache, tick } = harness({ renderer: { texture: { initSource: (): void => { throw new Error('lost'); } } } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const owned = bitmap();
    cache.add('h/0/0/0', owned, frame);
    tick();
    expect(cache.has('h/0/0/0')).toBe(false);
    expect(owned.close).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('evicts the least recently used tile beyond its budget, destroying its texture and closing its bitmap', () => {
    const { cache } = harness({ budgetBytes: 3 * TILE_BYTES });
    const bitmaps = [bitmap(), bitmap(), bitmap(), bitmap()];
    const textures = bitmaps.slice(0, 3).map((b, i) => cache.add(`h/0/${i}/0`, b, frame));
    cache.get('h/0/0/0');
    cache.add('h/0/3/0', bitmaps[3]!, frame);
    expect(cache.has('h/0/1/0')).toBe(false);
    expect(textures[1]!.destroyed).toBe(true);
    expect(bitmaps[1]!.close).toHaveBeenCalled();
    expect([0, 2, 3].every(i => cache.has(`h/0/${i}/0`))).toBe(true);
    expect(cache.bytes).toBe(3 * TILE_BYTES);
  });

  it('never evicts pinned tiles, nor the tile just added', () => {
    const { cache } = harness({ budgetBytes: TILE_BYTES });
    const owner = {};
    cache.add('h/0/0/0', bitmap(), frame);
    cache.pin(owner, ['h/0/0/0']);
    cache.add('h/0/1/0', bitmap(), frame);
    expect(cache.has('h/0/0/0') && cache.has('h/0/1/0')).toBe(true);
    cache.pin(owner, ['h/0/1/0']);
    expect(cache.has('h/0/0/0')).toBe(false);
    cache.unpin(owner);
    expect(cache.has('h/0/1/0')).toBe(true);
    cache.add('h/0/2/0', bitmap(), frame);
    expect(cache.has('h/0/1/0')).toBe(false);
  });

  it('keeps the texture it holds when a key is added again', () => {
    const { cache } = harness();
    const first = cache.add('h/0/0/0', bitmap(), frame);
    const again = bitmap();
    expect(cache.add('h/0/0/0', again, frame)).toBe(first);
    expect(again.close).toHaveBeenCalled();
  });

  it('releases a pyramid, and everything when destroyed', () => {
    const { cache } = harness();
    const a = cache.add('a/0/0/0', bitmap(), frame);
    const b = cache.add('b/0/0/0', bitmap(), frame);
    cache.deletePyramid('a');
    expect(a.destroyed).toBe(true);
    expect(cache.has('b/0/0/0')).toBe(true);
    cache.destroy();
    expect(b.destroyed).toBe(true);
    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
    expect(() => cache.add('c/0/0/0', bitmap(), frame)).toThrow();
  });
});
