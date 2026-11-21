// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetService, type MapAsset, type TokenAsset } from '../../src/app/services/AssetService';
import { THUMBNAIL_DIR, THUMBNAIL_SIZE, AssetThumbnailService, type ThumbnailUpdate } from '../../src/app/services/AssetThumbnailService';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { hashStrings } from '../helpers/hashCorpus';
import { pathDigest as frozenPathDigest, thumbnailPathFor as frozenThumbnailPathFor } from '../oracles/helperBaseline/thumbnailDigest';

const GOBLIN_IMAGE = 'atlas-vtt/assets/goblin.png';
const ascii = (value: string): number[] => [...value].map((c) => c.charCodeAt(0));
const PNG_BYTES = new Uint8Array([0x89, ...ascii('PNG\r\n\x1a\n'), 0, 0, 0, 13, ...ascii('IHDR'), 0, 0, 1, 0, 0, 0, 1, 0, 8, 6, 0, 0, 0]);
const WEBP_BYTES = new Uint8Array([...ascii('RIFF'), 100, 0, 0, 0, ...ascii('WEBP'), ...ascii('VP8 '), 10, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, 0, 1, 0, 1, 0]);

async function setup(): Promise<{ app: any; files: Map<string, string>; assets: AssetService; goblin: TokenAsset; render: ReturnType<typeof vi.fn> }> {
  (AssetService as any).instance = null;
  const { app, files } = createInMemoryApp({ files: { [GOBLIN_IMAGE]: 'PNGDATA' } });
  const assets = AssetService.getInstance(app as any);
  await assets.initialize();
  const goblin = await assets.addTokenAsset({ name: 'Goblin', imagePath: GOBLIN_IMAGE, tags: [], collection: 'default' });
  const render = vi.fn(async (_source: Blob, size: number) => new TextEncoder().encode(`thumb:${size}`).buffer as ArrayBuffer);
  return { app, files, assets, goblin, render };
}

function nextUpdates(service: AssetThumbnailService): Promise<ThumbnailUpdate[]> {
  return new Promise((resolve) => {
    const unsubscribe = service.onUpdated((updates) => { unsubscribe(); resolve(updates); });
  });
}

