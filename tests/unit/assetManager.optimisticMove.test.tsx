// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { AnyAsset, CollectionOption, Folder } from '../../src/app/packages/components/asset-manager/types';
import type { AssetService } from '../../src/app/services/AssetService';
import type { FolderMoveResult } from '../../src/app/packages/components/asset-manager/utils/assetFolderMove';
import { withRestored } from '../../src/app/packages/components/asset-manager/utils/optimisticMove';

const moveFiles = vi.hoisted(() => ({ run: vi.fn<() => Promise<FolderMoveResult>>() }));
const transfer = vi.hoisted(() => ({ run: vi.fn<() => Promise<{ assets: Array<{ id: string }> }>>() }));
const toast = vi.hoisted(() => vi.fn());

vi.mock('../../src/app/packages/components/asset-manager/utils/assetFolderMove', async (original) => ({
  ...(await original<object>()),
  moveAssetsIntoFolder: () => moveFiles.run(),
}));
vi.mock('../../src/app/services/assetTransfer/assetTransfer', () => ({ transferAssets: () => transfer.run() }));
vi.mock('../../src/app/services/assetTransfer/linkedScenes', () => ({ linkedScenesFor: () => Promise.resolve([]) }));
vi.mock('../../src/app/react/components/AtlasToast', () => ({ showAtlasToast: toast }));

const { useAssetCrud } = await import('../../src/app/packages/components/asset-manager/hooks/useAssetCrud');
const { transferToCollection } = await import('../../src/app/packages/components/asset-manager/utils/collectionTransferActions');

const card = (id: string, name: string, folderId: string | null = null): AnyAsset => ({ id, name, type: 'tokens', folderId } as AnyAsset);
const ROGUE = card('rogue', 'Rogue');
const BARD = card('bard', 'Bard');
const LOOT = 'folder:loot';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const FOLDERS: Folder[] = [{ id: LOOT, name: 'Loot', type: 'tokens', path: 'Loot', parentId: null }];
const openFolder = vi.fn<(folderId: string | null, assetIds: readonly string[]) => void>();

/** The asset manager's list of cards, with the crud actions that move them. */
function useHarness(loadAssets: () => Promise<void>): { assets: AnyAsset[]; move: (ids: string[], folder: string | null) => Promise<void> } {
  const [assets, setAssets] = useState<AnyAsset[]>([ROGUE, BARD]);
  const crud = useAssetCrud(
    {} as App, {} as AssetService, 'tokens', 'camp', null, FOLDERS, [], vi.fn(), () => Promise.resolve(), vi.fn(),
    () => Promise.resolve(), loadAssets, null, vi.fn(), vi.fn(), setAssets, openFolder,
    { followFolderMoves: vi.fn(), setSelectedFolderIds: vi.fn() },
  );
  return { assets, move: crud.moveAssetsToFolder };
}

/** The action the last notice offered, by the label it showed. */
function lastAction(): { label: string; run: () => void } | undefined {
  return toast.mock.calls.at(-1)?.[2] as { label: string; run: () => void } | undefined;
}

beforeEach(() => {
  moveFiles.run.mockReset();
  transfer.run.mockReset();
  toast.mockReset();
  openFolder.mockReset();
});
afterEach(cleanup);

