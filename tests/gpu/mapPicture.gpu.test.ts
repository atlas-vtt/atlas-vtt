import '../setup/obsidianDom';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { TesseraDecoderClient } from '../../src/app/pixi/mosaicCanvas/TesseraDecoderClient';
import { tesseraDatabaseName } from '../../src/app/pixi/mosaicCanvas/indexedDbTesseraBackend';
import { MAP_PICTURE_SIDE, mapPictureUrl, releaseMapPictures } from '../../src/app/react/components/dashboard/mapPicture';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/**
 * The dashboard's sharp picture of a map, made by the real tessera worker from the map's pyramid: the
 * whole map at `MAP_PICTURE_SIDE`, never the image at its own size.
 */

const MAP = 'atlas-vtt/assets/The Wide World.webp';
const SIZE = { width: 3000, height: 2000 };

async function painted(): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(SIZE.width, SIZE.height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#4a7a9c';
  context.fillRect(0, 0, SIZE.width, SIZE.height);
  context.fillStyle = '#8fae6b';
  context.fillRect(SIZE.width / 4, SIZE.height / 4, SIZE.width / 2, SIZE.height / 2);
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
(app as unknown as { appId: string }).appId = `map-picture-${Date.now()}`;

afterAll(async () => {
  releaseMapPictures(app);
  TesseraDecoderClient.release(app);
  await deleteDatabase(tesseraDatabaseName(app.appId));
});

function loaded(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = (): void => resolve(image);
    image.onerror = (): void => reject(new Error('The picture did not load.'));
    image.src = url;
  });
}

describe('a map\'s picture on the dashboard', () => {
  it('is the whole map at the dashboard\'s size, read once and kept for the session', async () => {
    const bytes = await painted();
    const readBinary = vi.fn(async (): Promise<ArrayBuffer> => bytes.slice(0));
    app.vault.readBinary = readBinary;

    const url = await mapPictureUrl(app, MAP);
    expect(url).toMatch(/^blob:/);
    const image = await loaded(url!);
    expect(image.naturalWidth).toBe(MAP_PICTURE_SIDE);
    expect(image.naturalWidth / image.naturalHeight).toBeCloseTo(SIZE.width / SIZE.height, 2);

    // The second page that shows it gets the same picture at once.
    expect(await mapPictureUrl(app, MAP)).toBe(url);
    expect(readBinary).toHaveBeenCalledTimes(1);
  });

  it('is none for a file that is not there', async () => {
    expect(await mapPictureUrl(app, 'atlas-vtt/assets/Gone.webp')).toBeNull();
  });
});
