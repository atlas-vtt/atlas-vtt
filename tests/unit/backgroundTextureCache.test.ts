import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Texture } from 'pixi.js';

const destroy = vi.hoisted(() => vi.fn());

vi.mock('../../src/app/pixi/vaultImageTexture', () => ({ destroyVaultTexture: destroy }));

interface FakeTexture {
  url: string;
  width: number;
  height: number;
  source: { pixelWidth: number; pixelHeight: number; autoGenerateMipmaps: boolean; scaleMode: string; update: () => void };
}

function fakeTexture(url: string, size: number): FakeTexture {
  return {
    url,
    width: size,
    height: size,
    source: { pixelWidth: size, pixelHeight: size, autoGenerateMipmaps: false, scaleMode: 'nearest', update: vi.fn() },
  };
}

/** Side length whose decoded texture (no mipmaps) takes `mb` megabytes. */
function sideForMegabytes(mb: number): number {
  return Math.sqrt((mb * 1024 * 1024) / 4);
}

/** The cache with every background decoded by `decode`, which the tests count and replace. */
interface Bench {
  decode: Mock<(url: string) => Promise<FakeTexture>>;
  acquire: (url: string) => Promise<FakeTexture>;
  release: (url: string) => void;
  /** The URLs of the backgrounds destroyed so far; the cache destroys one once its decoding has ended. */
  destroyed: () => Promise<string[]>;
}

async function loadCache(): Promise<Bench> {
  vi.resetModules();
  const cache = (await import('../../src/app/pixi/backgroundTextureCache')).backgroundTextureCache;
  const decode = vi.fn(async (url: string) => fakeTexture(url, 1024));
  return {
    decode,
    acquire: (url) => cache.acquire(url, () => decode(url) as unknown as Promise<Texture>) as unknown as Promise<FakeTexture>,
    release: (url) => cache.release(url),
    destroyed: async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return destroy.mock.calls.map(([texture]) => (texture as FakeTexture).url);
    },
  };
}

describe('backgroundTextureCache', () => {
  beforeEach(() => {
    destroy.mockReset();
  });

  it('decodes a background once and shares it between users', async () => {
    const cache = await loadCache();
    const first = await cache.acquire('a');
    const second = await cache.acquire('a');

    expect(first).toBe(second);
    expect(cache.decode).toHaveBeenCalledTimes(1);
    expect(first.source.autoGenerateMipmaps).toBe(true);
    expect(first.source.scaleMode).toBe('linear');
  });

  it('keeps a left map decoded while another map is open, so switching back skips decoding', async () => {
    const cache = await loadCache();
    await cache.acquire('a');
    await cache.acquire('b');
    cache.release('a');

    await cache.acquire('a');
    expect(cache.decode).toHaveBeenCalledTimes(2);
    expect(await cache.destroyed()).toEqual([]);
  });

  it('destroys the least recently used idle maps beyond the entry limit', async () => {
    const cache = await loadCache();
    await cache.acquire('open');
    for (const url of ['a', 'b', 'c', 'd']) {
      await cache.acquire(url);
      cache.release(url);
    }

    expect(await cache.destroyed()).toEqual(['a']);
  });

  it('destroys idle maps beyond the memory budget but always keeps the last one left', async () => {
    const cache = await loadCache();
    cache.decode.mockImplementation(async (url) => fakeTexture(url, sideForMegabytes(200)));
    await cache.acquire('open');
    for (const url of ['a', 'b']) {
      await cache.acquire(url);
      cache.release(url);
    }

    expect(await cache.destroyed()).toEqual(['a']);
  });

  it('frees every background once no map is open', async () => {
    const cache = await loadCache();
    await cache.acquire('a');
    await cache.acquire('b');
    cache.release('a');
    cache.release('b');

    expect(await cache.destroyed()).toEqual(['a', 'b']);
  });

  it('destroys a background that was let go while it was still being decoded, and decodes it anew for the next user', async () => {
    const cache = await loadCache();
    let finishDecoding!: (texture: FakeTexture) => void;
    cache.decode.mockReturnValueOnce(new Promise<FakeTexture>((resolve) => {
      finishDecoding = resolve;
    }));
    const abandoned = cache.acquire('a');
    cache.release('a');
    expect(await cache.destroyed()).toEqual([]);

    const next = await cache.acquire('a');
    finishDecoding(fakeTexture('a', 1024));

    expect(await abandoned).not.toBe(next);
    expect(destroy).toHaveBeenCalledExactlyOnceWith(await abandoned);
  });

  it('retries a background whose load failed', async () => {
    const cache = await loadCache();
    cache.decode.mockRejectedValueOnce(new Error('decode failed'));

    await expect(cache.acquire('a')).rejects.toThrow('decode failed');
    await expect(cache.acquire('a')).resolves.toBeDefined();
    expect(cache.decode).toHaveBeenCalledTimes(2);
  });
});
