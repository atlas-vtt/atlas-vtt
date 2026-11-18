import { useEffect, useRef, useState } from 'react';
import { type App as ObsidianApp } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import type { BundleProgress, BundleProgressListener } from '../../../../services/collectionBundle/bundleProgress';
import { exportCollectionBundle, prepareCollectionExport, type ExportChoice, type ExportPreview } from '../../../../services/collectionBundle/collectionExport';
import { openCollectionImport, type CollectionImportResult, type ImportDecision, type ImportSession } from '../../../../services/collectionBundle/collectionImport';
import type { BundleFileReader } from '../../../../services/collectionBundle/bundleReader';
import type { ImportReview } from '../../../../services/collectionBundle/importReview';
import type { ExternalImport, ExternalImportOutcome } from '../../../../services/collectionBundle/externalImport';
import { describeError } from '../../../../utils/errors';
import { createShareSession } from '../../../../armarium/upload/createShareSession';
import type { ShareSession } from '../../../../armarium/upload/ShareSession';
import { leaveShare } from '../../../../armarium/share/leaveShare';
import { t } from '../../../../i18n';
import { showNotice } from '../../../../ui/notice';
import { fileInputAttrs } from '../../../../platform/fileInputAccept';
import { saveForUser } from '../../../../platform/saveForUser';

/** Where an export or import stands; the asset manager blocks while one is set. */
export type CollectionTransfer =
  | { step: 'working'; title: string; progress: BundleProgress }
  | { step: 'export-options'; preview: ExportPreview }
  | { step: 'import-review'; review: ImportReview; files: BundleFileReader }
  | { step: 'share'; session: ShareSession }
  | { step: 'done'; title: string; message: string };

export interface CollectionTransferActions {
  transfer: CollectionTransfer | null;
  handleExportCollection: () => Promise<void>;
  handleImportCollection: () => void;
  /** Shares the selected collection in the Armarium: sign-in, export in memory, upload, checks, listing, publish. */
  handleShareCollection: () => Promise<void>;
  /** Starts the review of a bundle that came from outside (an Armarium install); false while another transfer runs. */
  startExternalImport: (pending: ExternalImport) => boolean;
  confirmExport: (choice: ExportChoice) => Promise<string | null>;
  confirmImport: (decision: ImportDecision) => Promise<void>;
  closeTransfer: () => void;
}

interface Deps {
  app: ObsidianApp;
  assetService: AssetService | null;
  selectedCollection: string;
  /** Called with the id of the collection an import or fork created or updated. */
  onImported: (collectionId: string) => Promise<void>;
}

const EXPORTING = t('bundle.exporting');
const SHARING = t('exportDialog.shareInArmarium');
const IMPORTING = t('bundle.importing');

function describeImport(result: CollectionImportResult): string {
  const name = t('bundle.nameVersion', { name: result.collectionName, version: result.version });
  const switched = result.switchedNotes > 0 ? ` ${t('bundle.switchedNotes', { count: result.switchedNotes })}` : '';
  if (result.created) return `${t('bundle.imported', { name })}${switched}`;
  const parts = [t('bundle.filesWritten', { count: result.written }), t('bundle.filesRemoved', { count: result.removed })];
  if (result.keptLocal > 0) parts.push(t('bundle.keptLocal', { count: result.keptLocal }));
  const backup = result.backupCount > 0 ? t('bundle.backedUp', { folder: result.backupFolder }) : '';
  return `${t('bundle.updated', { name, parts: parts.join(', '), backup })}${switched}`;
}

/**
 * Drives exporting the selected collection and importing bundles: progress,
 * the export options and import review dialogs, and the final result.
 */
