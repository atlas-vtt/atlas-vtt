// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';
import { useCollectionTransfer } from '../../../src/app/packages/components/asset-manager/hooks/useCollectionTransfer';
import { exportCollectionBundle, prepareCollectionExport, type ExportPreview } from '../../../src/app/services/collectionBundle/collectionExport';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const { showNotice, showNoticeWithAction } = vi.hoisted(() => ({ showNotice: vi.fn(), showNoticeWithAction: vi.fn() }));
vi.mock('../../../src/app/ui/notice', () => ({ showNotice, showNoticeWithAction }));
vi.mock('../../../src/app/services/collectionBundle/collectionImport', () => ({ openCollectionImport: vi.fn() }));
vi.mock('../../../src/app/services/collectionBundle/collectionExport', () => ({ prepareCollectionExport: vi.fn(), exportCollectionBundle: vi.fn() }));

const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);

beforeEach(() => {
  vi.clearAllMocks();
  Platform.isMobile = true;
});
afterEach(() => {
  cleanup();
  Platform.isMobile = false;
});

it('writes an exported collection into the vault on a tablet, names its place and downloads nothing', async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  const preview = { collection: { id: 'source', name: 'Source' } } as ExportPreview;
  vi.mocked(prepareCollectionExport).mockResolvedValue(preview);
  const commit = vi.fn(async (): Promise<void> => undefined);
  vi.mocked(exportCollectionBundle).mockResolvedValue({ blob: new Blob([ZIP_BYTES]), commit, fileName: 'Source v2.atlas-collection.zip', collectionName: 'Source', version: 2, assetCount: 3, fileCount: 9 });
  const { app } = createInMemoryApp();
  Reflect.set(app.workspace, 'trigger', vi.fn());
  const assetService = { isCollectionNameTaken: vi.fn(async () => false) };
  const hook = renderHook(() => useCollectionTransfer({ app, assetService: assetService as never, selectedCollection: 'Source', onImported: async () => undefined }));

  await act(async () => hook.result.current.handleExportCollection());
  await act(async () => { await hook.result.current.confirmExport({ kind: 'release', version: 2 }); });

  expect(click).not.toHaveBeenCalled();
  const file = app.vault.getFileByPath('atlas-vtt/exports/Source v2.atlas-collection.zip');
  expect(new Uint8Array(await app.vault.readBinary(file!))).toEqual(ZIP_BYTES);
  expect(hook.result.current.transfer).toEqual({
    step: 'done', title: 'Collection exported', message: 'Packed “Source” v2 (3 assets, 9 files) into atlas-vtt/exports/Source v2.atlas-collection.zip.',
  });
  expect(showNotice).toHaveBeenCalledExactlyOnceWith('Saved Source v2.atlas-collection.zip in atlas-vtt/exports.', expect.any(Number));
  expect(commit).toHaveBeenCalledOnce();
  click.mockRestore();
});
