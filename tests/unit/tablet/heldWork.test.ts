// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService } from '../../../src/app/services/AssetService';
import { AssetThumbnailService } from '../../../src/app/services/AssetThumbnailService';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { coreHarness, fakePng, nextTask, useReadableBlobs } from '../mosaicCanvas/fakeTesseraGraphics';

const identity = { path: 'maps/keep.png', size: 1234, mtime: 99 };

async function tasks(count: number): Promise<void> {
  for (let i = 0; i < count; i++) await nextTask();
}

describe('tessera builds while the window is out of sight', () => {
  useReadableBlobs();

  it('stop before their next tessera, keep what is written, and finish the pyramid once let go', async () => {
    const h = coreHarness();
    const outcome = await h.core.open(identity, fakePng(3000, 2000));
    if (outcome.kind !== 'opened') throw new Error('The map did not open');
    const { hash } = outcome.opened;

    h.core.holdBuilds(true);
    await tasks(20);
    const encodedWhileHeld = h.graphics.encodes.length;
    await tasks(20);

    expect(h.graphics.encodes.length).toBe(encodedWhileHeld);
    expect(h.events.some((event) => event.type === 'complete')).toBe(false);
    expect(h.events.some((event) => event.type === 'build-failed')).toBe(false);

    h.core.holdBuilds(false);
    await h.completed(hash);

    expect((await h.store.readManifest(hash))?.complete).toBe(true);
  });

  it('are let go when the core is closed, so nothing waits for good', async () => {
    const h = coreHarness();
    await h.core.open(identity, fakePng(3000, 2000));
    h.core.holdBuilds(true);
    await tasks(5);

    await expect(h.core.dispose()).resolves.toBeUndefined();
  });
});

describe('queued thumbnails while the window is out of sight', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('are not begun while held and are made once let go', async () => {
    Reflect.set(AssetService, 'instance', null);
    const { app } = createInMemoryApp({ files: { 'atlas-vtt/assets/goblin.png': 'PNGDATA' } });
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    const goblin = await assets.addTokenAsset({ name: 'Goblin', imagePath: 'atlas-vtt/assets/goblin.png', tags: [], collection: 'default' });
    const render = vi.fn(async (_source: Blob, size: number) => new TextEncoder().encode(`thumb:${size}`).buffer);
    const service = new AssetThumbnailService(app, assets, render);

    service.hold(true);
    service.ensureThumbnails([goblin]);
    await tasks(3);

    expect(render).not.toHaveBeenCalled();
    expect(service.stateOf(goblin)).toEqual({ pending: true });

    const made = new Promise<void>((resolve) => { service.onUpdated(() => resolve()); });
    service.hold(false);
    await made;

    expect(render).toHaveBeenCalledOnce();
  });
});
