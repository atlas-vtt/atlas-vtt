import React from 'react';
import type { AtlasAccount } from '../../account/AtlasAccount';
import { CollectionHero } from '../../packages/components/asset-manager/collection-transfer/CollectionHero';
import { coverUrl } from '../../packages/components/asset-manager/collection-transfer/ExportCollectionDialog';
import { TransferDialog } from '../../packages/components/asset-manager/collection-transfer/TransferDialog';
import { useObjectUrl } from '../../packages/components/asset-manager/collection-transfer/useObjectUrl';
import { t } from '../../i18n';
import { useAtlasUI } from '../../react/root/AtlasUIContext';
import type { AnyShareSession } from '../upload/anyShareSession';
import type { CollectionShareSnapshot, ShareSnapshot } from '../upload/shareState';
import { ShareRail } from './ShareRail';
import { shareStepParts } from './shareStepParts';
import { itemKindLabel } from './shareWording';
import { useAccountState } from './useShare';
import { useListingPageReady } from './useListingPage';

interface ShareDialogProps {
  session: AnyShareSession;
  snapshot: ShareSnapshot;
  account: AtlasAccount;
  onClose: () => void;
}

/** What the hero shows of what is shared: its name, the version it becomes, its cover and what kind of thing it is. */
interface Shown {
  name: string;
  version: string;
  imageUrl: string | undefined;
  details: string[];
}

/** A collection as its listing will show it: the cover chosen for the export, the release's or fork's name and version. */
function useCollectionShown(snapshot: ShareSnapshot): Shown | null {
  const collection: CollectionShareSnapshot | null = snapshot.subject === 'collection' ? snapshot : null;
  const cover = collection?.choice?.cover ?? { kind: 'current' as const };
  const uploadUrl = useObjectUrl(cover.kind === 'upload' ? cover.image : undefined);
  if (collection === null) return null;
  const { preview, choice, bundle } = collection;
  const name = bundle?.name ?? (choice?.kind === 'fork' ? choice.name.trim() : preview.collection.name);
  return { name, version: `v${bundle?.version ?? chosenVersion(collection)}`, imageUrl: coverUrl(cover, preview, uploadUrl), details: [] };
}

/**
 * The share's own dialog, in the export dialog's frame: what is shared as the Armarium will show it, the steps beside
 * it, and the open step with its actions. Focus moves to the step's heading as each step opens.
 */
export function ShareDialog({ session, snapshot, account, onClose }: ShareDialogProps): React.JSX.Element {
  const { app } = useAtlasUI();
  const accountState = useAccountState(account);
  const collection = useCollectionShown(snapshot);
  const itemCoverUrl = useObjectUrl(snapshot.subject === 'item' ? snapshot.cover ?? undefined : undefined);
  const shown: Shown = collection ?? itemShown(snapshot, itemCoverUrl);
  const done = snapshot.step === 'done' && snapshot.published?.held === false ? snapshot.published : null;
  const listingPageReady = useListingPageReady(done?.uid != null && done.version !== null ? { uid: done.uid, version: done.version } : null);
  const parts = shareStepParts({ app, session, snapshot, account, accountState, onClose, listingPageReady });
  return (
    <TransferDialog
      label={t('armariumShare.dialogLabel', { name: shown.name })}
      onClose={onClose}
      ambientUrl={shown.imageUrl}
      hero={<CollectionHero eyebrow={t('exportDialog.shareInArmarium')} imageUrl={shown.imageUrl} name={shown.name} version={shown.version} details={shown.details} />}
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

/** A single file: the cover chosen for it (without one the Armarium draws its kind's), its kind beside the version once that is known. */
function itemShown(snapshot: ShareSnapshot, imageUrl: string | undefined): Shown {
  if (snapshot.subject !== 'item') return { name: '', version: '', imageUrl: undefined, details: [] };
  const kind = itemKindLabel(snapshot.item.kind);
  const version = snapshot.bundle?.version ?? snapshot.version;
  return version === null
    ? { name: snapshot.item.name, version: kind, imageUrl, details: [] }
    : { name: snapshot.item.name, version: `v${version}`, imageUrl, details: [kind] };
}

/** The version the share will publish before the bundle is packed: the release's, a fork's first, else the suggested one. */
function chosenVersion({ choice, preview }: CollectionShareSnapshot): number {
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
