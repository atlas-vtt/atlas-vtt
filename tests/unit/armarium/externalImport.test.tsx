// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { AssetService } from '../../../src/app/services/AssetService';
import { openBundleImport, type BundleImport } from '../../../src/app/services/itemBundle/bundleImport';
import type { ImportSession } from '../../../src/app/services/collectionBundle/collectionImport';
import type { ExternalImport } from '../../../src/app/services/collectionBundle/externalImport';
import { useCollectionTransfer } from '../../../src/app/packages/components/asset-manager/hooks/useCollectionTransfer';
import { useExternalImport } from '../../../src/app/packages/components/asset-manager/hooks/useExternalImport';

vi.mock('../../../src/app/services/itemBundle/bundleImport', () => ({ openBundleImport: vi.fn() }));
vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

const app = { workspace: { trigger: vi.fn() } } as unknown as App;
const assets = {} as AssetService;

function pendingImport(): ExternalImport & { onReview: ReturnType<typeof vi.fn>; onSettled: ReturnType<typeof vi.fn> } {
  return { data: new Blob(['bundle']), onReview: vi.fn(), onSettled: vi.fn() };
}

function session(apply: ImportSession['apply'] = vi.fn()): BundleImport {
  return { kind: 'collection', session: { review: {} as ImportSession['review'], files: {} as ImportSession['files'], apply } };
}

/** The asset manager's transfer as it runs with a bundle handed to it, open or not. */
function renderManager(pending: ExternalImport, isOpen = true) {
  return renderHook(({ open }) => {
    const transfer = useCollectionTransfer({ app, assetService: assets, selectedCollection: 'default', onImported: vi.fn(async () => undefined) });
    useExternalImport(pending, open, transfer);
    return transfer;
  }, { initialProps: { open: isOpen } });
}

afterEach(() => vi.clearAllMocks());

describe('a bundle handed to the asset manager', () => {
  it('opens in the import review once the window is open, and is imported only when the GM confirms', async () => {
    const apply = vi.fn(async () => ({ collectionId: 'Skeletons', collectionName: 'Skeletons', version: 5, created: true, written: 3, removed: 0, keptLocal: 0, backupCount: 0, backupFolder: '', switchedNotes: 0 }));
    vi.mocked(openBundleImport).mockResolvedValue(session(apply));
    const pending = pendingImport();
    const { result, rerender } = renderManager(pending, false);
    await act(async () => { await Promise.resolve(); });
    expect(openBundleImport).not.toHaveBeenCalled();

    rerender({ open: true });
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(openBundleImport).mock.calls[0]![2]).toBe(pending.data);
    expect(result.current.transfer?.step).toBe('import-review');
    expect(pending.onReview).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
    expect(pending.onSettled).not.toHaveBeenCalled();

    await act(async () => { await result.current.confirmImport({}); });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(pending.onSettled).toHaveBeenCalledWith({ kind: 'installed', collectionId: 'Skeletons' });
  });

  it('is cancelled when the GM cancels the review', async () => {
    vi.mocked(openBundleImport).mockResolvedValue(session());
    const pending = pendingImport();
    const { result } = renderManager(pending);
    await act(async () => { await Promise.resolve(); });

    act(() => result.current.closeTransfer());
    expect(pending.onSettled).toHaveBeenCalledWith({ kind: 'cancelled' });
    expect(openBundleImport).toHaveBeenCalledTimes(1);
  });

  it('is cancelled when the window closes on its review', async () => {
    vi.mocked(openBundleImport).mockResolvedValue(session());
    const pending = pendingImport();
    const { unmount } = renderManager(pending);
    await act(async () => { await Promise.resolve(); });
    unmount();
    expect(pending.onSettled).toHaveBeenCalledWith({ kind: 'cancelled' });
  });

  it('opens a single item in the item review, naming who shared it, and offers the installed item at the end', async () => {
    const review = { kind: 'dice-set', name: 'Boons', version: 2, outcome: 'new', localName: 'Boons', installedVersion: null, diceSet: null } as const;
    const apply = vi.fn(async () => ({ kind: 'dice-set' as const, localId: 'boons', name: 'Boons', outcome: 'new' as const, version: 2 }));
    vi.mocked(openBundleImport).mockResolvedValue({ kind: 'item', session: { review, apply } });
    const pending = { ...pendingImport(), creator: 'Mara' };
    const { result } = renderManager(pending);
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(openBundleImport).mock.calls[0]![4]).toEqual({ creator: 'Mara' });
    expect(result.current.transfer).toEqual({ step: 'item-review', review });
    expect(pending.onReview).toHaveBeenCalledTimes(1);

    await act(async () => { await result.current.confirmItemImport(); });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(pending.onSettled).toHaveBeenCalledWith({ kind: 'installed' });
    expect(result.current.transfer).toMatchObject({ step: 'done', title: 'Added to your library', message: 'Boons v2 is in your library.', installed: { kind: 'dice-set', localId: 'boons' } });
  });

  it('fails when the file cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(openBundleImport).mockRejectedValue(new Error('Not a collection bundle'));
    const pending = pendingImport();
    const { result } = renderManager(pending);
    await act(async () => { await Promise.resolve(); });
    expect(pending.onSettled).toHaveBeenCalledWith({ kind: 'failed' });
    expect(result.current.transfer?.step).toBe('done');
  });
});
