import React, { useEffect, useMemo } from 'react';
import { useAtlasUI } from '../../../../react/root/AtlasUIContext';
import { ProgressModal } from '../../primitives/ProgressModal';
import type { CollectionTransferActions } from '../hooks/useCollectionTransfer';
import { bundleMedia, vaultMedia } from './contentMedia';
import { ExportCollectionDialog } from './ExportCollectionDialog';
import { ImportReviewDialog } from './ImportReviewDialog';
import { ItemReviewDialog } from './ItemReviewDialog';
import { MusicReviewDialog } from './MusicReviewDialog';
import type { ItemRef } from '../../../../services/itemBundle/itemBundleFormat';
import { ArmariumShareLayer } from '../../../../armarium/share/ArmariumShareLayer';
import { t } from '../../../../i18n';

type CollectionTransferLayerProps = Pick<CollectionTransferActions, 'transfer' | 'confirmExport' | 'confirmImport' | 'confirmItemImport' | 'confirmMusicImport' | 'closeTransfer'> & {
  /** Where an item an import installed is opened; null where it has no such place. */
  openerFor?: ((item: ItemRef) => (() => void) | null) | undefined;
  /** Shows installed music where the GM sees it; absent where there is no such place. */
  openSound?: (() => void) | undefined;
};

/** The dialog of the export or import in progress, if any. */
export function CollectionTransferLayer({ transfer, confirmExport, confirmImport, confirmItemImport, confirmMusicImport, closeTransfer, openerFor, openSound }: CollectionTransferLayerProps): React.JSX.Element | null {
  const { app } = useAtlasUI();
  // Token art and statblocks come from the vault when exporting and from the file when importing.
  const bundleFiles = transfer?.step === 'import-review' ? transfer.files : null;
  const media = useMemo(() => (bundleFiles ? bundleMedia(app, bundleFiles) : vaultMedia(app)), [app, bundleFiles]);
  useEffect(() => () => media.dispose(), [media]);

  switch (transfer?.step) {
    case 'working':
      return <ProgressModal title={transfer.title} message={transfer.progress.message} fraction={transfer.progress.fraction} />;
    case 'export-options':
      return <ExportCollectionDialog preview={transfer.preview} media={media} onExport={confirmExport} onCancel={closeTransfer} />;
    case 'share':
      return <ArmariumShareLayer session={transfer.session} media={media} onClose={closeTransfer} />;
    case 'import-review':
      return <ImportReviewDialog review={transfer.review} media={media} onConfirm={(decision) => { void confirmImport(decision); }} onCancel={closeTransfer} />;
    case 'item-review':
      return <ItemReviewDialog review={transfer.review} onConfirm={() => { void confirmItemImport(); }} onCancel={closeTransfer} />;
    case 'music-review':
      return <MusicReviewDialog review={transfer.review} onConfirm={() => { void confirmMusicImport(); }} onCancel={closeTransfer} />;
    case 'done': {
      const { installed, music } = transfer;
      const itemOpener = installed && openerFor ? openerFor({ kind: installed.kind, id: installed.localId }) : null;
      // The library already shows what came in; the Sound page's tab is where the GM sees it.
      const opener = music ? openSound ?? null : itemOpener;
      const open = opener ? (): void => { closeTransfer(); opener(); } : null;
      const close = { label: t('common.close'), onSelect: closeTransfer, isPrimary: !open };
      return (
        <ProgressModal
          title={transfer.title}
          message={transfer.message}
          fraction={1}
          prompt={{ actions: open ? [close, { label: music ? t('armariumMusic.done.show') : t('itemReview.open'), onSelect: open, isPrimary: true }] : [close], onDismiss: closeTransfer }}
        />
      );
    }
    default:
      return null;
  }
}
