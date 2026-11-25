// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ImageSource, Texture } from 'pixi.js';
import { TextureCache } from '../../src/app/pixi/token-renderer/TextureCache';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const assets = vi.hoisted(() => ({ loaded: new Map<string, unknown>(), unloaded: [] as string[] }));
vi.mock('../../src/app/pixi/utils/assetLifecycle', () => ({
  loadAsset: async ({ src }: { src: string }): Promise<unknown> => assets.loaded.get(src),
  unloadAsset: async (url: string): Promise<void> => { assets.unloaded.push(url); },
}));

const URL = 'https://example.com/dragon.png';

/** A decoded image of `width` × `height`, as `createImageBitmap` makes one (scaled when asked to). */
function bitmap(width: number, height: number): ImageBitmap {
  const image = Object.create(ImageBitmap.prototype) as ImageBitmap & { width: number; height: number };
  Object.defineProperties(image, { width: { value: width }, height: { value: height }, close: { value: () => undefined } });
  return image;
}

let restoreGraphics: () => void;
beforeEach(() => {
  restoreGraphics = stubJsdomGraphics();
  vi.stubGlobal('createImageBitmap', vi.fn(async (_image: unknown, options?: ImageBitmapOptions) => bitmap(options?.resizeWidth ?? 0, options?.resizeHeight ?? 0)));
  assets.loaded.clear();
  assets.unloaded.length = 0;
});
afterEach(() => restoreGraphics());

const assetOf = (width: number, height: number): Texture => new Texture({ source: new ImageSource({ resource: bitmap(width, height) }) });
const cache = (): TextureCache => new TextureCache(createInMemoryApp({ files: {} }).app);

it('scales art from a URL down to the size art from the vault is kept at', async () => {
  assets.loaded.set(URL, assetOf(4096, 2048));
  const texture = await cache().acquire(URL);
  expect([texture.source.pixelWidth, texture.source.pixelHeight]).toEqual([1024, 512]);
  expect(assets.unloaded).toEqual([URL]);
});

it('keeps art from a URL that fits as Assets loaded it', async () => {
  const asset = assetOf(512, 512);
  assets.loaded.set(URL, asset);
  expect(await cache().acquire(URL)).toBe(asset);
  expect(assets.unloaded).toEqual([]);
});
