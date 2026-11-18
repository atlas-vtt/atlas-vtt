import { beforeEach, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { saveTokenPreviews } from '../../src/app/packages/components/asset-manager/token-creator/saveTokenPreviews';
import { cropReset, STORED_IMAGE_SCALE } from '../../src/app/packages/components/asset-manager/token-creator/cropMath';
import type { EditTokenInput, TokenPreview } from '../../src/app/packages/components/asset-manager/token-creator/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// jsdom cannot decode or encode images; the crop itself is covered by cropMath's and the image pipeline's tests
const cropTokenImage = vi.hoisted(() => vi.fn(async () => ({
  image: { arrayBuffer: async () => new TextEncoder().encode('cropped').buffer } as Blob, thumbnail: null, preview: null,
})));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/tokenImages', () => ({ cropTokenImage }));
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
  return { app, files, assetService, token, save };
}

const stored = 'atlas-vtt/collections/Default/tokens/Acolyte.webp';

it('crops the stored image into its own file when the ring is turned on', async () => {
  const { app, files, assetService, token, save } = await setup(stored, false);
  expect(await save()).toBe(1);
  expect(cropTokenImage).toHaveBeenCalledWith(expect.any(File), STORED_IMAGE_SCALE, { x: 0, y: 0 }, undefined);
  expect(files.get(stored)).toBe('cropped');
  expect(app.vault.createBinary).not.toHaveBeenCalled();
  expect(await assetService.getAssetById(token.id)).toMatchObject({ imagePath: stored, showRing: true });
});

it('crops the stored image where the edit moved or zoomed it', async () => {
  const { files, save } = await setup(stored, true);
  expect(await save({ imageScale: 1.2, imagePosition: { x: 0.1, y: -0.05 } })).toBe(1);
  expect(cropTokenImage).toHaveBeenCalledWith(expect.any(File), 1.2, { x: 0.1, y: -0.05 }, undefined);
  expect(files.get(stored)).toBe('cropped');
});

it.each([
  { imageScale: 2, imagePosition: { x: 0.1, y: -0.1 } },
  { imageScale: 0.5, imagePosition: { x: 0, y: 0 } },
  { imageScale: 1, imagePosition: { x: 0.1, y: -0.1 } },
])('saves ringless zoom and position changes into the existing image: %o', async ({ imageScale, imagePosition }) => {
  const { app, files, assetService, token, save } = await setup(stored, false);
  expect(await save({ showRing: false, imageScale, imagePosition })).toBe(1);
  expect(cropTokenImage).toHaveBeenCalledWith(expect.any(File), imageScale, imagePosition, undefined, false, false);
  expect(files.get(stored)).toBe('cropped');
  expect(app.vault.createBinary).not.toHaveBeenCalled();
  expect(await assetService.getAssetById(token.id)).toMatchObject({ imagePath: stored, showRing: false });
});

it('keeps an existing ringless image untouched at its default fit, including after reset', async () => {
  const { app, files, save } = await setup(stored, false);
  expect(await save({ showRing: false, ...cropReset({ file: null, showRing: false }) })).toBe(1);
  expect(cropTokenImage).not.toHaveBeenCalled();
  expect(app.vault.modifyBinary).not.toHaveBeenCalled();
  expect(app.vault.createBinary).not.toHaveBeenCalled();
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
