// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { useAssetData } from '../../src/app/packages/components/asset-manager/hooks/useAssetData';
import type { Tab } from '../../src/app/packages/components/asset-manager/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const ui: { app: App | null } = { app: null };

vi.mock('../../src/app/react/root/AtlasUIContext', () => ({ useAtlasUI: () => ({ app: ui.app, view: null }) }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({ useOptionalAtlasStore: (_selector: unknown, fallback: unknown) => fallback }));

const TOKENS = 'atlas-vtt/collections/default/tokens';

/** A collection with a ranger and a bard in the Heroes folder, a wolf in Beasts and a hag at the top; the ranger and the bard joined the party. */
async function library(): Promise<AssetService> {
  AssetService.resetInstance();
  const art = ['Heroes/ranger.png', 'Heroes/bard.png', 'Beasts/wolf.png', 'hag.png'];
  const { app } = createInMemoryApp({
    files: Object.fromEntries(art.map((path) => [`${TOKENS}/${path}`, 'PNG'])),
    folders: [`${TOKENS}/Heroes`, `${TOKENS}/Beasts`, `${TOKENS}/Empty`],
  });
  ui.app = app;
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  // The vault check takes the art in as tokens.
  for (const token of await assets.getTokenAssets()) {
    if (token.imagePath.startsWith(`${TOKENS}/Heroes/`)) await assets.setPlayerCharacters([token.id], true);
  }
  return assets;
}

const open = (tab: Tab): ReturnType<typeof renderHook<ReturnType<typeof useAssetData>, { tab: Tab }>> =>
  renderHook(({ tab: activeTab }) => useAssetData(activeTab, 'default', true), { initialProps: { tab } });

describe('the Characters and Player characters tabs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('split the tokens between them, so none is listed twice, and count each', async () => {
    await library();
    const { result, rerender } = open('tokens');
    await waitFor(() => expect(result.current.assetsLoading).toBe(false));
    expect(result.current.assets.map((asset) => asset.name).sort()).toEqual(['Hag', 'Wolf']);
    expect(result.current.assetCounts).toMatchObject({ tokens: 2, party: 2 });

    rerender({ tab: 'party' });
    await waitFor(() => expect(result.current.assetsLoading).toBe(false));
    expect(result.current.assets.map((asset) => [asset.name, asset.type, asset.folderId]).sort()).toEqual([
      ['Bard', 'tokens', null], ['Ranger', 'tokens', null],
    ]);
  });

  it('shows the party flat, and no folder on the Characters tab that only player characters filled', async () => {
    await library();
    const { result, rerender } = open('tokens');
    await waitFor(() => expect(result.current.assetsLoading).toBe(false));
    await waitFor(() => expect(result.current.folders.map((folder) => folder.name).sort()).toEqual(['Beasts', 'Empty']));

    rerender({ tab: 'party' });
    await waitFor(() => expect(result.current.assetsLoading).toBe(false));
    expect(result.current.folders).toEqual([]);
  });
});
