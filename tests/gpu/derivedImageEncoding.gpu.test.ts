import { afterAll, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { drawingCanvas, holdsPixels, learnCanvasLimit } from '../../src/app/imageProcessing/canvasLimit';
import { imageHeader, imageMimeType } from '../../src/app/imageProcessing/imageDimensions';
import { derivedImageFormat, encodeImage } from '../../src/app/imageProcessing/imageEncoder';
import { disposeImageProcessing, IMAGE_PRESETS, optimizeImage, renderThumbnail } from '../../src/app/imageProcessing/imageProcessing';
import { browserGraphicsPrimitives, createTesseraGraphics } from '../../src/app/pixi/mosaicCanvas/tesseraGraphics';
import { AssetService } from '../../src/app/services/AssetService';
import { AssetThumbnailService, THUMBNAIL_SPEC } from '../../src/app/services/AssetThumbnailService';
import { imageExtension } from '../../src/app/services/assetImageFiles';
import { collectionCoverPath, coverFileFor } from '../../src/app/services/collectionBundle/collectionCover';
import { createInMemoryApp, interceptWrites } from '../mocks/inMemoryVault';

/**
 * What a derived picture is on the engine this runs in: a WebP named `.webp` where the engine
 * encodes WebP (Chromium: desktop and Android), a PNG named `.png` where it answers a request for
 * WebP with a PNG (WebKit: iPadOS). Runs in the `gpu` project on Chromium and in the `webkit`
 * project on Playwright's WebKit; only a real encoder can tell.
 */

const WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrom(e|ium)/.test(navigator.userAgent);
const FORMAT = WEBKIT ? 'png' : 'webp';
const TYPE = `image/${FORMAT}`;
const IMAGE = 'atlas-vtt/assets/map.png';

function drawing(width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2eb9b8';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#e8261c';
  for (let x = 5; x < width; x += 37) ctx.fillRect(x, 0, 1, height);
  return canvas;
}

async function pixels(image: Blob | ImageBitmap | OffscreenCanvas): Promise<Uint8ClampedArray> {
  const source = image instanceof Blob ? await createImageBitmap(image) : image;
  const ctx = new OffscreenCanvas(source.width, source.height).getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  return ctx.getImageData(0, 0, source.width, source.height).data;
}

/** Where two pictures first differ, or -1: a loop, since a deep comparison of millions of bytes takes a minute. */
function firstDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

afterAll(() => disposeImageProcessing());

describe(`derived pictures on ${WEBKIT ? 'WebKit' : 'Chromium'}`, () => {
  it('are encoded in the format the engine has, on the main thread', async () => {
    expect(await derivedImageFormat((width, height) => new OffscreenCanvas(width, height))).toBe(FORMAT);
    const blob = await encodeImage(drawing(64, 48), 0.8);
    expect(blob.type).toBe(TYPE);
    expect((await imageHeader(blob))?.format).toBe(FORMAT);
  });

  it('are encoded in that format in the image workers, and named by their bytes', async () => {
    const upload = await drawing(640, 480).convertToBlob({ type: 'image/png' });

    const thumbnail = await renderThumbnail(upload, THUMBNAIL_SPEC);

    expect(await imageHeader(new Blob([thumbnail]))).toEqual({ format: FORMAT, width: 256, height: 192 });
    expect(imageExtension(thumbnail)).toBe(FORMAT);
    expect(imageMimeType(thumbnail)).toBe(TYPE);
  });

  it('keep an upload that fits byte for byte, whatever the engine encodes', async () => {
    const upload = await drawing(640, 480).convertToBlob({ type: 'image/jpeg', quality: 0.9 });

    const { image, thumbnail } = await optimizeImage(upload, IMAGE_PRESETS.map, { thumbnail: THUMBNAIL_SPEC });

    expect(new Uint8Array(await image.arrayBuffer())).toEqual(new Uint8Array(await upload.arrayBuffer()));
    expect(thumbnail?.type).toBe(TYPE);
  });

  it('hold a scaled map pixel for pixel: lossless in either format', async () => {
    const map = drawing(600, 400);
    const blob = await encodeImage(map, IMAGE_PRESETS.map.quality);
    expect(blob.type).toBe(TYPE);
    expect(firstDifference(await pixels(blob), await pixels(map))).toBe(-1);
  });

  it('write a thumbnail file under the extension of its format, recorded on its asset', async () => {
    const vault = createInMemoryApp();
    AssetService.resetInstance();
    const assets = AssetService.getInstance(vault.app);
    await assets.initialize();
    const upload = await (await drawing(640, 480).convertToBlob({ type: 'image/png' })).arrayBuffer();
    await vault.app.vault.create(IMAGE, '');
    (vault.app.vault as { readBinary: unknown }).readBinary = async (): Promise<ArrayBuffer> => upload;
    const written = new Map<string, ArrayBuffer>();
    interceptWrites(vault.app.vault, 'createBinary', (target: unknown, content: unknown) => {
      if (content instanceof ArrayBuffer) written.set(target instanceof TFile ? target.path : String(target), content);
    });
    const service = new AssetThumbnailService(vault.app, assets);

    const path = await service.createForImage(IMAGE);

    expect(path).toBe(service.thumbnailPathFor(IMAGE, FORMAT));
    expect(path.endsWith(`.${FORMAT}`)).toBe(true);
    expect((await imageHeader(new Blob([written.get(path)!])))?.format).toBe(FORMAT);
  });

  it('name a new collection cover by its format', async () => {
    const vault = createInMemoryApp();
    AssetService.resetInstance();
    const assets = AssetService.getInstance(vault.app);
    await assets.initialize();
    const { id } = await assets.createCollection('source');
    const collection = (await assets.getCollection(id))!;

    const cover = await coverFileFor(vault.app, collection, { kind: 'upload', image: await drawing(800, 400).convertToBlob({ type: 'image/png' }) });

    expect(cover?.path).toBe(collectionCoverPath(id, FORMAT));
    expect(imageExtension(cover!.data)).toBe(FORMAT);
  });

  it('cut map tesserae in that format, which decode to the map\'s own pixels', async () => {
    const graphics = createTesseraGraphics(browserGraphicsPrimitives());
    const map = drawing(600, 400);
    const level = await createImageBitmap(map);

    expect(await graphics.tesseraFormat()).toBe(FORMAT);
    const tessera = await graphics.encodeTessera(level, { x: 0, y: 0, width: 512, height: 400 });

    expect(tessera.type).toBe(TYPE);
    const decoded = await graphics.decode(tessera);
    const whole = await pixels(map);
    const cut = await pixels(decoded);
    for (let row = 0; row < 400; row += 57) {
      expect(cut.slice(row * 512 * 4, (row + 1) * 512 * 4)).toEqual(whole.slice(row * 600 * 4, row * 600 * 4 + 512 * 4));
    }
  });
});

describe(`large canvases on ${WEBKIT ? 'WebKit' : 'Chromium'}`, () => {
  it('hold a pixel in their far corner where the engine draws on them, and are left clear by the question', async () => {
    const canvas = new OffscreenCanvas(5000, 300);
    expect(holdsPixels(canvas)).toBe(true);
    const corner = canvas.getContext('2d')!.getImageData(4999, 299, 1, 1).data;
    expect([...corner]).toEqual([0, 0, 0, 0]);
  });

  it('are not needed for a whole picture: drawn in pieces, it has the pixels one canvas gives it', async () => {
    const level = await createImageBitmap(drawing(2500, 2100));
    const parts = [
      { source: level, from: { x: 0, y: 0, width: 2500, height: 2100 }, to: { x: 0, y: 0, width: 2500, height: 2100 } },
      { source: level, from: { x: 3, y: 0, width: 300, height: 200 }, to: { x: 1900, y: 1950, width: 300, height: 200 } },
    ];
    const onOne = await createTesseraGraphics(browserGraphicsPrimitives()).compose(2600, 2200, parts);
    const inPieces = await createTesseraGraphics({ ...browserGraphicsPrimitives(), createPictureCanvas: () => null }).compose(2600, 2200, parts);

    expect([inPieces.width, inPieces.height]).toEqual([2600, 2200]);
    expect(firstDifference(await pixels(inPieces), await pixels(onOne))).toBe(-1);
  });

  it('are handed out for a picture: asked first only where the engine cannot encode WebP', async () => {
    await learnCanvasLimit();
    const canvas = drawingCanvas({ width: 5000, height: 300 });
    expect([canvas?.width, canvas?.height]).toEqual([5000, 300]);
  });
});
