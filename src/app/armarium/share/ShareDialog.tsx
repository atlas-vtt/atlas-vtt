import React from 'react';
import type { AtlasAccount } from '../../account/AtlasAccount';
import { CollectionHero } from '../../packages/components/asset-manager/collection-transfer/CollectionHero';
import { coverUrl } from '../../packages/components/asset-manager/collection-transfer/ExportCollectionDialog';
import { TransferDialog } from '../../packages/components/asset-manager/collection-transfer/TransferDialog';
import { useObjectUrl } from '../../packages/components/asset-manager/collection-transfer/useObjectUrl';
import { t } from '../../i18n';
import { useAtlasUI } from '../../react/root/AtlasUIContext';
import type { ShareSession } from '../upload/ShareSession';
import type { ShareSnapshot } from '../upload/shareState';
import { ShareRail } from './ShareRail';
import { shareStepParts } from './shareStepParts';
import { useAccountState } from './useShare';

interface ShareDialogProps {
  session: ShareSession;
  snapshot: ShareSnapshot;
  account: AtlasAccount;
  onClose: () => void;
}

/**
 * The share's own dialog, in the export dialog's frame: the collection as the Armarium will show it, the steps beside
 * it, and the open step with its actions. Focus moves to the step's heading as each step opens.
 */
export function ShareDialog({ session, snapshot, account, onClose }: ShareDialogProps): React.JSX.Element {
  const { app } = useAtlasUI();
  const accountState = useAccountState(account);
  const { preview, choice, bundle } = snapshot;
  const cover = choice?.cover ?? { kind: 'current' as const };
  const uploadUrl = useObjectUrl(cover.kind === 'upload' ? cover.image : undefined);
  const imageUrl = coverUrl(cover, preview, uploadUrl);
  const name = bundle?.name ?? (choice?.kind === 'fork' ? choice.name.trim() : preview.collection.name);
  const version = bundle?.version ?? chosenVersion(snapshot);
  const parts = shareStepParts({ app, session, snapshot, account, accountState, onClose });
  return (
    <TransferDialog
      label={t('armariumShare.dialogLabel', { name })}
      onClose={onClose}
      ambientUrl={imageUrl}
      hero={<CollectionHero eyebrow={t('exportDialog.shareInArmarium')} imageUrl={imageUrl} name={name} version={`v${version}`} details={[]} />}
      aside={<ShareRail snapshot={snapshot} accountState={accountState} />}
      summary={parts.summary}
      actions={parts.actions}
    >
      <section className="atlas-share-step" data-step={snapshot.step} aria-labelledby="atlas-share-step-title">
        <StepTitle key={snapshot.step} title={parts.title} />
        {parts.body}
      </section>
    </TransferDialog>
  );
}

/** The version the share will publish before the bundle is packed: the release's, a fork's first, else the suggested one. */
function chosenVersion({ choice, preview }: ShareSnapshot): number {
  if (choice?.kind === 'release') return choice.version;
  if (choice?.kind === 'fork') return 1;
  return preview.suggestedVersion;
}

/** The open step's heading; it takes focus when a step opens after the first, so a screen reader hears where it is. */
function StepTitle({ title }: { title: string }): React.JSX.Element {
  const ref = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    const heading = ref.current;
    const active = heading?.ownerDocument.activeElement ?? null;
    // Only where focus is the dialog's, or was lost with the button of the step before.
    if (heading && (active === null || active === heading.ownerDocument.body || active.closest('.atlas-transfer-dialog') !== null)) heading.focus({ preventScroll: true });
  }, []);
  return <h3 ref={ref} id="atlas-share-step-title" className="atlas-share-step__title" tabIndex={-1}>{title}</h3>;
}
