import { beforeEach, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { AssetRegistrationUncertainError } from '../../src/app/services/assetRegistrationRecovery';
import { THUMBNAIL_DIR } from '../../src/app/services/AssetThumbnailService';
import { saveTokenPreviews } from '../../src/app/packages/components/asset-manager/token-creator/saveTokenPreviews';
import type { TokenPreview } from '../../src/app/packages/components/asset-manager/token-creator/types';
import type { ProcessedImage } from '../../src/app/imageProcessing/imageProcessing';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const crop = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/packages/components/asset-manager/token-creator/tokenImages', () => ({ cropTokenImage: crop, optimizeUpload: vi.fn() }));

const bytes = (text: string): Blob => ({ arrayBuffer: async () => new TextEncoder().encode(text).buffer } as Blob);
const converted = (name: string): ProcessedImage => ({ image: bytes(`${name} image`), thumbnail: bytes(`${name} thumbnail`), preview: null, sourcePreview: null });
const preview = (id: string, patch: Partial<TokenPreview> = {}): TokenPreview => ({
  id, name: id, file: new File(['art'], `${id}.png`), previewUrl: 'blob:art', imageScale: 1, imagePosition: { x: 0, y: 0 }, isSelected: true, isOptimizing: false, ...patch,
});

function setup() {
  Reflect.set(AssetService, 'instance', null);
  const { app, files } = createInMemoryApp();
  app.workspace = { trigger: vi.fn() };
  const writes: string[] = [];
  app.vault.createBinary = vi.fn(async (path: string, data: ArrayBuffer) => {
    writes.push(path);
    files.set(path, new TextDecoder().decode(data));
  });
  return { app, files, writes, assets: AssetService.getInstance(app) };
}

beforeEach(() => { crop.mockReset(); });

it('converts every framed token at once and registers them in order with their thumbnails', async () => {
  const { app, files, assets } = setup();
  const pending = new Map<string, (image: ProcessedImage) => void>();
  crop.mockImplementation((file: File) => new Promise<ProcessedImage>(resolve => pending.set(file.name, resolve)));

  const saving = saveTokenPreviews({ app, assetService: assets, mode: 'token', previews: [preview('goblin'), preview('wolf')], collection: 'Default', tags: [], waitForOptimized: vi.fn() });
  await vi.waitFor(() => expect(crop).toHaveBeenCalledTimes(2));
  pending.get('wolf.png')!(converted('wolf'));
  pending.get('goblin.png')!(converted('goblin'));

  expect(await saving).toBe(2);
  const tokens = await assets.getTokenAssets();
  expect(tokens.map(t => t.name)).toEqual(['goblin', 'wolf']);
  for (const token of tokens) {
    expect(files.get(token.imagePath)).toBe(`${token.name} image`);
    expect(token.thumbnailPath?.startsWith(`${THUMBNAIL_DIR}/`)).toBe(true);
    expect(files.get(token.thumbnailPath!)).toBe(`${token.name} thumbnail`);
  }
});

it('records the thumbnail rendered with a map instead of decoding the map again', async () => {
  const { app, files, assets } = setup();
  await saveTokenPreviews({ app, assetService: assets, mode: 'map', previews: [preview('cave')], collection: 'Default', tags: [], waitForOptimized: async () => converted('cave') });
  const [map] = await assets.getAssets(undefined, 'map');
  expect(map?.thumbnailPath && files.get(map.thumbnailPath)).toBe('cave thumbnail');
  expect(crop).not.toHaveBeenCalled();
});

it('stops converting the remaining previews when saving is cancelled', async () => {
  const { app, assets } = setup();
  const controller = new AbortController();
  const signals: AbortSignal[] = [];
  crop.mockImplementation((_file: File, _scale: number, _position: unknown, signal: AbortSignal) => {
    signals.push(signal);
    return new Promise<ProcessedImage>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  });
  const saving = saveTokenPreviews({ app, assetService: assets, mode: 'token', previews: [preview('goblin'), preview('wolf')], collection: 'Default', tags: [], signal: controller.signal, waitForOptimized: vi.fn() });
  await vi.waitFor(() => expect(signals).toHaveLength(2));
  controller.abort();
  expect(signals.every(signal => signal.aborted)).toBe(true);
  expect(await saving).toBe(0);
  expect(await assets.getTokenAssets()).toHaveLength(0);
});

it('reports progress once per preview, counting failures too', async () => {
  const { app, assets } = setup();
  crop.mockImplementation(async (file: File) => {
    if (file.name === 'wolf.png') throw new Error('Could not decode');
    return converted(file.name);
  });
  const progress: Array<[number, number]> = [];
  const saved = await saveTokenPreviews({
    app, assetService: assets, mode: 'token', previews: [preview('goblin'), preview('wolf'), preview('bat')], collection: 'Default', tags: [],
    waitForOptimized: vi.fn(), onProgress: (done, total) => progress.push([done, total]),
  });
  expect(saved).toBe(2);
  expect(progress).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]]);
});

