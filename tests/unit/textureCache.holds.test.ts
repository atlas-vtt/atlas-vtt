// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextureCache } from '../../src/app/pixi/token-renderer/TextureCache';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const GOBLIN = 'tokens/goblin.png';
const ORC = 'tokens/orc.png';

function createCache(): TextureCache {
  return new TextureCache(createInMemoryApp({ files: { [GOBLIN]: 'goblin-bytes', [ORC]: 'orc-bytes' } }).app);
}

describe('TextureCache holds', () => {
  let restoreGraphics: () => void;
  beforeEach(() => {
    restoreGraphics = stubJsdomGraphics();
  });
  afterEach(() => restoreGraphics());

  it('shares one texture between every hold on an image', async () => {
    const cache = createCache();

    const first = await cache.acquire(GOBLIN);
    const second = await cache.acquire(GOBLIN);

    expect(second).toBe(first);
  });

  it('never destroys held art, even when the scene does not list it', async () => {
    const cache = createCache();
    const goblin = await cache.acquire(GOBLIN);

    cache.evictUnused([]);

    expect(goblin.destroyed).toBe(false);
    expect(goblin.source).not.toBeNull();
  });

  it('destroys art once its last hold is dropped, unless the scene keeps it', async () => {
    const cache = createCache();
    const goblin = await cache.acquire(GOBLIN);
    const orc = await cache.acquire(ORC);
    await cache.acquire(ORC);

    cache.release(GOBLIN);
    cache.release(ORC);
    cache.evictUnused([]);

    expect(goblin.destroyed).toBe(true);
    expect(orc.destroyed).toBe(false);

    cache.release(ORC);
    cache.evictUnused([ORC]);
    expect(orc.destroyed).toBe(false);

    cache.evictUnused([]);
    expect(orc.destroyed).toBe(true);
  });

  it('holds art from the moment it is requested, so an eviction during the load cannot destroy it', async () => {
    const cache = createCache();

    const loading = cache.acquire(GOBLIN);
    cache.evictUnused([]);
    const goblin = await loading;
    cache.evictUnused([]);

    expect(goblin.destroyed).toBe(false);
  });

  it('decodes an image again after its art was evicted', async () => {
    const cache = createCache();
    const before = await cache.acquire(GOBLIN);
    cache.release(GOBLIN);
    cache.evictUnused([]);

    const after = await cache.acquire(GOBLIN);

    expect(after).not.toBe(before);
    expect(after.destroyed).toBe(false);
  });

  it('reloads changed art into a new texture that every holder gets before the old one is destroyed', async () => {
    const cache = createCache();
    const before = await cache.acquire(GOBLIN);
    const shown: unknown[] = [];

    expect(await cache.reload(GOBLIN, (texture) => shown.push(texture))).toBe(true);

    const after = await cache.acquire(GOBLIN);
    expect(shown).toEqual([after]);
    expect(after).not.toBe(before);
    expect(before.destroyed).toBe(true);
    expect(after.destroyed).toBe(false);
  });

  it('does not reload art it never loaded', async () => {
    const cache = createCache();
    expect(await cache.reload(ORC, () => undefined)).toBe(false);
  });

  it('keeps the newest content when a file changes twice before the first reload finished', async () => {
    const cache = createCache();
    await cache.acquire(GOBLIN);
    type Decode = (file: unknown) => Promise<HTMLCanvasElement>;
    const decodes: Array<(canvas: HTMLCanvasElement) => void> = [];
    vi.spyOn(cache as unknown as { decodeVaultImage: Decode }, 'decodeVaultImage')
      .mockImplementation(() => new Promise((resolve) => decodes.push(resolve)));
    const shown: unknown[] = [];
    const older = cache.reload(GOBLIN, (texture) => shown.push(texture));
    const newer = cache.reload(GOBLIN, (texture) => shown.push(texture));
    await vi.waitFor(() => expect(decodes).toHaveLength(2));

    decodes[0]!(document.createElement('canvas'));
    expect(await older).toBe(false);
    decodes[1]!(document.createElement('canvas'));
    expect(await newer).toBe(true);
    expect(shown).toEqual([await cache.acquire(GOBLIN)]);
  });

  it('keeps the current art when the changed file cannot be decoded', async () => {
    const cache = createCache();
    const before = await cache.acquire(GOBLIN);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(cache as unknown as { decodeVaultImage: () => Promise<never> }, 'decodeVaultImage')
      .mockRejectedValue(new Error('The source image could not be decoded.'));
    expect(await cache.reload(GOBLIN, () => undefined)).toBe(false);
    expect(await cache.acquire(GOBLIN)).toBe(before);
    expect(before.destroyed).toBe(false);
  });
});
