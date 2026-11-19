// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { AssetService } from '../../../src/app/services/AssetService';
import { openCollectionImport, type ImportSession } from '../../../src/app/services/collectionBundle/collectionImport';
import type { ExternalImport } from '../../../src/app/services/collectionBundle/externalImport';
import { useCollectionTransfer } from '../../../src/app/packages/components/asset-manager/hooks/useCollectionTransfer';
import { useExternalImport } from '../../../src/app/packages/components/asset-manager/hooks/useExternalImport';

vi.mock('../../../src/app/services/collectionBundle/collectionImport', () => ({ openCollectionImport: vi.fn() }));
vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

const app = { workspace: { trigger: vi.fn() } } as unknown as App;
const assets = {} as AssetService;

function pendingImport(): ExternalImport & { onReview: ReturnType<typeof vi.fn>; onSettled: ReturnType<typeof vi.fn> } {
  return { data: new Blob(['bundle']), onReview: vi.fn(), onSettled: vi.fn() };
}

function session(apply: ImportSession['apply'] = vi.fn()): ImportSession {
  return { review: {} as ImportSession['review'], files: {} as ImportSession['files'], apply };
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
    vi.mocked(openCollectionImport).mockResolvedValue(session(apply));
    const pending = pendingImport();
    const { result, rerender } = renderManager(pending, false);
    await act(async () => { await Promise.resolve(); });
    expect(openCollectionImport).not.toHaveBeenCalled();

    rerender({ open: true });
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(openCollectionImport).mock.calls[0]![2]).toBe(pending.data);
    expect(result.current.transfer?.step).toBe('import-review');
    expect(pending.onReview).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
    expect(pending.onSettled).not.toHaveBeenCalled();

    await act(async () => { await result.current.confirmImport({}); });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(pending.onSettled).toHaveBeenCalledWith({ kind: 'installed', collectionId: 'Skeletons' });
  });

  it('is cancelled when the GM cancels the review', async () => {
    vi.mocked(openCollectionImport).mockResolvedValue(session());
    const pending = pendingImport();
    const { result } = renderManager(pending);
    await act(async () => { await Promise.resolve(); });

    act(() => result.current.closeTransfer());
    expect(pending.onSettled).toHaveBeenCalledWith({ kind: 'cancelled' });
    expect(openCollectionImport).toHaveBeenCalledTimes(1);
  });

  it('is cancelled when the window closes on its review', async () => {
    vi.mocked(openCollectionImport).mockResolvedValue(session());
    const pending = pendingImport();
    const { unmount } = renderManager(pending);
    await act(async () => { await Promise.resolve(); });
    unmount();
    expect(pending.onSettled).toHaveBeenCalledWith({ kind: 'cancelled' });
  });

  it('fails when the file cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(openCollectionImport).mockRejectedValue(new Error('Not a collection bundle'));
    const pending = pendingImport();
    const { result } = renderManager(pending);
    await act(async () => { await Promise.resolve(); });
    expect(pending.onSettled).toHaveBeenCalledWith({ kind: 'failed' });
    expect(result.current.transfer?.step).toBe('done');
  });
});