it('registers a large import with one index write per hundred previews', async () => {
  const { app, assets } = setup();
  const addAssets = vi.spyOn(assets, 'addAssets');
  const saved: string[][] = [];
  const previews = Array.from({ length: 250 }, (_, index) => preview(`token-${index}`));
  expect(await saveTokenPreviews({
    app, assetService: assets, mode: 'token', previews, collection: 'Default', tags: [],
    waitForOptimized: async (id) => converted(id), onSaved: (ids) => saved.push(ids),
  })).toBe(250);
  expect(addAssets.mock.calls.map(([batch]) => batch.length)).toEqual([100, 100, 50]);
  expect(saved.flat()).toEqual(previews.map(p => p.id));
  expect(await assets.getTokenAssets()).toHaveLength(250);
});

it('saves the default crop converted in the background, and crops again once the crop was edited', async () => {
  const { app, assets } = setup();
  crop.mockImplementation(async (file: File) => converted(`${file.name} recropped`));
  const waitForOptimized = vi.fn(async (id: string, kind: string) => kind === 'default-crop' ? converted(`${id} background`) : undefined);
  const previews = [preview('goblin'), preview('wolf', { imageScale: 1.5 })];
  await saveTokenPreviews({ app, assetService: assets, mode: 'token', previews, collection: 'Default', tags: [], waitForOptimized });
  expect(waitForOptimized).toHaveBeenCalledWith('goblin', 'default-crop');
  expect(crop.mock.calls.map(([file]: [File]) => file.name)).toEqual(['wolf.png']);
});

it('saves a whole ringless upload at default fit and renders edited scales and positions', async () => {
  const { app, files, assets } = setup();
  crop.mockImplementation(async (file: File) => converted(`${file.name} scaled`));
  const waitForOptimized = vi.fn(async (id: string, kind: string) => kind === 'whole' ? converted(`${id} whole`) : undefined);
  const previews = [
    preview('goblin', { showRing: false }),
    preview('wolf', { showRing: false, imageScale: 2 }),
    preview('bat', { showRing: false, imageScale: 0.5, imagePosition: { x: 0.1, y: -0.1 } }),
  ];
  expect(await saveTokenPreviews({ app, assetService: assets, mode: 'token', previews, collection: 'Default', tags: [], waitForOptimized })).toBe(3);
  expect(waitForOptimized).toHaveBeenCalledExactlyOnceWith('goblin', 'whole');
  expect(crop.mock.calls).toEqual([
    [previews[1]!.file, 2, { x: 0, y: 0 }, expect.any(AbortSignal), false, false],
    [previews[2]!.file, 0.5, { x: 0.1, y: -0.1 }, expect.any(AbortSignal), false, false],
  ]);
  const tokens = await assets.getTokenAssets();
  expect(tokens.every(token => token.showRing === false)).toBe(true);
  expect(files.get(tokens.find(token => token.name === 'wolf')!.imagePath)).toBe('wolf.png scaled image');
});

it('trashes the files of a batch the index refuses, and keeps them when the write may have landed', async () => {
  const { app, files, assets } = setup();
  const options = { app, assetService: assets, mode: 'token' as const, previews: [preview('goblin')], collection: 'Default', tags: [], waitForOptimized: async () => converted('goblin') };
  vi.spyOn(assets, 'addAssets').mockRejectedValueOnce(new Error('Disk full'));
  expect(await saveTokenPreviews(options)).toBe(0);
  expect([...files.keys()].filter(path => path.endsWith('.webp'))).toEqual([]);

  vi.spyOn(assets, 'addAssets').mockRejectedValueOnce(new AssetRegistrationUncertainError());
  await expect(saveTokenPreviews(options)).rejects.toBeInstanceOf(AssetRegistrationUncertainError);
  expect([...files.keys()].filter(path => path.endsWith('.webp'))).toHaveLength(2);
});