export function useCollectionTransfer({ app, assetService, selectedCollection, onImported }: Deps): CollectionTransferActions {
  const [transfer, setTransfer] = useState<CollectionTransfer | null>(null);
  const session = useRef<ImportSession | null>(null);
  /** The outside bundle under review, told how its import ended. */
  const external = useRef<ExternalImport | null>(null);
  const settleExternal = (outcome: ExternalImportOutcome): void => {
    const current = external.current;
    external.current = null;
    current?.onSettled(outcome);
  };
  const isMounted = useRef(true);
  /** The share that is open, which the window's closing leaves as Close does. */
  const share = useRef<ShareSession | null>(null);
  share.current = transfer?.step === 'share' ? transfer.session : null;
  useEffect(() => {
    isMounted.current = true;
    return (): void => {
      isMounted.current = false;
      // Closed with the review open: nothing was imported.
      settleExternal({ kind: 'cancelled' });
      if (share.current) void leaveShare(share.current);
    };
  }, []);

  const working = (title: string): BundleProgressListener => (progress) => setTransfer({ step: 'working', title, progress });

  const closeTransfer = (): void => {
    session.current = null;
    setTransfer(null);
    // Only a review still waits for the GM here; a finished import told its outcome already.
    settleExternal({ kind: 'cancelled' });
  };

  // The dialog stays open with the result: a fast transfer would otherwise only flash.
  const finish = (title: string, message: string): void => {
    session.current = null;
    // An update can close the map view hosting this asset manager; the result must still reach the user.
    if (!isMounted.current) {
      showNotice(message);
      return;
    }
    setTransfer({ step: 'done', title, message });
  };

  const handleExportCollection = async (): Promise<void> => {
    if (!assetService || transfer) return;
    setTransfer({ step: 'working', title: EXPORTING, progress: { message: t('bundle.checking'), fraction: 0 } });
    try {
      setTransfer({ step: 'export-options', preview: await prepareCollectionExport(app, assetService, selectedCollection) });
    } catch (error) {
      console.error('[useCollectionTransfer] Export preparation failed:', error);
      finish(t('bundle.exportFailed'), describeError(error));
    }
  };

  const handleShareCollection = async (): Promise<void> => {
    if (!assetService || transfer) return;
    setTransfer({ step: 'working', title: SHARING, progress: { message: t('bundle.checking'), fraction: 0 } });
    try {
      const preview = await prepareCollectionExport(app, assetService, selectedCollection);
      // A fork made the collection this vault's own under a new name: the library shows it so.
      const session = createShareSession(app, assetService, preview, async (choice) => {
        if (choice.kind === 'fork') await onImported(preview.collection.id);
      });
      if (!session) throw new Error(t('armariumShare.notReady'));
      session.start();
      if (isMounted.current) setTransfer({ step: 'share', session });
      else session.dispose();
    } catch (error) {
      console.error('[useCollectionTransfer] Preparing the share failed:', error);
      finish(t('armariumShare.failedTitle'), describeError(error));
    }
  };

  const confirmExport = async (choice: ExportChoice): Promise<string | null> => {
    if (!assetService || transfer?.step !== 'export-options') return null;
    const { preview } = transfer;
    if (choice.kind === 'fork' && await assetService.isCollectionNameTaken(choice.name, preview.collection.id)) {
      return t('bundle.nameTaken', { name: choice.name.trim() });
    }
    setTransfer({ step: 'working', title: EXPORTING, progress: { message: t('bundle.preparing'), fraction: 0 } });
    try {
      const bundle = await exportCollectionBundle(app, assetService, preview, choice, working(EXPORTING));
      // A tablet has no downloads: there the bundle is a file of the vault, named with its place.
      const saved = await saveForUser(app, bundle.fileName, bundle.blob, 'application/zip');
      const file = saved.kind === 'vault' ? saved.path : bundle.fileName;
      const packed = t('bundle.packed', { name: bundle.collectionName, version: bundle.version, assets: t('count.assets', { count: bundle.assetCount }), files: t('count.files', { count: bundle.fileCount }), file });
      try {
        await bundle.commit();
      } catch (error) {
        // The file is out already; only recording the release here failed.
        console.error('[useCollectionTransfer] Recording the release failed:', error);
        finish(t('bundle.exported'), t('bundle.recordFailed', { packed, error: describeError(error) }));
        return null;
      }
      finish(t('bundle.exported'), packed);
      if (choice.kind === 'fork') await onImported(preview.collection.id);
    } catch (error) {
      console.error('[useCollectionTransfer] Export failed:', error);
      finish(t('bundle.exportFailed'), describeError(error));
    }
    return null;
  };

  const importBundle = async (data: Blob, from: ExternalImport | null = null): Promise<void> => {
    if (!assetService) return;
    external.current = from;
    setTransfer({ step: 'working', title: IMPORTING, progress: { message: t('bundle.reading'), fraction: 0 } });
    try {
      session.current = await openCollectionImport(app, assetService, data, working(IMPORTING));
      setTransfer({ step: 'import-review', review: session.current.review, files: session.current.files });
      external.current?.onReview();
    } catch (error) {
      console.error('[useCollectionTransfer] Reading the bundle failed:', error);
      settleExternal({ kind: 'failed' });
      finish(t('bundle.importFailed'), describeError(error));
    }
  };

  const startExternalImport = (pending: ExternalImport): boolean => {
    if (!assetService || transfer) return false;
    void importBundle(pending.data, pending);
    return true;
  };

  const confirmImport = async (decision: ImportDecision): Promise<void> => {
    const current = session.current;
    if (!current) return;
    // Taken out of the ref: once confirmed, the import runs to its end even if the asset manager closes meanwhile.
    const from = external.current;
    external.current = null;
    setTransfer({ step: 'working', title: IMPORTING, progress: { message: t('bundle.writing'), fraction: 0 } });
    let result: CollectionImportResult;
    try {
      result = await current.apply(decision, working(IMPORTING));
    } catch (error) {
      console.error('[useCollectionTransfer] Import failed:', error);
      from?.onSettled({ kind: 'failed' });
      finish(t('bundle.importFailed'), describeError(error));
      return;
    }
    from?.onSettled({ kind: 'installed', collectionId: result.collectionId });
    finish(result.created ? t('bundle.importedTitle') : t('bundle.updatedTitle'), describeImport(result));
    // The import is complete; a failed refresh must not report it as failed.
    try {
      await onImported(result.collectionId);
    } catch (error) {
      console.error('[useCollectionTransfer] Refreshing after import failed:', error);
    }
    app.workspace.trigger('atlas-vtt:refresh-assets');
  };

  const handleImportCollection = (): void => {
    if (transfer) return;
    const input = document.body.createEl('input', {
      type: 'file',
      cls: 'atlas-hidden-file-input',
      attr: fileInputAttrs('.zip'),
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) void importBundle(file);
    });
    input.addEventListener('cancel', () => input.remove());
    input.click();
  };

  return { transfer, handleExportCollection, handleImportCollection, handleShareCollection, startExternalImport, confirmExport, confirmImport, closeTransfer };
}
