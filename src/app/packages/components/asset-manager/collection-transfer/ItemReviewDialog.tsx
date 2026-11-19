import React, { useId, useRef } from 'react';
import type { ItemReview } from '../../../../services/itemBundle/itemImport';
import { ITEM_KIND_ICON } from './itemKindIcon';
import { Button } from '../../primitives/button';
import { CloseButton } from '../../primitives/CloseButton';
import { useDialogEscape } from '../../primitives/useDialogEscape';
import { useFocusTrap } from '../../primitives/useFocusTrap';
import { t } from '../../../../i18n';

interface ItemReviewDialogProps {
  review: ItemReview;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The four things a confirm can do: add, update, add a copy beside the GM's own, or nothing new. */
type Action = 'new' | 'update' | 'copy' | 'same';

function actionOf(review: ItemReview): Action {
  switch (review.outcome) {
    case 'new': return 'new';
    case 'update': return review.installedVersion === review.version ? 'same' : 'update';
    case 'copy': return 'copy';
    case 'reuse':
    case 'keep': return 'same';
  }
}

function outcomeText(review: ItemReview, action: Action): string {
  const { localName: name, version, installedVersion } = review;
  switch (action) {
    case 'new': return t('itemReview.outcome.new');
    case 'update': return installedVersion === null
      ? t('itemReview.outcome.updateUnknown', { version })
      : t('itemReview.outcome.update', { installed: installedVersion, version });
    case 'copy': return t(installedVersion === null ? 'itemReview.outcome.differs' : 'itemReview.outcome.copy', { name });
    case 'same': return t('itemReview.outcome.same');
  }
}

function diceSetText({ name, outcome }: NonNullable<ItemReview['diceSet']>): string {
  if (outcome === 'copy') return t('itemReview.diceSet.copy', { name });
  return t(outcome === 'reuse' || outcome === 'keep' ? 'itemReview.diceSet.same' : 'itemReview.diceSet.new', { name });
}

/**
 * The review of a single statblock template, game system or dice set before it comes into the
 * vault: what it is, who shared it, its version, what the import does with it and the dice set it
 * brings. The GM confirms or cancels; nothing is written before.
 */
export function ItemReviewDialog({ review, onConfirm, onCancel }: ItemReviewDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const notesId = useId();
  useDialogEscape(dialogRef, onCancel);
  useFocusTrap(dialogRef);
  const action = actionOf(review);
  const Icon = ITEM_KIND_ICON[review.kind];
  const meta = [t('itemReview.version', { version: review.version }), review.creator ? t('common.by', { author: review.creator }) : ''].filter(Boolean).join(' · ');

  return (
    <div className="atlas-transfer-overlay" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="atlas-modal atlas-item-review"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="atlas-modal-header">
          <h3 id={titleId}>{t(`itemReview.title.${review.kind}`)}</h3>
          <CloseButton onClick={onCancel} />
        </div>
        <div className="atlas-modal-body">
          <div className="atlas-item-review__item">
            <span className="atlas-item-review__icon"><Icon aria-hidden /></span>
            <div className="atlas-item-review__names">
              <span className="atlas-item-review__name">{review.name}</span>
              <span className="atlas-item-review__meta">{meta}</span>
            </div>
          </div>
          <p className="atlas-transfer-text">{outcomeText(review, action)}</p>
          {review.diceSet && <p className="atlas-transfer-text atlas-transfer-text--muted">{diceSetText(review.diceSet)}</p>}
          {review.notes && (
            <section className="atlas-transfer-section" aria-labelledby={notesId}>
              <h4 id={notesId} className="atlas-transfer-section__title">{t('itemReview.notes')}</h4>
              <p className="atlas-transfer-notes-view">{review.notes}</p>
            </section>
          )}
        </div>
        <div className="atlas-modal-footer">
          {action !== 'same' && <Button variant="outline" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>}
          <Button variant="default" size="sm" onClick={onConfirm} autoFocus>{t(`itemReview.confirm.${action}`)}</Button>
        </div>
      </div>
    </div>
  );
}
