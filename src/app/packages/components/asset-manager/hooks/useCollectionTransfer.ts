import { useEffect, useRef, useState } from 'react';
import { type App as ObsidianApp } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import type { BundleProgress, BundleProgressListener } from '../../../../services/collectionBundle/bundleProgress';
import { exportCollectionBundle, prepareCollectionExport, type ExportChoice, type ExportPreview } from '../../../../services/collectionBundle/collectionExport';
import type { CollectionImportResult, ImportDecision, ImportSession } from '../../../../services/collectionBundle/collectionImport';
import { openBundleImport } from '../../../../services/itemBundle/bundleImport';
import type { ItemImportResult, ItemImportSession, ItemReview } from '../../../../services/itemBundle/itemImport';
import type { MusicImportResult, MusicImportSession, MusicReview } from '../../../../services/musicBundle/musicImport';
import { SoundLibrary } from '../../../../soundLibrary/SoundLibrary';
import { describeImport, describeItemImport, describeMusicImport, itemImportTitle, musicImportTitle } from './importResultText';
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
  | { step: 'item-review'; review: ItemReview }
  | { step: 'music-review'; review: MusicReview }
  | { step: 'share'; session: ShareSession }
  /** `installed`: the single item an import put in the vault, which the result offers to open; `music`: the music it installed. */
  | { step: 'done'; title: string; message: string; installed?: ItemImportResult | undefined; music?: MusicImportResult | undefined };

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
  /** Installs the single item under review. */
  confirmItemImport: () => Promise<void>;
  /** Installs the music under review. */
  confirmMusicImport: () => Promise<void>;
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


/**
 * Drives exporting the selected collection and importing bundles: progress,
 * the export options and import review dialogs, and the final result.
 */
export function useCollectionTransfer({ app, assetService, selectedCollection, onImported }: Deps): CollectionTransferActions {
  const [transfer, setTransfer] = useState<CollectionTransfer | null>(null);
  const session = useRef<ImportSession | null>(null);
  const itemSession = useRef<ItemImportSession | null>(null);
  const musicSession = useRef<MusicImportSession | null>(null);
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
    itemSession.current = null;
    musicSession.current = null;
    setTransfer(null);
    // Only a review still waits for the GM here; a finished import told its outcome already.
    settleExternal({ kind: 'cancelled' });
  };

  // The dialog stays open with the result: a fast transfer would otherwise only flash.
  const finish = (title: string, message: string, installed?: ItemImportResult, music?: MusicImportResult): void => {
    session.current = null;
    itemSession.current = null;
    musicSession.current = null;
    // An update can close the map view hosting this asset manager; the result must still reach the user.
    if (!isMounted.current) {
      showNotice(message);
      return;
    }
    setTransfer({ step: 'done', title, message, installed, music });
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
      const opened = await openBundleImport(app, assetService, data, working(IMPORTING), { creator: from?.creator, listingUid: from?.listingUid });
      if (opened.kind === 'item') {
        itemSession.current = opened.session;
        setTransfer({ step: 'item-review', review: opened.session.review });
      } else if (opened.kind === 'music') {
        musicSession.current = opened.session;
        setTransfer({ step: 'music-review', review: opened.session.review });
      } else {
        session.current = opened.session;
        setTransfer({ step: 'import-review', review: opened.session.review, files: opened.session.files });
      }
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

  const confirmItemImport = async (): Promise<void> => {
    const current = itemSession.current;
    if (!current) return;
    // Taken out of the ref: once confirmed, the import runs to its end even if the asset manager closes meanwhile.
    const from = external.current;
    external.current = null;
    setTransfer({ step: 'working', title: IMPORTING, progress: { message: t('bundle.writing'), fraction: 0.5 } });
    let result: ItemImportResult;
    try {
      result = await current.apply();
    } catch (error) {
      console.error('[useCollectionTransfer] Installing the item failed:', error);
      from?.onSettled({ kind: 'failed' });
      finish(t('bundle.importFailed'), describeError(error));
      return;
    }
    from?.onSettled({ kind: 'installed' });
    finish(itemImportTitle(result), describeItemImport(result), result);
  };

  const confirmMusicImport = async (): Promise<void> => {
    const current = musicSession.current;
    if (!current) return;
    const from = external.current;
    external.current = null;
    setTransfer({ step: 'working', title: IMPORTING, progress: { message: t('bundle.writing'), fraction: 0.5 } });
    let result: MusicImportResult;
    try {
      result = await current.apply();
    } catch (error) {
      console.error('[useCollectionTransfer] Installing the music failed:', error);
      from?.onSettled({ kind: 'failed' });
      finish(t('bundle.importFailed'), describeError(error));
      return;
    }
    from?.onSettled({ kind: 'installed' });
    // The library opens on what came in, on the Sound page and its tab alike.
    SoundLibrary.opened(app)?.place.show('music', result.tags);
    finish(musicImportTitle(result), describeMusicImport(result), undefined, result);
  };

  const handleImportCollection = (): void => {
    if (transfer) return;
    const input = activeDocument.body.createEl('input', {
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

  return { transfer, handleExportCollection, handleImportCollection, handleShareCollection, startExternalImport, confirmExport, confirmImport, confirmItemImport, confirmMusicImport, closeTransfer };
}
