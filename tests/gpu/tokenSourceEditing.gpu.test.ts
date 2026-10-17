import { afterAll, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { disposeImageProcessing } from '../../src/app/imageProcessing/imageProcessing';
import { AssetService, type TokenAsset } from '../../src/app/services/AssetService';
import { saveTokenPreviews } from '../../src/app/packages/components/asset-manager/token-creator/saveTokenPreviews';
import { previewFromEdit } from '../../src/app/packages/components/asset-manager/token-creator/tokenFraming';
import type { TokenPreview } from '../../src/app/packages/components/asset-manager/token-creator/types';
import { createInMemoryApp, interceptWrites } from '../mocks/inMemoryVault';

// The desktop host supplies Node's emitter; map prebuilding is unrelated to token edits.
vi.mock('events', async () => import('eventemitter3'));
vi.mock('../../src/app/pixi/mapImage/prebuildMapImage', () => ({ prebuildMapImageAt: vi.fn() }));

/** Red detail inside the default crop but outside a 2× crop; blue detail in the centre. */
async function originalArt(): Promise<File> {
  const canvas = new OffscreenCanvas(800, 600);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ff0000';
  context.fillRect(120, 270, 40, 60);
  context.fillStyle = '#0000ff';
  context.fillRect(360, 270, 80, 60);
  return new File([await canvas.convertToBlob({ type: 'image/png' })], 'original.png', { type: 'image/png' });
}

async function redPixels(data: ArrayBuffer): Promise<number> {
  const bitmap = await createImageBitmap(new Blob([data]));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index]! > 200 && pixels[index + 1]! < 50 && pixels[index + 2]! < 50 && pixels[index + 3]! > 200) count++;
  }
  return count;
}

afterAll(disposeImageProcessing);

it.each([false, true])('restores cropped-out detail after saving, reopening and zooming out (ring: %s)', async (showRing) => {
  const { app } = createInMemoryApp();
  // Keep binary bytes separately: the generic mock vault stores text.
  const binaries = new Map<string, ArrayBuffer>();
  (app.vault as { readBinary: unknown }).readBinary = async (file: TFile): Promise<ArrayBuffer> => binaries.get(file.path)!;
  const keep = (target: unknown, content: unknown): void => {
    if (content instanceof ArrayBuffer) binaries.set(target instanceof TFile ? target.path : String(target), content);
  };
  interceptWrites(app.vault, 'createBinary', keep);
  interceptWrites(app.vault, 'modifyBinary', keep);
  AssetService.resetInstance();
  let assets = AssetService.getInstance(app);
  const file = await originalArt();
  const preview: TokenPreview = {
    id: 'token', name: 'Token', file, previewUrl: '', showRing,
    imageScale: 2, imagePosition: { x: 0, y: 0 }, isSelected: true, isOptimizing: false,
  };
  const options = { app, mode: 'token' as const, collection: 'Default', tags: [], waitForOptimized: async () => undefined };
  expect(await saveTokenPreviews({ ...options, assetService: assets, previews: [preview] })).toBe(1);
  let [token] = await assets.getTokenAssets();
  expect(await redPixels(binaries.get(token!.imagePath)!)).toBe(0);
  const sourcePath = token!.imageSource!.path;
  expect(binaries.get(sourcePath)).toEqual(await file.arrayBuffer());

  // Reopen from the persistent record rather than the creator's in-memory state.
  AssetService.resetInstance();
  assets = AssetService.getInstance(app);
  token = await assets.getAssetById(token!.id) as TokenAsset;
  const editToken = { ...token!, imageUrl: 'rendered', sourceImageUrl: 'original' };
  const reopened = previewFromEdit(editToken);
  expect(reopened).toMatchObject({ previewUrl: 'original', imageScale: 2 });
  expect(await saveTokenPreviews({
    ...options, assetService: assets, editToken, previews: [{ ...reopened, imageScale: 1 }],
  })).toBe(1);
  token = await assets.getAssetById(token!.id) as TokenAsset;
  expect(await redPixels(binaries.get(token.imagePath)!)).toBeGreaterThan(200);
  expect(binaries.get(sourcePath)).toEqual(await file.arrayBuffer());
  expect(token.imageSource!.path).toBe(sourcePath);
  expect(token.imageSource![showRing ? 'framed' : 'unframed'].imageScale).toBe(1);
});
