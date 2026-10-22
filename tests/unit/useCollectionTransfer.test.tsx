// @vitest-environment jsdom
import { act, cleanup, renderHook, type RenderHookResult } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { useCollectionTransfer, type CollectionTransferActions } from '../../src/app/packages/components/asset-manager/hooks/useCollectionTransfer';
import { openCollectionImport, type CollectionImportResult, type ImportSession } from '../../src/app/services/collectionBundle/collectionImport';
import { exportCollectionBundle, prepareCollectionExport, type ExportPreview } from '../../src/app/services/collectionBundle/collectionExport';
import type { ImportReview } from '../../src/app/services/collectionBundle/importReview';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
vi.mock('../../src/app/services/collectionBundle/collectionImport', () => ({ openCollectionImport: vi.fn() }));
vi.mock('../../src/app/services/collectionBundle/collectionExport', () => ({ prepareCollectionExport: vi.fn(), exportCollectionBundle: vi.fn() }));

const review = { relation: 'newer', collectionName: 'Source', version: 2 } as ImportReview;
const updated: CollectionImportResult = {
  collectionId: 'source', collectionName: 'Source', version: 2, created: false, written: 3, removed: 1, keptLocal: 1,
  backupCount: 4, backupFolder: 'atlas-vtt/.atlas-data/backups/source/2026-09-23 19-30-05', switchedNotes: 0,
};

function session(apply: ImportSession['apply'] = vi.fn(async () => updated)): ImportSession {
  return { review, apply };
}

function setup(): { hook: RenderHookResult<CollectionTransferActions, unknown>; onImported: ReturnType<typeof vi.fn>; assetService: Record<string, ReturnType<typeof vi.fn>> } {
  const onImported = vi.fn(async (): Promise<void> => undefined);
  const assetService = {
    isCollectionNameTaken: vi.fn(async (name: string) => name === 'Taken'),
  };
  const app = { workspace: { trigger: vi.fn() } };
  const hook = renderHook(() => useCollectionTransfer({ app: app as never, assetService: assetService as never, selectedCollection: 'Source', onImported }));
  return { hook, onImported, assetService };
}

async function pickFile(hook: RenderHookResult<CollectionTransferActions, unknown>): Promise<void> {
  act(() => hook.result.current.handleImportCollection());
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [new File(['zip'], 'Source v2.atlas-collection.zip')] });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(openCollectionImport).toHaveBeenCalled());
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

it('reviews a bundle, applies the user\'s decision and shows the result until closed', async () => {
  const apply = vi.fn(async () => updated);
  vi.mocked(openCollectionImport).mockResolvedValue(session(apply));
  const { hook, onImported } = setup();
  await pickFile(hook);
  await vi.waitFor(() => expect(hook.result.current.transfer).toEqual({ step: 'import-review', review }));

  const decision = { resolutions: new Map([['asset:cave', 'theirs' as const]]) };
  await act(async () => hook.result.current.confirmImport(decision));
  expect(apply).toHaveBeenCalledWith(decision, expect.any(Function));
  expect(hook.result.current.transfer).toEqual({
    step: 'done',
    title: 'Collection updated',
    message: 'Updated “Source” v2: 3 files written, 1 file removed, 1 item kept as you had them. Replaced files were backed up to atlas-vtt/.atlas-data/backups/source/2026-09-23 19-30-05.',
  });
  expect(onImported).toHaveBeenCalled();
  act(() => hook.result.current.closeTransfer());
  expect(hook.result.current.transfer).toBeNull();
});

it('explains a bundle it cannot read and an import that failed', async () => {
  vi.mocked(openCollectionImport).mockRejectedValueOnce(new Error('This collection export is damaged.'));
  const { hook } = setup();
  await pickFile(hook);
  await vi.waitFor(() => expect(hook.result.current.transfer).toEqual({ step: 'done', title: 'Import failed', message: 'This collection export is damaged.' }));

  act(() => hook.result.current.closeTransfer());
  vi.mocked(openCollectionImport).mockResolvedValueOnce(session(vi.fn(async () => { throw new Error('The import failed: Disk full. Nothing was changed.'); })));
  await pickFile(hook);
  await vi.waitFor(() => expect(hook.result.current.transfer?.step).toBe('import-review'));
  await act(async () => hook.result.current.confirmImport({}));
  expect(hook.result.current.transfer).toMatchObject({ step: 'done', title: 'Import failed', message: 'The import failed: Disk full. Nothing was changed.' });
});

