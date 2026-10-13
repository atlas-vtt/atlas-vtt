import { afterAll, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { imageHeader } from '../../src/app/imageProcessing/imageDimensions';
import { IMAGE_PRESETS, disposeImageProcessing, optimizeImage, renderThumbnail } from '../../src/app/imageProcessing/imageProcessing';
import { AssetService, type CollectionMetadata } from '../../src/app/services/AssetService';
import { THUMBNAIL_SPEC } from '../../src/app/services/AssetThumbnailService';
import { collectionCoverPath, coverFileFor, storeCover } from '../../src/app/services/collectionBundle/collectionCover';
import { createInMemoryApp, interceptWrites, type InMemoryApp } from '../mocks/inMemoryVault';

/**
 * Covers and thumbnails are stored under WebP names, so they are WebP whatever was uploaded,
 * while maps and tokens, named by their own format, keep an upload that fits. Only a real
 * encoder writes the bytes that tell, so this runs in the browser.
 */

const COVER_PRESET = { maxWidth: 1600, maxHeight: 1600, quality: 0.85 };

async function picture(width: number, height: number, type: string): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#2eb9b8';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#e8261c';
  context.fillRect(width / 4, height / 4, width / 2, height / 2);
  return canvas.convertToBlob({ type, quality: 0.9 });
}

const bytesOf = async (image: Blob | ArrayBuffer): Promise<Uint8Array> => new Uint8Array(image instanceof Blob ? await image.arrayBuffer() : image);
const headerOf = async (image: Blob | ArrayBuffer): ReturnType<typeof imageHeader> => imageHeader(image instanceof Blob ? image : new Blob([image]));

interface Bench {
  vault: InMemoryApp;
  collection: CollectionMetadata;
  /** The bytes of binary files, which the in-memory vault would keep as text. */
  binaries: Map<string, ArrayBuffer>;
}

async function bench(): Promise<Bench> {
  const vault = createInMemoryApp();
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  const { id } = await assets.createCollection('source');
  const binaries = new Map<string, ArrayBuffer>();
  (vault.app.vault as { readBinary: unknown }).readBinary = async (file: TFile): Promise<ArrayBuffer> => binaries.get(file.path) ?? new ArrayBuffer(0);
  const keep = (target: unknown, content: unknown): void => {
    if (content instanceof ArrayBuffer) binaries.set(target instanceof TFile ? target.path : String(target), content);
  };
  interceptWrites(vault.app.vault, 'modifyBinary', keep);
  interceptWrites(vault.app.vault, 'createBinary', keep);
  return { vault, collection: (await assets.getCollection(id))!, binaries };
}

/** The collection of `b` with `image` stored as its cover. */
async function withStoredCover(b: Bench, image: Blob): Promise<CollectionMetadata> {
  const coverPath = collectionCoverPath(b.collection.id);
  await b.vault.app.vault.create(coverPath, '');
  b.binaries.set(coverPath, await image.arrayBuffer());
  return { ...b.collection, coverPath };
}

afterAll(() => disposeImageProcessing());

describe('images stored under WebP names', () => {
  it.each(['image/png', 'image/jpeg'])('encodes an upload of type %s that fits when the result must be a WebP', async (type) => {
    const upload = await picture(800, 400, type);

    const { image } = await optimizeImage(upload, COVER_PRESET, { webpOnly: true });

    expect(await headerOf(image)).toEqual({ format: 'webp', width: 800, height: 400 });
  });

  it('keeps a WebP that fits byte for byte when the result must be a WebP', async () => {
    const upload = await picture(800, 400, 'image/webp');

    const { image } = await optimizeImage(upload, COVER_PRESET, { webpOnly: true });

    expect(await bytesOf(image)).toEqual(await bytesOf(upload));
  });

  it.each(['image/png', 'image/jpeg'])('keeps a token of type %s that fits byte for byte, with a WebP thumbnail', async (type) => {
    const upload = await picture(200, 200, type);

    const { image, thumbnail } = await optimizeImage(upload, IMAGE_PRESETS.token, { thumbnail: THUMBNAIL_SPEC });

    expect(await bytesOf(image)).toEqual(await bytesOf(upload));
    expect((await headerOf(thumbnail!))?.format).toBe('webp');
  });

  it.each(['image/png', 'image/jpeg'])('makes a WebP thumbnail of an image of type %s smaller than a thumbnail', async (type) => {
    const thumbnail = await renderThumbnail(await picture(128, 96, type), THUMBNAIL_SPEC);

    expect(await headerOf(thumbnail)).toEqual({ format: 'webp', width: 128, height: 96 });
  });

  it.each([
    ['a small PNG', 'image/png', 800, 400, 800],
    ['a small JPEG', 'image/jpeg', 800, 400, 800],
    ['a large PNG', 'image/png', 3200, 1600, 1600],
  ])('makes a WebP cover of %s', async (_name, type, width, height, coverWidth) => {
    const b = await bench();

    const cover = await coverFileFor(b.vault.app, b.collection, { kind: 'upload', image: await picture(width, height, type) });

    expect(cover).toMatchObject({ path: collectionCoverPath(b.collection.id), isNew: true });
    expect(await headerOf(cover!.data)).toMatchObject({ format: 'webp', width: coverWidth });
  });

  it.each(['image/png', 'image/jpeg'])('turns a stored cover of type %s into the WebP its name says', async (type) => {
    const b = await bench();
    const collection = await withStoredCover(b, await picture(800, 400, type));

    const cover = await coverFileFor(b.vault.app, collection, { kind: 'current' });
    await storeCover(b.vault.app, cover!);

    expect(cover).toMatchObject({ path: collection.coverPath, isNew: true });
    expect(await headerOf(cover!.data)).toEqual({ format: 'webp', width: 800, height: 400 });
    expect(await bytesOf(b.binaries.get(collection.coverPath!)!)).toEqual(await bytesOf(cover!.data));
  });

  it('carries a stored cover that is a WebP byte for byte', async () => {
    const b = await bench();
    const stored = await picture(800, 400, 'image/webp');
    const collection = await withStoredCover(b, stored);

    const cover = await coverFileFor(b.vault.app, collection, { kind: 'current' });

    expect(cover?.isNew).toBe(false);
    expect(await bytesOf(cover!.data)).toEqual(await bytesOf(stored));
  });

  it('carries a mislabelled cover that cannot be decoded as it is', async () => {
    const b = await bench();
    const header = (await bytesOf(await picture(8, 8, 'image/png'))).slice(0, 33);
    const collection = await withStoredCover(b, new Blob([header]));

    const cover = await coverFileFor(b.vault.app, collection, { kind: 'current' });

    expect(cover?.isNew).toBe(false);
    expect(await bytesOf(cover!.data)).toEqual(header);
  });
});
