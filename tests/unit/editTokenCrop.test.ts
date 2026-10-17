import { beforeEach, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { saveTokenPreviews } from '../../src/app/packages/components/asset-manager/token-creator/saveTokenPreviews';
import { cropReset, STORED_IMAGE_SCALE } from '../../src/app/packages/components/asset-manager/token-creator/cropMath';
import type { EditTokenInput, TokenPreview } from '../../src/app/packages/components/asset-manager/token-creator/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// jsdom cannot decode or encode images; the crop itself is covered by cropMath's and the image pipeline's tests
const cropTokenImage = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({
  image: { arrayBuffer: async () => new TextEncoder().encode('cropped').buffer } as Blob, thumbnail: null, preview: null,
})));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/tokenImages', () => ({ cropTokenImage, optimizeUpload: cropTokenImage }));
vi.mock('../../src/app/pixi/mapImage/prebuildMapImage', () => ({ prebuildMapImageAt: vi.fn() }));
const thumbnails = vi.hoisted(() => {
  const thumbnail = async (path: string): Promise<string> => `thumbs/${path}`;
  return { tryCreateForImage: thumbnail, tryThumbnailForImage: thumbnail, tryDiscard: vi.fn(async () => {}) };
});
vi.mock('../../src/app/services/AssetThumbnailService', () => ({ AssetThumbnailService: { getInstance: () => thumbnails } }));

beforeEach(() => {
  Reflect.set(AssetService, 'instance', null);
  cropTokenImage.mockClear();
  thumbnails.tryDiscard.mockClear();
});

async function setup(stored: string, showRing: boolean, thumbnailPath?: string) {
  const { app, files } = createInMemoryApp({ files: { [stored]: 'original art' } });
  app.workspace = { trigger: vi.fn() };
  const assetService = AssetService.getInstance(app);
  const token = await assetService.addTokenAsset({ name: 'Acolyte', imagePath: stored, tags: [], collection: 'Default', showRing, ...(thumbnailPath && { thumbnailPath }) });
  const editToken: EditTokenInput = { id: token.id, name: 'Acolyte', imageUrl: `app://vault/${stored}`, imagePath: stored, tags: [], showRing };
  const preview: TokenPreview = {
    id: token.id, name: 'Acolyte', tags: [], showRing: true, file: null, previewUrl: editToken.imageUrl,
    imageScale: STORED_IMAGE_SCALE, imagePosition: { x: 0, y: 0 }, isSelected: true, isOptimizing: false,
  };
  const save = (changes: Partial<TokenPreview> = {}): Promise<number> => saveTokenPreviews({
    app, assetService, mode: 'token', previews: [{ ...preview, ...changes }], collection: 'Default', tags: [],
    editToken, waitForOptimized: async () => undefined,
  });
  return { app, files, assetService, token, save, preview, editToken };
}

const stored = 'atlas-vtt/collections/Default/tokens/Acolyte.webp';

it('crops the stored image into its own file when the ring is turned on', async () => {
  const { app, files, assetService, token, save } = await setup(stored, false);
  expect(await save()).toBe(1);
  expect(cropTokenImage).toHaveBeenCalledWith(expect.any(File), STORED_IMAGE_SCALE, { x: 0, y: 0 }, undefined);
  expect(files.get(stored)).toBe('cropped');
  const saved = await assetService.getAssetById(token.id);
  expect(saved).toMatchObject({ imagePath: stored, showRing: true, imageSource: { ringedDefaultScale: STORED_IMAGE_SCALE } });
  expect(saved?.type === 'token' && files.get(saved.imageSource!.path)).toBe('original art');
  expect(app.vault.createBinary).toHaveBeenCalledTimes(1);
});

it('crops the stored image where the edit moved or zoomed it', async () => {
  const { files, save } = await setup(stored, true);
  expect(await save({ imageScale: 1.2, imagePosition: { x: 0.1, y: -0.05 } })).toBe(1);
  expect(cropTokenImage).toHaveBeenCalledWith(expect.any(File), 1.2, { x: 0.1, y: -0.05 }, undefined);
  expect(files.get(stored)).toBe('cropped');
});

it('saves scale and positioning changes to an existing ringless token', async () => {
  const { files, assetService, token, save } = await setup(stored, false);
  expect(await save({ showRing: false, imageScale: 2, imagePosition: { x: 0.1, y: -0.1 } })).toBe(1);
  expect(cropTokenImage).toHaveBeenCalledWith(expect.any(File), 2, { x: 0.1, y: -0.1 }, undefined, false, false);
  expect(files.get(stored)).toBe('cropped');
  expect(await assetService.getAssetById(token.id)).toMatchObject({ imagePath: stored, showRing: false });
});

it('keeps an existing ringless image untouched at its default fit, including after reset', async () => {
  const { app, files, save } = await setup(stored, false);
  expect(await save({ showRing: false, ...cropReset({ file: null, showRing: false }) })).toBe(1);
  expect(cropTokenImage).not.toHaveBeenCalled();
  expect(app.vault.modifyBinary).not.toHaveBeenCalled();
  expect(files.get(stored)).toBe('original art');
});