it('reports the result as a notice when the asset manager closed during the import', async () => {
  let finish: (result: CollectionImportResult) => void = () => undefined;
  vi.mocked(openCollectionImport).mockResolvedValue(session(() => new Promise((resolve) => { finish = resolve; })));
  const { hook } = setup();
  await pickFile(hook);
  await vi.waitFor(() => expect(hook.result.current.transfer?.step).toBe('import-review'));
  const applying = hook.result.current.confirmImport({});
  hook.unmount();
  finish({ ...updated, created: true });
  await applying;
  expect(Notice).toHaveBeenCalledWith('Imported “Source” v2.');
});

it('says how many statblocks the import switched to the copies of their templates', async () => {
  vi.mocked(openCollectionImport).mockResolvedValue(session(vi.fn(async () => ({ ...updated, switchedNotes: 2 }))));
  const { hook } = setup();
  await pickFile(hook);
  await vi.waitFor(() => expect(hook.result.current.transfer?.step).toBe('import-review'));
  await act(async () => hook.result.current.confirmImport({ switchReusedNotes: true }));
  expect(hook.result.current.transfer).toMatchObject({
    message: expect.stringContaining('1 item kept as you had them. Replaced files were backed up to atlas-vtt/.atlas-data/backups/source/2026-09-23 19-30-05. 2 statblocks now use the template copies.'),
  });
});

it('shows export options, keeps them open for a name that is taken, and exports the chosen release', async () => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  const preview = { collection: { id: 'source', name: 'Source' } } as ExportPreview;
  vi.mocked(prepareCollectionExport).mockResolvedValue(preview);
  const commit = vi.fn(async (): Promise<void> => undefined);
  vi.mocked(exportCollectionBundle).mockResolvedValue({ blob: new Blob(['zip']), commit, fileName: 'Source v2.atlas-collection.zip', collectionName: 'Source', version: 2, assetCount: 3, fileCount: 9 });
  const { hook } = setup();

  await act(async () => hook.result.current.handleExportCollection());
  expect(hook.result.current.transfer).toEqual({ step: 'export-options', preview });
  let error: string | null = null;
  await act(async () => { error = await hook.result.current.confirmExport({ kind: 'fork', name: 'Taken' }); });
  expect(error).toBe('A collection named “Taken” already exists.');
  expect(hook.result.current.transfer?.step).toBe('export-options');

  await act(async () => { await hook.result.current.confirmExport({ kind: 'release', version: 2 }); });
  expect(exportCollectionBundle).toHaveBeenCalledWith(expect.anything(), expect.anything(), preview, { kind: 'release', version: 2 }, expect.any(Function));
  expect(hook.result.current.transfer).toEqual({
    step: 'done', title: 'Collection exported', message: 'Packed “Source” v2 (3 assets, 9 files) into Source v2.atlas-collection.zip.',
  });
  expect(click).toHaveBeenCalledOnce();
  expect(commit).toHaveBeenCalledOnce();
  click.mockRestore();
  vi.unstubAllGlobals();
});

it('reports an export whose file went out but whose release could not be recorded', async () => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.mocked(prepareCollectionExport).mockResolvedValue({ collection: { id: 'source', name: 'Source' } } as ExportPreview);
  vi.mocked(exportCollectionBundle).mockResolvedValue({
    blob: new Blob(['zip']), commit: vi.fn(async () => { throw new Error('Disk full'); }),
    fileName: 'Source v2.atlas-collection.zip', collectionName: 'Source', version: 2, assetCount: 3, fileCount: 9,
  });
  const { hook } = setup();
  await act(async () => hook.result.current.handleExportCollection());
  await act(async () => { await hook.result.current.confirmExport({ kind: 'release', version: 2 }); });
  expect(hook.result.current.transfer).toMatchObject({
    step: 'done', title: 'Collection exported',
    message: expect.stringContaining('could not record the release (Disk full)'),
  });
  click.mockRestore();
  vi.unstubAllGlobals();
});
