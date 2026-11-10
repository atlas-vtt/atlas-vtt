import React, { useId, useState } from 'react';
import type { ImportDecision } from '../../../../services/collectionBundle/collectionImport';
import type { ChangeStatus, Resolution } from '../../../../services/collectionBundle/importPlan';
import type { ImportReview } from '../../../../services/collectionBundle/importReview';
import { formatRelativeTime } from '../../../../utils/relativeTime';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { CollectionHero } from './CollectionHero';
import { ConflictList } from './ConflictList';
import type { ContentMedia } from './contentMedia';
import { ContentsList } from './ContentsList';
import { TemplateCopies } from './TemplateCopies';
import { TransferDialog } from './TransferDialog';
import { useObjectUrl } from './useObjectUrl';
import { t } from '../../../../i18n';

interface ImportReviewDialogProps {
  review: ImportReview;
  media: ContentMedia;
  onConfirm: (decision: ImportDecision) => void;
  onCancel: () => void;
}

const COUNTED = ['added', 'updated', 'removed', 'kept'] as const satisfies readonly ChangeStatus[];

function titleOf(review: ImportReview, restore: boolean): string {
  const name = review.localName ?? review.collectionName;
  switch (review.relation) {
    case 'new': return t('importReview.title.new', { name: review.collectionName });
    case 'newer': return t('importReview.title.newer', { name });
    case 'older': return t('importReview.title.older', { name });
    case 'same': return t(review.upToDate && !restore ? 'importReview.title.upToDate' : 'importReview.title.changed', { name });
  }
}

/** Short label over the collection's name. */
function eyebrowOf(review: ImportReview, restore: boolean): string {
  if (review.relation === 'same') return review.upToDate && !restore ? t('importReview.eyebrow.upToDate') : t('importReview.eyebrow.changed');
  return t(`importReview.eyebrow.${review.relation}`);
}

function versionLabel(review: ImportReview): string {
  return review.relation === 'new' || review.installedVersion === undefined || review.installedVersion === review.version
    ? `v${review.version}`
    : `v${review.installedVersion} → v${review.version}`;
}

/**
 * Shows the collection the way its author exported it (cover, version, notes
 * and contents) and what the import would do (new, updated, removed,
 * conflicts), and collects the user's choices.
 */
export function ImportReviewDialog({ review, media, onConfirm, onCancel }: ImportReviewDialogProps): React.JSX.Element {
  const [name, setName] = useState(review.suggestedName ?? review.collectionName);
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(new Map());
  const [restore, setRestore] = useState(false);
  const [switchNotes, setSwitchNotes] = useState(false);
  const coverUrl = useObjectUrl(review.cover);
  const notesId = useId();

  const title = titleOf(review, restore);
  const counts = COUNTED.filter((status) => review.counts[status] > 0).map((status) => t(`importReview.count.${status}`, { count: review.counts[status] }));
  const canConfirm = restore || !review.upToDate;
  const itemCount = review.contents.reduce((count, group) => count + group.items.length, 0);
  const confirmLabel = restore ? t('importReview.confirm.restore') : t(`importReview.confirm.${review.relation}`);

  const confirm = (): void => {
    if (review.suggestedName !== undefined && !name.trim()) return;
    onConfirm({ name: review.suggestedName !== undefined ? name.trim() : undefined, resolutions, restore, ...(switchNotes && { switchReusedNotes: true }) });
  };

  return (
    <TransferDialog
      label={title}
      onClose={onCancel}
      ambientUrl={coverUrl}
      hero={(
        <CollectionHero
          eyebrow={eyebrowOf(review, restore)}
          imageUrl={coverUrl}
          name={review.collectionName}
          version={versionLabel(review)}
          details={[review.author ? t('common.by', { author: review.author }) : '', t('importReview.exported', { time: formatRelativeTime(review.exportedAt) })]}
          description={review.description}
        />
      )}
      summary={`${t('count.items', { count: itemCount })} · ${t('count.files', { count: review.fileCount })}`}
      actions={(
        <>
          <LabelTooltip label={canConfirm ? t('importReview.closeHint') : t('common.close')} describe>
            <Button variant="outline" onClick={onCancel}>{canConfirm ? t('common.cancel') : t('common.close')}</Button>
          </LabelTooltip>
          {canConfirm && (
            <LabelTooltip label={restore ? t('importReview.restoreHint') : review.relation === 'new' ? t('importReview.addHint') : t('importReview.applyHint')} describe>
              <Button variant={review.relation === 'older' || restore || review.publisherWarning ? 'destructive' : 'default'} className="atlas-transfer-confirm" onClick={confirm}>
                {confirmLabel}
              </Button>
            </LabelTooltip>
          )}
        </>
      )}
    >
      {review.kind === 'share' && (
        <div className="atlas-transfer-callout" role="note">{t('importReview.shared')}</div>
      )}
      {review.publisherWarning && (
        <div className="atlas-transfer-callout atlas-transfer-callout--warning" role="note">
          {review.publisherWarning === 'own-collection'
            ? t('importReview.ownCollection')
            : t('importReview.otherPublisher')}
        </div>
      )}
      {review.skippedAssets.length > 0 && (
        <div className="atlas-transfer-callout atlas-transfer-callout--warning" role="note">
          <strong>{t('importReview.skipped', { count: review.skippedAssets.length })}</strong>
          <ul>
            {review.skippedAssets.slice(0, 5).map((asset) => <li key={`${asset.name}:${asset.path}`}>{asset.name} ({asset.path})</li>)}
            {review.skippedAssets.length > 5 && <li>{t('common.andMore', { count: review.skippedAssets.length - 5 })}</li>}
          </ul>
        </div>
      )}
      {review.relation === 'older' && (
        <div className="atlas-transfer-callout atlas-transfer-callout--warning" role="note">
          {t('importReview.older', { installed: String(review.installedVersion), version: String(review.version) })}
        </div>
      )}
      {review.relation !== 'new' && !review.hasInstallRecord && (
        <div className="atlas-transfer-callout" role="note">
          {t('importReview.noRecord')}
        </div>
      )}
      {review.suggestedName !== undefined && (
        <label className="atlas-transfer-field">
          <span>{t('importReview.nameTaken', { name: review.collectionName })}</span>
          <input className="atlas-input" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
      )}
      {review.releaseNotes && (
        <section className="atlas-transfer-section" aria-labelledby={notesId}>
          <h4 id={notesId} className="atlas-transfer-section__title">{review.relation === 'new' ? t('importReview.notes') : t('importReview.whatsNew')}</h4>
          <p className="atlas-transfer-notes-view">{review.releaseNotes}</p>
        </section>
      )}
      {review.relation !== 'new' && counts.length > 0 && <p className="atlas-transfer-text">{counts.join(' · ')}</p>}
      {review.upToDate && !restore && <p className="atlas-transfer-text">{t('importReview.upToDate')}</p>}
      <ContentsList groups={review.contents} media={media} />
      {review.templates && <TemplateCopies templates={review.templates} switchNotes={switchNotes} onSwitchNotesChange={setSwitchNotes} />}
      {review.conflicts.length > 0 && !restore && (
        <ConflictList conflicts={review.conflicts} resolutions={resolutions} onChange={setResolutions} />
      )}
      {review.canRestore && (
        <label className="atlas-transfer-checkbox">
          <input type="checkbox" checked={restore} onChange={(event) => setRestore(event.target.checked)} />
          <span>{t('importReview.restore')}</span>
        </label>
      )}
      {review.relation !== 'new' && (
        <p className="atlas-transfer-hint">{t('importReview.backup')}</p>
      )}
    </TransferDialog>
  );
}
