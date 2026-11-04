import React, { useEffect, useMemo } from 'react';
import { useAtlasUI } from '../../../../react/root/AtlasUIContext';
import { ProgressModal } from '../../primitives/ProgressModal';
import type { CollectionTransferActions } from '../hooks/useCollectionTransfer';
import { bundleMedia, vaultMedia } from './contentMedia';
import { ExportCollectionDialog } from './ExportCollectionDialog';
import { ImportReviewDialog } from './ImportReviewDialog';
import { t } from '../../../../i18n';

type CollectionTransferLayerProps = Pick<CollectionTransferActions, 'transfer' | 'confirmExport' | 'confirmImport' | 'closeTransfer'>;

/** The dialog of the export or import in progress, if any. */
export function CollectionTransferLayer({ transfer, confirmExport, confirmImport, closeTransfer }: CollectionTransferLayerProps): React.JSX.Element | null {
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
    case 'import-review':
      return <ImportReviewDialog review={transfer.review} media={media} onConfirm={(decision) => { void confirmImport(decision); }} onCancel={closeTransfer} />;
    case 'done':
      return (
        <ProgressModal
          title={transfer.title}
          message={transfer.message}
          fraction={1}
          prompt={{ actions: [{ label: t('common.close'), onSelect: closeTransfer, isPrimary: true }], onDismiss: closeTransfer }}
        />
      );
    default:
      return null;
  }
}
