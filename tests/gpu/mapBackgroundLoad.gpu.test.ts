import '../setup/obsidianDom';
import { describe, expect, it } from 'vitest';
import { MapLoader, type LoadedMap } from '../../src/app/MapLoader';
import { backgroundTextureCache } from '../../src/app/pixi/backgroundTextureCache';
import { newSceneFile } from '../../src/app/services/newSceneFile';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

/**
 * A scene's map image, loaded as Obsidian hands it out and decoded by a real browser.
 *
 * Obsidian answers a `fetch` of a file's resource URL only where its installer registered the
 * `app://` scheme for that (for the Fetch API since installer 1.4.5, for cross-origin requests,
 * which Electron 40 and later demand, since 1.13). Everywhere else the request ends in
 * "TypeError: Failed to fetch" although the file is there. This browser knows no `app://`
 * scheme at all, so it refuses the same way.
 */

const SCENE = 'atlas-vtt/collections/Dungeons/scenes/Crypt.atlasmap';
const SIZE = { width: 640, height: 480 };

/** The URL Obsidian builds for a vault file: a host that changes with every start, the file's place on disk, its time. */
const resourceUrl = (path: string): string =>
  `app://30f1aedc47f2e368a9f0de942cd7640faf22/home/gm/Obsidian%20Vaults/TTRPGs/${encodeURI(path)}?1791392349249`;

async function painted(type: string): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(SIZE.width, SIZE.height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#b0a48e';
  context.fillRect(0, 0, SIZE.width, SIZE.height);
  return (await canvas.convertToBlob({ type, quality: 0.9 })).arrayBuffer();
}

/** A vector image; `size` is what its root element says of its own size. */
const drawn = (size: string): ArrayBuffer => new TextEncoder().encode(
  `<svg xmlns="http://www.w3.org/2000/svg" ${size}><rect width="100%" height="100%" fill="#b0a48e"/></svg>`,
).buffer;

/** A vault holding one scene on `image`, whose bytes are `bytes`. */
function vaultWith(image: string, bytes: ArrayBuffer): InMemoryApp['app'] {
  const scene = JSON.stringify(newSceneFile({ conditions: [] }, image));
  const { app } = createInMemoryApp({ files: { [SCENE]: scene, [image]: '' } });
  app.vault.readBinary = async (): Promise<ArrayBuffer> => bytes;
  app.vault.adapter.getResourcePath = resourceUrl;
  return app;
}

async function open(image: string, bytes: ArrayBuffer): Promise<LoadedMap> {
  return MapLoader.load(vaultWith(image, bytes), SCENE);
}

describe('opening a scene on a map image', () => {
  it('finds no way to fetch a resource URL in this browser, as on an installer that registered none', async () => {
    await expect(fetch(resourceUrl('atlas-vtt/assets/Crypt.webp'))).rejects.toThrow('Failed to fetch');
  });

  it.each([
    ['webp', 'image/webp'],
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
  ])('shows a .%s image at its own size where its resource URL cannot be fetched', async (extension, type) => {
    const loaded = await open(`atlas-vtt/assets/Crypt_1791392349248_a9m6z4.${extension}`, await painted(type));

    expect(loaded.hasBackground).toBe(true);
    expect({ width: loaded.texture.width, height: loaded.texture.height }).toEqual(SIZE);
    expect(loaded.texture.source.resource).toBeInstanceOf(ImageBitmap);
    backgroundTextureCache.release(loaded.backgroundUrl!);
  });

  it('shows a vector image at the size it states', async () => {
    const loaded = await open('maps/Crypt.svg', drawn(`width="${SIZE.width}" height="${SIZE.height}"`));

    expect({ width: loaded.texture.width, height: loaded.texture.height }).toEqual(SIZE);
    backgroundTextureCache.release(loaded.backgroundUrl!);
  });

  it.each([
    ['only a view box', `viewBox="0 0 ${SIZE.width} ${SIZE.height}"`],
    ['a size relative to its place', `width="100%" height="100%" viewBox="0 0 ${SIZE.width} ${SIZE.height}"`],
  ])('shows a vector image that states %s at the size an <img> gives it', async (_what, size) => {
    const loaded = await open('maps/Crypt.svg', drawn(size));

    // The browser's 300 × 150 box for an image without a size, at the view box's proportions
    expect({ width: loaded.texture.width, height: loaded.texture.height }).toEqual({ width: 200, height: 150 });
    backgroundTextureCache.release(loaded.backgroundUrl!);
  });

  it('frees the decoded image once no scene shows it', async () => {
    const loaded = await open('atlas-vtt/assets/Crypt.webp', await painted('image/webp'));
    const bitmap = loaded.texture.source.resource as ImageBitmap;

    backgroundTextureCache.release(loaded.backgroundUrl!);

    await expect.poll(() => loaded.texture.destroyed).toBe(true);
    expect(bitmap.width).toBe(0);
  });

  it('names the image and the reason when the file holds none', async () => {
    const load = open('atlas-vtt/assets/Crypt.webp', new TextEncoder().encode('not an image').buffer);

    await expect(load).rejects.toThrow('The image atlas-vtt/assets/Crypt.webp could not be read: The source image cannot be decoded.');
  });
});
