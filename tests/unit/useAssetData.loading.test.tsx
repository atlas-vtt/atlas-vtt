// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { AssetService, type Asset, type TokenAsset } from '../../src/app/services/AssetService';
import { AssetThumbnailService } from '../../src/app/services/AssetThumbnailService';
import { useAssetData } from '../../src/app/packages/components/asset-manager/hooks/useAssetData';
import type { Tab } from '../../src/app/packages/components/asset-manager/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const ui: { app: App | null } = { app: null };

vi.mock('../../src/app/react/root/AtlasUIContext', () => ({ useAtlasUI: () => ({ app: ui.app, view: null }) }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({ useOptionalAtlasStore: (_selector: unknown, fallback: unknown) => fallback }));

interface Library {
  assets: AssetService;
  thumbnails: AssetThumbnailService;
  goblin: TokenAsset;
  wolf: TokenAsset;
  /** Finishes the thumbnail being rendered. */
  finishThumbnail: () => void;
}

/** A default collection with two tokens that have no thumbnail yet, and one map. */
async function library(): Promise<Library> {
  (AssetService as unknown as { instance: AssetService | null }).instance = null;
  const { app } = createInMemoryApp({ files: { 'atlas-vtt/assets/goblin.png': 'PNG', 'atlas-vtt/assets/wolf.png': 'PNG', 'atlas-vtt/assets/keep.webp': 'WEBP' } });
  ui.app = app;
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  const goblin = await assets.addTokenAsset({ name: 'Goblin', imagePath: 'atlas-vtt/assets/goblin.png', tags: [], collection: 'default' });
  const wolf = await assets.addTokenAsset({ name: 'Wolf', imagePath: 'atlas-vtt/assets/wolf.png', tags: [], collection: 'default' });
  await assets.addAsset({ type: 'map', name: 'Keep', mapFilePath: 'atlas-vtt/assets/keep.webp', tags: [], collection: 'default' });

  const renders: Array<() => void> = [];
  const thumbnails = new AssetThumbnailService(app, assets, () => new Promise<ArrayBuffer>((resolve) => {
    renders.push(() => resolve(new TextEncoder().encode('thumb').buffer as ArrayBuffer));
  }));
  vi.spyOn(AssetThumbnailService, 'getInstance').mockReturnValue(thumbnails);
  return { assets, thumbnails, goblin, wolf, finishThumbnail: () => renders.shift()?.() };
}

const open = (tab: Tab = 'tokens'): ReturnType<typeof renderHook<ReturnType<typeof useAssetData>, { tab: Tab }>> =>
  renderHook(({ tab: activeTab }) => useAssetData(activeTab, 'default', true), { initialProps: { tab } });

describe('useAssetData while it loads', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reports the first load, then the assets and the counts of every tab', async () => {
    await library();
    const { result } = open();
    expect(result.current.assetsLoading).toBe(true);
    expect(result.current.assetCounts).toBeNull();
    expect(result.current.tagsLoading).toBe(true);

    await waitFor(() => expect(result.current.assetsLoading).toBe(false));
    expect(result.current.assets.map((asset) => asset.name)).toEqual(['Goblin', 'Wolf']);
    expect(result.current.assetCounts).toEqual({ scenes: 0, maps: 1, encounters: 0, tokens: 2, party: 0 });
    await waitFor(() => expect(result.current.tagsLoading).toBe(false));
  });

  it('reports a tab switch as loading from the first render on, and keeps the counts', async () => {
    await library();
    const { result, rerender } = open();
    await waitFor(() => expect(result.current.assetsLoading).toBe(false));

    rerender({ tab: 'maps' });
    expect(result.current.assetsLoading).toBe(true);
    expect(result.current.assetCounts).toEqual({ scenes: 0, maps: 1, encounters: 0, tokens: 2, party: 0 });

    await waitFor(() => expect(result.current.assetsLoading).toBe(false));
    expect(result.current.assets.map((asset) => asset.name)).toEqual(['Keep']);
  });

  it('shows a placeholder for art whose thumbnail is being made, never the full image', async () => {
    await library();
    const { result } = open();
    await waitFor(() => expect(result.current.assetsLoading).toBe(false));

    expect(result.current.assets.map((asset) => [asset.thumbnailUrl, asset.thumbnailPending])).toEqual([['', true], ['', true]]);
  });

  it('gives only the card whose thumbnail arrived a new asset, without loading the list again', async () => {
    const { assets, goblin, finishThumbnail } = await library();
    const { result } = open();
    await waitFor(() => expect(result.current.assetsLoading).toBe(false));
    const before = result.current.assets;
    const loads = vi.spyOn(assets, 'getAssets');

    await act(async () => { finishThumbnail(); });
    await waitFor(() => expect(result.current.assets[0]?.thumbnailPending).toBeUndefined());

    expect(result.current.assets[0]?.id).toBe(goblin.id);
    expect(result.current.assets[0]?.thumbnailUrl).toMatch(/thumbnails\/goblin-/);
    expect(result.current.assets[1]).toBe(before[1]);
    expect(loads).not.toHaveBeenCalled();
  });

  it('keeps the very same list when a reload finds nothing changed', async () => {
    await library();
    const { result } = open();
    await waitFor(() => expect(result.current.assetsLoading).toBe(false));
    const before = result.current.assets;

    await act(async () => { await result.current.loadAssetsForActiveTab(); });

    expect(result.current.assets).toBe(before);
  });

  it('ignores a load that a later one overtook', async () => {
    const { assets } = await library();
    const stored = await assets.getAssets('default');
    let finishFirst = (_assets: Asset[]): void => undefined;
    vi.spyOn(assets, 'getAssets')
      .mockImplementationOnce(() => new Promise<Asset[]>((resolve) => { finishFirst = resolve; }))
      .mockImplementation(async () => stored);
    const { result, rerender } = open('tokens');
    await waitFor(() => expect(assets.getAssets).toHaveBeenCalled());

    rerender({ tab: 'maps' });
    await waitFor(() => expect(result.current.assetsLoading).toBe(false));
    await act(async () => { finishFirst(stored); });

    expect(result.current.assets.map((asset) => asset.name)).toEqual(['Keep']);
    expect(result.current.assetsLoading).toBe(false);
  });
});