describe('moving cards into a folder', () => {
  it('takes the card out of its folder at once and keeps it there once the file has moved', async () => {
    const files = deferred<FolderMoveResult>();
    moveFiles.run.mockReturnValue(files.promise);
    const loadAssets = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useHarness(loadAssets));

    let moving!: Promise<void>;
    act(() => { moving = result.current.move(['rogue'], LOOT); });
    // Before the vault has moved anything, the card already lies in the folder it goes to.
    expect(result.current.assets.find((asset) => asset.id === 'rogue')?.folderId).toBe(LOOT);
    expect(result.current.assets.find((asset) => asset.id === 'bard')?.folderId).toBeNull();

    await act(async () => { files.resolve({ moved: ['rogue'], nameClashes: [], failed: [] }); await moving; });
    expect(result.current.assets.find((asset) => asset.id === 'rogue')?.folderId).toBe(LOOT);
    expect(loadAssets).toHaveBeenCalledTimes(1);
  });

  it('says where the card went, and its button opens that folder (#32)', async () => {
    moveFiles.run.mockResolvedValue({ moved: ['rogue'], nameClashes: [], failed: [] });
    const { result } = renderHook(() => useHarness(() => Promise.resolve()));

    await act(() => result.current.move(['rogue'], LOOT));
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('Moved “Rogue” to Loot', expect.any(Number), expect.objectContaining({ label: 'Open folder' }));
    lastAction()?.run();
    // It opens the folder with the moved card selected (#37).
    expect(openFolder).toHaveBeenCalledWith(LOOT, ['rogue']);
  });

  it('counts several cards by their kind, and names the top level', async () => {
    moveFiles.run.mockResolvedValue({ moved: ['rogue', 'bard'], nameClashes: [], failed: [] });
    const { result } = renderHook(() => useHarness(() => Promise.resolve()));

    await act(() => result.current.move(['rogue', 'bard'], LOOT));
    expect(toast.mock.calls.at(-1)?.[0]).toBe('Moved 2 tokens to Loot');

    const { result: other } = renderHook(() => useHarness(() => Promise.resolve()));
    await act(() => other.current.move(['rogue', 'bard'], null));
    expect(toast.mock.calls.at(-1)?.[0]).toBe('Moved 2 tokens to the top level');
    expect(lastAction()?.label).toBe('Open top level');
    lastAction()?.run();
    expect(openFolder).toHaveBeenCalledWith(null, ['rogue', 'bard']);
  });

  it('names only the cards that moved', async () => {
    moveFiles.run.mockResolvedValue({ moved: ['bard'], nameClashes: [], failed: [{ name: 'Rogue', reason: 'The file is locked' }] });
    const { result } = renderHook(() => useHarness(() => Promise.resolve()));

    await act(() => result.current.move(['rogue', 'bard'], LOOT));
    expect(toast.mock.calls.map((call) => call[0])).toEqual(['Moved “Bard” to Loot', 'Could not move Rogue: The file is locked']);
  });

  it('puts back a card whose file could not move, with a notice naming it and the reason', async () => {
    const files = deferred<FolderMoveResult>();
    moveFiles.run.mockReturnValue(files.promise);
    const { result } = renderHook(() => useHarness(() => Promise.resolve()));

    let moving!: Promise<void>;
    act(() => { moving = result.current.move(['rogue', 'bard'], LOOT); });
    expect(result.current.assets.map((asset) => asset.folderId)).toEqual([LOOT, LOOT]);

    await act(async () => {
      files.resolve({ moved: ['bard'], nameClashes: [], failed: [{ name: 'Rogue', reason: 'The file is locked' }] });
      await moving;
    });
    expect(result.current.assets.find((asset) => asset.id === 'rogue')).toBe(ROGUE);
    expect(result.current.assets.find((asset) => asset.id === 'bard')?.folderId).toBe(LOOT);
    expect(toast).toHaveBeenCalledWith('Could not move Rogue: The file is locked', expect.any(Number));
  });

  it('puts every card back when the move throws', async () => {
    moveFiles.run.mockRejectedValue(new Error('Vault busy'));
    const loadAssets = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useHarness(loadAssets));

    await act(() => result.current.move(['rogue'], LOOT));
    expect(result.current.assets).toEqual([ROGUE, BARD]);
    expect(toast).toHaveBeenCalledWith('Could not move Rogue: Vault busy', expect.any(Number));
    expect(loadAssets).not.toHaveBeenCalled();
  });
});

describe('moving cards to another collection', () => {
  const target: CollectionOption = { id: 'keep', name: 'Keep' } as CollectionOption;

  function context(): { assets: () => AnyAsset[]; selected: () => string[]; ctx: Parameters<typeof transferToCollection>[0] } {
    let assets: AnyAsset[] = [ROGUE, BARD];
    let selected = ['rogue'];
    return {
      assets: () => assets,
      selected: () => selected,
      ctx: {
        app: {} as App,
        assetService: {} as AssetService,
        setAssets: (next) => { assets = typeof next === 'function' ? next(assets) : next; },
        setSelectedAssetIds: (next) => { selected = typeof next === 'function' ? next(selected) : next; },
      },
    };
  }

  it('removes the card before the files have moved', async () => {
    const moved = deferred<{ assets: Array<{ id: string }> }>();
    transfer.run.mockReturnValue(moved.promise);
    const { assets, selected, ctx } = context();

    const moving = transferToCollection(ctx, [ROGUE], target, 'move');
    await vi.waitFor(() => expect(transfer.run).toHaveBeenCalled());
    expect(assets()).toEqual([BARD]);
    expect(selected()).toEqual([]);

    moved.resolve({ assets: [{ id: 'rogue' }] });
    await moving;
    expect(assets()).toEqual([BARD]);
    expect(toast).toHaveBeenCalledWith('Moved “Rogue” to Keep');
  });

  it('offers to open the collection the cards went to, counting them by kind', async () => {
    transfer.run.mockResolvedValue({ assets: [{ id: 'rogue' }, { id: 'bard' }] });
    const { ctx } = context();
    const openCollection = vi.fn();

    await transferToCollection({ ...ctx, openCollection }, [ROGUE, BARD], target, 'move');
    expect(toast).toHaveBeenCalledWith('Moved 2 tokens to Keep', expect.any(Number), expect.objectContaining({ label: 'Open collection' }));
    lastAction()?.run();
    expect(openCollection).toHaveBeenCalledWith('keep', ['rogue', 'bard']);
  });

  it('brings the card back with the reason when the move fails', async () => {
    transfer.run.mockRejectedValue(new Error('Disk full'));
    const { assets, ctx } = context();

    await transferToCollection(ctx, [ROGUE], target, 'move');
    expect(assets().map((asset) => asset.id).sort()).toEqual(['bard', 'rogue']);
    expect(toast.mock.calls[0]?.[0]).toContain('Disk full');
  });
});

describe('withRestored', () => {
  it('puts assets back in their place, and adds those no longer listed', () => {
    const moved = card('rogue', 'Rogue', LOOT);
    const before = new Map([['rogue', ROGUE], ['bard', BARD]]);
    expect(withRestored([moved], before, ['rogue', 'bard'])).toEqual([ROGUE, BARD]);
    expect(withRestored([moved], before, [])).toEqual([moved]);
  });
});