describe('AssetThumbnailService', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders, writes and records a thumbnail for a token that has none', async () => {
    const { app, files, assets, goblin, render } = await setup();
    const service = new AssetThumbnailService(app, assets, render);
    const updates = nextUpdates(service);

    service.ensureThumbnails([goblin]);

    const [update] = await updates;
    expect(update?.id).toBe(goblin.id);
    expect(update?.thumbnailPath?.startsWith(`${THUMBNAIL_DIR}/goblin-`)).toBe(true);
    expect(files.get(update?.thumbnailPath ?? '')).toBe(`thumb:${THUMBNAIL_SIZE}`);
    const stored = await assets.getAssetById(goblin.id);
    expect(stored?.type === 'token' && stored.thumbnailPath).toBe(update?.thumbnailPath);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('skips tokens whose thumbnail already exists', async () => {
    const { app, assets, goblin, render } = await setup();
    const service = new AssetThumbnailService(app, assets, render);
    const updates = nextUpdates(service);
    service.ensureThumbnails([goblin]);
    await updates;

    const stored = await assets.getAssetById(goblin.id);
    service.ensureThumbnails([stored as TokenAsset]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('records the tokens that succeeded when another image cannot be read', async () => {
    const { app, assets, goblin, render } = await setup();
    const missing = await assets.addTokenAsset({ name: 'Ghost', imagePath: 'atlas-vtt/assets/missing.png', tags: [], collection: 'default' });
    const service = new AssetThumbnailService(app, assets, render);
    const updates = nextUpdates(service);

    service.ensureThumbnails([missing, goblin]);

    // The image that could not be read is announced without a thumbnail, so its card stops waiting.
    const announced = await updates;
    expect(announced.find((update) => update.id === missing.id)?.thumbnailPath).toBeNull();
    expect(announced.find((update) => update.id === goblin.id)?.thumbnailPath).toMatch(/goblin-/);
    const stored = await assets.getAssetById(missing.id);
    expect(stored?.type === 'token' && stored.thumbnailPath).toBeUndefined();
    expect(service.stateOf(missing)).toEqual({ pending: false });
  });

  it('reports a thumbnail as pending while it is made and hands it out before it is recorded', async () => {
    const { app, assets, goblin } = await setup();
    let finish = (): void => undefined;
    const render = vi.fn(() => new Promise<ArrayBuffer>((resolve) => {
      finish = (): void => resolve(new TextEncoder().encode('thumb').buffer as ArrayBuffer);
    }));
    const service = new AssetThumbnailService(app, assets, render);
    expect(service.stateOf(goblin)).toEqual({ pending: false });

    service.ensureThumbnails([goblin]);
    expect(service.stateOf(goblin)).toEqual({ pending: true });

    const updates = nextUpdates(service);
    await vi.waitFor(() => expect(render).toHaveBeenCalled());
    finish();
    const [update] = await updates;

    // `goblin` is the record as it was before the thumbnail: the service knows the file it wrote.
    expect(service.stateOf(goblin)).toEqual({ path: update?.thumbnailPath, pending: false });
  });

  it('tells its listeners of finished thumbnails while others are still being made, and saves the index once', async () => {
    const { app, files, assets, goblin } = await setup();
    files.set('atlas-vtt/assets/wolf.png', 'PNGDATA');
    files.set('atlas-vtt/assets/bat.png', 'PNGDATA');
    const wolf = await assets.addTokenAsset({ name: 'Wolf', imagePath: 'atlas-vtt/assets/wolf.png', tags: [], collection: 'default' });
    const bat = await assets.addTokenAsset({ name: 'Bat', imagePath: 'atlas-vtt/assets/bat.png', tags: [], collection: 'default' });
    const pending: Array<() => void> = [];
    const render = vi.fn(() => new Promise<ArrayBuffer>((resolve) => {
      pending.push(() => resolve(new TextEncoder().encode('thumb').buffer as ArrayBuffer));
    }));
    const service = new AssetThumbnailService(app, assets, render);
    const batches: string[][] = [];
    service.onUpdated((updates) => batches.push(updates.map((update) => update.id)));
    const save = vi.spyOn(assets, 'rewriteAssets');

    service.ensureThumbnails([goblin, wolf, bat]);
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[0]?.();
    await vi.waitFor(() => expect(batches).toEqual([[goblin.id]]));
    expect(save).not.toHaveBeenCalled();

    pending[1]?.();
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    pending[2]?.();
    await vi.waitFor(() => expect(batches.flat().sort()).toEqual([goblin.id, wolf.id, bat.id].sort()));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('makes the thumbnails of the assets on screen first', async () => {
    const { app, files, assets, goblin } = await setup();
    const names = ['wolf', 'bat', 'rat', 'owl'];
    const others = [];
    for (const name of names) {
      files.set(`atlas-vtt/assets/${name}.png`, 'PNGDATA');
      others.push(await assets.addTokenAsset({ name, imagePath: `atlas-vtt/assets/${name}.png`, tags: [], collection: 'default' }));
    }
    const render = vi.fn(async () => new TextEncoder().encode('thumb').buffer as ArrayBuffer);
    const service = new AssetThumbnailService(app, assets, render);
    const done = new Promise<void>((resolve) => {
      let seen = 0;
      service.onUpdated((updates) => { seen += updates.length; if (seen === 5) resolve(); });
    });
    const read = vi.spyOn(app.vault, 'readBinary');

    service.ensureThumbnails([goblin, ...others]);
    // Two are already being made; the owl waits at the end of the queue.
    service.prioritize([others[3]!.id]);
    await done;

    expect(read.mock.calls.map(([file]) => (file as { path: string }).path)).toEqual([
      GOBLIN_IMAGE, 'atlas-vtt/assets/wolf.png', 'atlas-vtt/assets/owl.png', 'atlas-vtt/assets/bat.png', 'atlas-vtt/assets/rat.png',
    ]);
  });

  it('records a thumbnail on map assets so map cards never decode the full map', async () => {
    const { app, files, assets, render } = await setup();
    files.set('atlas-vtt/assets/tavern.webp', 'WEBPDATA');
    const map = await assets.addAsset({ type: 'map', name: 'Tavern', mapFilePath: 'atlas-vtt/assets/tavern.webp', tags: [], collection: 'default' }) as MapAsset;
    const service = new AssetThumbnailService(app, assets, render);
    const updates = nextUpdates(service);

    service.ensureThumbnails([map]);

    const [update] = await updates;
    expect(update?.id).toBe(map.id);
    const stored = await assets.getAssetById(map.id);
    expect(stored?.type === 'map' && stored.thumbnailPath).toBe(update?.thumbnailPath);
  });

  it('names a thumbnail by its bytes: a PNG from a device that cannot encode WebP is a .png', async () => {
    const { app, assets, goblin } = await setup();
    const service = new AssetThumbnailService(app, assets, async () => PNG_BYTES.slice().buffer);
    const updates = nextUpdates(service);

    service.ensureThumbnails([goblin]);

    const [update] = await updates;
    expect(update?.thumbnailPath).toBe(service.thumbnailPathFor(GOBLIN_IMAGE, 'png'));
    expect(update?.thumbnailPath?.endsWith('.png')).toBe(true);
    const stored = await assets.getAssetById(goblin.id);
    expect(stored?.type === 'token' && stored.thumbnailPath).toBe(update?.thumbnailPath);
    expect(service.stateOf(stored as TokenAsset)).toEqual({ path: update?.thumbnailPath, pending: false });
  });

  it('stores a thumbnail that came with its image under the name of its bytes', async () => {
    const { app, assets, render } = await setup();
    const service = new AssetThumbnailService(app, assets, render);
    expect(await service.tryThumbnailForImage(GOBLIN_IMAGE, new Blob([PNG_BYTES]))).toBe(service.thumbnailPathFor(GOBLIN_IMAGE, 'png'));
    expect(await service.tryThumbnailForImage(GOBLIN_IMAGE, new Blob([WEBP_BYTES]))).toBe(service.thumbnailPathFor(GOBLIN_IMAGE));
    expect(render).not.toHaveBeenCalled();
  });

  it.each([['webp', 'png'], ['png', 'webp']] as const)('shows the thumbnail another device made as .%s while the recorded .%s has not arrived, and makes none', async (present, recorded) => {
    const { app, assets, goblin, render } = await setup();
    const service = new AssetThumbnailService(app, assets, render);
    const arrived = service.thumbnailPathFor(GOBLIN_IMAGE, present);
    await app.vault.adapter.write(arrived, 'THUMB');
    const token: TokenAsset = { ...goblin, thumbnailPath: service.thumbnailPathFor(GOBLIN_IMAGE, recorded) };

    expect(service.hasThumbnail(token)).toBe(true);
    expect(service.stateOf(token)).toEqual({ path: arrived, pending: false });
    service.ensureThumbnails([token]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(render).not.toHaveBeenCalled();
  });

  it('returns undefined instead of throwing when a thumbnail cannot be created', async () => {
    const { app, assets, render } = await setup();
    const service = new AssetThumbnailService(app, assets, render);
    await expect(service.tryCreateForImage('atlas-vtt/assets/missing.png')).resolves.toBeUndefined();
  });

  it('gives same-named images in different folders different thumbnails', async () => {
    const { app, assets, render } = await setup();
    const service = new AssetThumbnailService(app, assets, render);
    const a = service.thumbnailPathFor('atlas-vtt/collections/default/tokens/orc.png');
    const b = service.thumbnailPathFor('atlas-vtt/collections/default/tokens/caves/orc.png');
    expect(a).not.toBe(b);
    expect(a.startsWith(`${THUMBNAIL_DIR}/orc-`)).toBe(true);
  });

  it('keeps the names thumbnails were written under', async () => {
    const { app, assets } = await setup();
    const service = new AssetThumbnailService(app, assets);
    expect(service.thumbnailPathFor('atlas-vtt/collections/default/tokens/orc.png')).toBe('atlas-vtt/assets/thumbnails/orc-d7b604c2.webp');
    expect(service.thumbnailPathFor('atlas-vtt/collections/default/tokens/caves/orc.png')).toBe('atlas-vtt/assets/thumbnails/orc-5aa08603.webp');
    expect(service.thumbnailPathFor('atlas-vtt/collections/default/tokens/troll.png')).toBe('atlas-vtt/assets/thumbnails/troll-01403577.webp');
  });

  it('names every thumbnail as before', async () => {
    const { app, assets } = await setup();
    const service = new AssetThumbnailService(app, assets);
    const paths = hashStrings();
    expect(paths.filter((path) => frozenPathDigest(path).startsWith('0')).length).toBeGreaterThanOrEqual(20);
    expect(paths.find((path) => service.thumbnailPathFor(path) !== frozenThumbnailPathFor(path))).toBeUndefined();
  });
});
