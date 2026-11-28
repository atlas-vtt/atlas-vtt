import '../setup/obsidianDom';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { cutBackdrop } from '../../src/app/online/gmScreen/backdrop/cutBackdrop';
import { MAX_BACKDROP_BYTES } from '../../src/app/online/protocol/index.ts';
import { TesseraDecoderClient } from '../../src/app/pixi/mosaicCanvas/TesseraDecoderClient';
import { tesseraDatabaseName } from '../../src/app/pixi/mosaicCanvas/indexedDbTesseraBackend';
import { fromBase64 } from '../../src/app/utils/base64';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/**
 * The picture behind Sidekick's screens, cut by the real tessera worker from the world map's pyramid: the middle of the
 * map at a phone's own pixels as it covers the screen, small enough for one message.
 */

const MAP = 'atlas-vtt/assets/The Wide World.webp';
const SIZE = { width: 3000, height: 2000 };

/** A wide map: blue at its left and right thirds, green in its middle third, so the cut's middle can be told. */
async function painted(): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(SIZE.width, SIZE.height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#2050c0';
  context.fillRect(0, 0, SIZE.width, SIZE.height);
  context.fillStyle = '#30b040';
  context.fillRect(SIZE.width / 3, 0, SIZE.width / 3, SIZE.height);
  return (await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 })).arrayBuffer();
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = (): void => resolve();
    request.onerror = (): void => resolve();
    request.onblocked = (): void => resolve();
  });
}

const { app } = createInMemoryApp({ files: { [MAP]: '' } });
(app as unknown as { appId: string }).appId = `backdrop-cut-${Date.now()}`;

afterAll(async () => {
  TesseraDecoderClient.release(app);
  await deleteDatabase(tesseraDatabaseName(app.appId));
});

describe('the world map cut for a device\'s screen', () => {
  it('is the middle of the map at the phone\'s own pixels, small enough for one message', async () => {
    const bytes = await painted();
    app.vault.readBinary = vi.fn(async (): Promise<ArrayBuffer> => bytes.slice(0));
    const picture = await cutBackdrop(app, MAP, 390, 844);
    expect(picture).not.toBeNull();
    const data = fromBase64(picture!.data);
    expect(data.length).toBeLessThanOrEqual(MAX_BACKDROP_BYTES);
    const image = await createImageBitmap(new Blob([data], { type: picture!.mime }));
    expect([image.width, image.height]).toEqual([390, 844]);
    // A phone upright on a wide map shows its middle: the green third, at both edges of the cut
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    for (const x of [4, image.width - 5]) {
      const [r, g, b] = context.getImageData(x, image.height / 2, 1, 1).data;
      expect(g, `green at ${x}`).toBeGreaterThan(r! + 60);
      expect(g).toBeGreaterThan(b! + 60);
    }
  });

  it('is none for a file that is not there', async () => {
    expect(await cutBackdrop(app, 'atlas-vtt/assets/Gone.webp', 390, 844)).toBeNull();
  });
});
