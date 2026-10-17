import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { saveTokenPreviews } from '../../src/app/packages/components/asset-manager/token-creator/saveTokenPreviews';
import type { TokenPreview } from '../../src/app/packages/components/asset-manager/token-creator/types';
import { prebuildMapImageAt } from '../../src/app/pixi/mapImage/prebuildMapImage';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/pixi/mapImage/prebuildMapImage', () => ({ prebuildMapImageAt: vi.fn() }));

const note = 'Bestiary/Goblin.md';
const image = 'Artwork/goblin.webp';
const converted = { image: { arrayBuffer: async () => new Uint8Array([1, 2]).buffer } as Blob, thumbnail: null, preview: null, sourcePreview: null };
beforeEach(() => {
  Reflect.set(AssetService, 'instance', null);
  vi.mocked(prebuildMapImageAt).mockClear();
});
afterEach(() => Reflect.deleteProperty(window, 'FantasyStatblocks'));
function setup() {
  const { app, files } = createInMemoryApp({ files: { [note]: 'original note', [image]: 'original art' } });
  app.workspace = { trigger: vi.fn() };
  app.vault.cachedRead = app.vault.read;
  app.vault.createBinary = vi.fn(async (path: string, bytes: ArrayBuffer) => { files.set(path, new TextDecoder().decode(bytes)); return new TFile(path); });
  app.metadataCache.getFileCache = () => ({ frontmatter: { statblock: true, name: 'Goblin', image } });
  app.metadataCache.getFirstLinkpathDest = (path: string) => files.has(path) ? new TFile(path) : null;
  Object.assign(window, { FantasyStatblocks: { isResolved: () => true, getBestiaryCreatures: () => [] } });
  const assetService = AssetService.getInstance(app);
  const preview: TokenPreview = { id: 'goblin', name: 'Custom Goblin', statblockPath: note, tags: ['Enemy'], showRing: false, size: 2, file: new File(['art'], 'goblin.webp'), previewUrl: 'blob:art', imageScale: 1, imagePosition: { x: 0, y: 0 }, isSelected: false, isOptimizing: false };
  const options = { app, assetService, mode: 'token' as const, previews: [preview], collection: 'Default', tags: [], waitForOptimized: async () => converted, onSaved: vi.fn() };
  return { app, files, assetService, preview, options };
}

it('saves queued statblock identity, subset tags and ring choice with an owned image', async () => {
  const { files, assetService, options } = setup();
  expect(await saveTokenPreviews(options)).toBe(1);
  const [token] = await assetService.getTokenAssets();
  expect(token).toMatchObject({ name: 'Custom Goblin', statblockPath: note, tags: ['Enemy'], showRing: false, size: 2 });
  expect(token!.imagePath).not.toBe(image);
  expect(token!.imageSource).toMatchObject({ ringedDefaultScale: 1, unframed: { imageScale: 1 } });
  expect(files.get(token!.imageSource!.path)).toBe('art');
  expect(token!.imageSource!.path).not.toBe(token!.imagePath);
  expect(files.get(image)).toBe('original art');
  expect(files.get(note)).toBe('original note');
  expect(options.onSaved).toHaveBeenCalledWith(['goblin']);
  expect(await saveTokenPreviews(options)).toBe(0);
  expect(await assetService.getTokenAssets()).toHaveLength(1);
});

it('retains failed previews for retry and removes only successfully saved previews', async () => {
  const { app, files, assetService, options, preview } = setup();
  options.previews.push({ ...preview, id: 'wolf', statblockPath: undefined, name: 'Wolf', tags: [] });
  const write = app.vault.createBinary.getMockImplementation()!;
  app.vault.createBinary.mockImplementation(async (path: string, bytes: ArrayBuffer) => {
    if (path.includes('Custom_Goblin')) throw new Error('Disk full');
    return write(path, bytes);
  });
  expect(await saveTokenPreviews(options)).toBe(1);
  expect(options.onSaved.mock.calls).toEqual([[['wolf']]]);
  expect((await assetService.getTokenAssets()).map(t => t.name)).toEqual(['Wolf']);
  expect([...app.vault.createBinary.mock.calls].filter(([path]) => files.has(path) && path.includes('/token-sources/'))).toHaveLength(1);
});

it('builds the tiles of a saved map ahead, and of no token', async () => {
  const { app, assetService, options, preview } = setup();
  expect(await saveTokenPreviews(options)).toBe(1);
  expect(prebuildMapImageAt).not.toHaveBeenCalled();
  const map = { ...preview, id: 'crypt', name: 'Crypt', statblockPath: undefined, tags: [] };
  expect(await saveTokenPreviews({ ...options, mode: 'map', previews: [map] })).toBe(1);
  const [saved] = await assetService.getAssets(undefined, 'map');
  expect(saved!.mapFilePath).toMatch(/^atlas-vtt\/assets\/Crypt_.+\.webp$/);
  expect(prebuildMapImageAt).toHaveBeenCalledExactlyOnceWith(app, saved!.mapFilePath);
});
