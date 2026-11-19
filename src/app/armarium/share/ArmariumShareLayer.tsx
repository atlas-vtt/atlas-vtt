import React from 'react';
import { AtlasAccount } from '../../account/AtlasAccount';
import type { ContentMedia } from '../../packages/components/asset-manager/collection-transfer/contentMedia';
import { ExportCollectionDialog } from '../../packages/components/asset-manager/collection-transfer/ExportCollectionDialog';
import { useAtlasUI } from '../../react/root/AtlasUIContext';
import type { ShareSession } from '../upload/ShareSession';
import { UPLOAD_LIMITS } from '../upload/uploadContract';
import { ShareDialog } from './ShareDialog';
import { useShareClose, useShareSnapshot } from './useShare';

interface ArmariumShareLayerProps {
  session: ShareSession;
  media: ContentMedia;
  onClose: () => void;
}

/**
 * "Share in the Armarium" over the asset manager: the export's own dialog where the GM chooses what to share (in the
 * Armarium's words), the share dialog for every other step.
 */
export function ArmariumShareLayer({ session, media, onClose }: ArmariumShareLayerProps): React.JSX.Element | null {
  const { app } = useAtlasUI();
  const snapshot = useShareSnapshot(session);
  const close = useShareClose(session, onClose);
  const account = AtlasAccount.forApp(app);
  if (account === null) return null;
  if (snapshot.step === 'bundle') {
    return <ExportCollectionDialog purpose="armarium" maxBytes={UPLOAD_LIMITS.maxBytes} preview={snapshot.preview} media={media} onExport={(choice) => session.confirmBundle(choice)} onCancel={close} />;
  }
  return <ShareDialog session={session} snapshot={snapshot} account={account} onClose={close} />;
}
