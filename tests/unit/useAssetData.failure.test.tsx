// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { AssetThumbnailService } from '../../src/app/services/AssetThumbnailService';
import { useAssetData } from '../../src/app/packages/components/asset-manager/hooks/useAssetData';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const ui: { app: App | null } = { app: null };

vi.mock('../../src/app/react/root/AtlasUIContext', () => ({ useAtlasUI: () => ({ app: ui.app, view: null }) }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({ useOptionalAtlasStore: (_selector: unknown, fallback: unknown) => fallback }));

/** A default collection with two tagged tokens; any other collection fails to load. */
async function library(): Promise<AssetService> {
  (AssetService as unknown as { instance: AssetService | null }).instance = null;
  const { app } = createInMemoryApp({ files: { 'atlas-vtt/assets/goblin.png': 'PNG', 'atlas-vtt/assets/wolf.png': 'PNG' } });
  ui.app = app;
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  await assets.addTokenAsset({ name: 'Goblin', imagePath: 'atlas-vtt/assets/goblin.png', tags: ['Forest'], collection: 'default' });
  await assets.addTokenAsset({ name: 'Wolf', imagePath: 'atlas-vtt/assets/wolf.png', tags: [], collection: 'default' });
  await assets.createTag('default', 'tokens', 'Forest');
  vi.spyOn(AssetThumbnailService, 'getInstance').mockReturnValue(new AssetThumbnailService(app, assets, () => new Promise<ArrayBuffer>(() => {})));
  const getAssets = assets.getAssets.bind(assets);
  const getTags = assets.getCollectionTags.bind(assets);
  vi.spyOn(assets, 'getAssets').mockImplementation(async (collection) => {
    if (collection !== 'default') throw new Error('unreadable');
    return getAssets(collection);
  });
  vi.spyOn(assets, 'getCollectionTags').mockImplementation(async (collection, group) => {
    if (collection !== 'default') throw new Error('unreadable');
    return getTags(collection, group);
  });
  return assets;
}

const open = (): ReturnType<typeof renderHook<ReturnType<typeof useAssetData>, { collection: string }>> =>
  renderHook(({ collection }) => useAssetData('tokens', collection, true), { initialProps: { collection: 'default' } });

describe('useAssetData when a collection fails to load', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reports the failure and holds nothing of the collection shown before', async () => {
    await library();
    const { result, rerender } = open();
    await waitFor(() => expect(result.current.assets.map((asset) => asset.name)).toEqual(['Goblin', 'Wolf']));
    await waitFor(() => expect(result.current.availableTags.map((tag) => tag.name)).toEqual(['Forest']));
    expect(result.current.assetsFailed).toBe(false);

    rerender({ collection: 'gone' });
    await waitFor(() => expect(result.current.assetsFailed).toBe(true));

    expect(result.current.assetsLoading).toBe(false);
    expect(result.current.assets).toEqual([]);
    expect(result.current.assetCounts).toBeNull();
    await waitFor(() => expect(result.current.tagsLoading).toBe(false));
    expect(result.current.availableTags).toEqual([]);
  });

  it('loads again on retry and shows the failure only while it lasts', async () => {
    const assets = await library();
    const { result, rerender } = open();
    rerender({ collection: 'gone' });
    await waitFor(() => expect(result.current.assetsFailed).toBe(true));

    // The collection is readable again, as when its folder came back.
    vi.mocked(assets.getAssets).mockImplementation(async () => []);
    vi.mocked(assets.getCollectionTags).mockImplementation(async () => []);
    act(() => { result.current.retryLoad(); });
    expect(result.current.assetsFailed).toBe(false);
    expect(result.current.assetsLoading).toBe(true);

    await waitFor(() => expect(result.current.assetsLoading).toBe(false));
    expect(result.current.assetsFailed).toBe(false);
    expect(result.current.assetCounts).toEqual({ scenes: 0, maps: 0, encounters: 0, tokens: 0, party: 0 });
  });

  it('drops the failure once another collection loads', async () => {
    await library();
    const { result, rerender } = open();
    rerender({ collection: 'gone' });
    await waitFor(() => expect(result.current.assetsFailed).toBe(true));

    rerender({ collection: 'default' });
    expect(result.current.assetsFailed).toBe(false);
    await waitFor(() => expect(result.current.assets.map((asset) => asset.name)).toEqual(['Goblin', 'Wolf']));
    expect(result.current.assetsFailed).toBe(false);
  });
});