it('leaves the image alone when a ringed token is saved with its crop untouched', async () => {
  const { app, files, save } = await setup(stored, true);
  expect(await save({ name: 'Renamed' })).toBe(1);
  expect(cropTokenImage).not.toHaveBeenCalled();
  expect(app.vault.modifyBinary).not.toHaveBeenCalled();
  expect(files.get(stored)).toBe('original art');
});

it('renames an image of another format to .webp before writing the crop', async () => {
  const png = 'atlas-vtt/collections/Default/tokens/Acolyte.png';
  const { files, assetService, token, save } = await setup(png, false);
  expect(await save()).toBe(1);
  const webp = 'atlas-vtt/collections/Default/tokens/Acolyte.webp';
  expect(files.has(png)).toBe(false);
  expect(files.get(webp)).toBe('cropped');
  expect((await assetService.getAssetById(token.id))?.imagePath).toBe(webp);
});

it('leaves the image alone when the crop of an edited token is reset', async () => {
  const { app, files, save } = await setup(stored, true);
  expect(await save({ imageScale: 1.4, imagePosition: { x: 0.2, y: 0 }, ...cropReset({ file: null }) })).toBe(1);
  expect(cropTokenImage).not.toHaveBeenCalled();
  expect(app.vault.modifyBinary).not.toHaveBeenCalled();
  expect(files.get(stored)).toBe('original art');
});

it('removes the old thumbnail when the stored image is renamed to .webp', async () => {
  const png = 'atlas-vtt/collections/Default/tokens/Acolyte.png';
  const { assetService, token, save } = await setup(png, false, 'atlas-vtt/assets/thumbnails/Acolyte-png.webp');
  expect(await save()).toBe(1);
  expect(thumbnails.tryDiscard).toHaveBeenCalledWith('atlas-vtt/assets/thumbnails/Acolyte-png.webp');
  expect((await assetService.getAssetById(token.id))).toMatchObject({ thumbnailPath: 'thumbs/atlas-vtt/collections/Default/tokens/Acolyte.webp' });
});

it.each([true, false])('reuses the preserved pixels after saving, reopening and zooming out (ring: %s)', async (showRing) => {
  const { app, files, assetService, token, save, preview, editToken } = await setup(stored, showRing);
  expect(await save({ showRing, imageScale: 2 })).toBe(1);
  const saved = await assetService.getAssetById(token.id);
  if (saved?.type !== 'token') throw new Error('Missing token');
  const source = saved.imageSource!;
  expect(source[showRing ? 'framed' : 'unframed'].imageScale).toBe(2);
  expect(files.get(stored)).toBe('cropped');
  expect(files.get(source.path)).toBe('original art');
  const reopened = { ...preview, showRing, imageSource: source, ...source[showRing ? 'framed' : 'unframed'] };
  const options = {
    app, assetService, mode: 'token' as const, collection: 'Default', tags: [],
    editToken: { ...editToken, imageSource: source }, waitForOptimized: async () => undefined,
  };
  cropTokenImage.mockClear();
  expect(await saveTokenPreviews({ ...options, previews: [reopened] })).toBe(1);
  expect(cropTokenImage).not.toHaveBeenCalled();
  expect(await saveTokenPreviews({ ...options, previews: [{ ...reopened, imageScale: 0.6 }] })).toBe(1);
  const croppedFrom = cropTokenImage.mock.calls[0]![0] as File;
  expect(new TextDecoder().decode(await croppedFrom.arrayBuffer())).toBe('original art');
  expect(files.get(source.path)).toBe('original art');
  expect((await assetService.getAssetById(token.id))).toMatchObject({ imageSource: { path: source.path, [showRing ? 'framed' : 'unframed']: { imageScale: 0.6 } } });
  expect(app.vault.createBinary).toHaveBeenCalledTimes(1);
});

it('stops before overwriting the image when its backup cannot be written', async () => {
  const { app, files, save } = await setup(stored, false);
  vi.mocked(app.vault.createBinary).mockRejectedValueOnce(new Error('Disk full'));
  await expect(save({ showRing: false, imageScale: 2 })).rejects.toThrow('Disk full');
  expect(files.get(stored)).toBe('original art');
  expect(app.vault.modifyBinary).not.toHaveBeenCalled();
});

it('does not fall back to the rendered crop when a preserved source is missing', async () => {
  const { app, files, assetService, token, save, preview, editToken } = await setup(stored, false);
  await save({ showRing: false, imageScale: 2 });
  const saved = await assetService.getAssetById(token.id);
  if (saved?.type !== 'token') throw new Error('Missing token');
  files.delete(saved.imageSource!.path);
  cropTokenImage.mockClear();
  await expect(saveTokenPreviews({
    app, assetService, mode: 'token', collection: 'Default', tags: [],
    previews: [{ ...preview, imageSource: saved.imageSource, showRing: false, imageScale: 0.6 }],
    editToken: { ...editToken, imageSource: saved.imageSource }, waitForOptimized: async () => undefined,
  })).rejects.toThrow('no longer exists');
  expect(cropTokenImage).not.toHaveBeenCalled();
  expect(files.get(stored)).toBe('cropped');
});
