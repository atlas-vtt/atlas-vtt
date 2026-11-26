import React, { useEffect, useId, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { ChevronRight } from 'lucide-react';
import { t } from '../../i18n';
import { ITEM_KIND_ICON } from '../../packages/components/asset-manager/collection-transfer/itemKindIcon';
import { Button } from '../../packages/components/primitives/button';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { Skeleton, SkeletonGroup } from '../../packages/components/primitives/Skeleton';
import { useDialogEscape } from '../../packages/components/primitives/useDialogEscape';
import { useFocusTrap } from '../../packages/components/primitives/useFocusTrap';
import type { ItemKind } from '../../services/itemBundle/itemBundleFormat';
import { shareableItems, type ShareableItem } from '../../services/itemBundle/vaultItems';
import { describeError } from '../../utils/errors';
import { ShareNotice } from './steps/ShareNotice';

interface ItemSharePickerProps {
  app: App;
  kind: ItemKind;
  onPick: (item: ShareableItem) => void;
  onClose: () => void;
}

/** The vault's items of a kind as they are read: null while reading, else the list or why it could not be read. */
type Reading = { status: 'reading' } | { status: 'read'; items: ShareableItem[] } | { status: 'failed'; error: string };

function useShareableItems(app: App, kind: ItemKind): Reading {
  const [reading, setReading] = useState<Reading>({ status: 'reading' });
  useEffect(() => {
    let live = true;
    shareableItems(app, kind).then(
      (items) => { if (live) setReading({ status: 'read', items }); },
      (error: unknown) => { if (live) setReading({ status: 'failed', error: describeError(error) }); },
    );
    return () => { live = false; };
  }, [app, kind]);
  return reading;
}

function PickerBody({ reading, kind, onPick }: { reading: Reading; kind: ItemKind; onPick: (item: ShareableItem) => void }): React.JSX.Element {
  const Icon = ITEM_KIND_ICON[kind];
  if (reading.status === 'reading') {
    return (
      <SkeletonGroup className="atlas-item-pick__list" label={t('armariumShare.pick.loading')}>
        <Skeleton shape="block" className="atlas-item-pick__placeholder" />
        <Skeleton shape="block" className="atlas-item-pick__placeholder" />
      </SkeletonGroup>
    );
  }
  if (reading.status === 'failed') return <ShareNotice tone="error">{t('armariumShare.pick.failed', { error: reading.error })}</ShareNotice>;
  if (reading.items.length === 0) return <p className="atlas-transfer-text">{t(`armariumShare.pick.empty.${kind}`)}</p>;
  return (
    <ul className="atlas-item-pick__list" aria-label={t(`armariumShare.pick.title.${kind}`)}>
      {reading.items.map((item) => (
        <li key={item.id}>
          <button type="button" className="atlas-item-pick__item" onClick={() => onPick(item)}>
            <span className="atlas-item-pick__icon"><Icon aria-hidden /></span>
            <span className="atlas-item-pick__name">{item.name}</span>
            <ChevronRight className="atlas-item-pick__go" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The vault's own statblock templates, game systems or dice sets, to choose the one to share in the Armarium; where
 * the vault has none, how to make one. Built-ins are never offered: every Atlas has them.
 */
export function ItemSharePicker({ app, kind, onPick, onClose }: ItemSharePickerProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const reading = useShareableItems(app, kind);
  useDialogEscape(dialogRef, onClose);
  useFocusTrap(dialogRef);
  return (
    <div className="atlas-transfer-overlay" onClick={onClose}>
      <div ref={dialogRef} className="atlas-modal atlas-item-pick" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <div className="atlas-modal-header">
          <h3 id={titleId}>{t(`armariumShare.pick.title.${kind}`)}</h3>
          <CloseButton onClick={onClose} />
        </div>
        <div className="atlas-modal-body">
          <PickerBody reading={reading} kind={kind} onPick={onPick} />
        </div>
        <div className="atlas-modal-footer">
          <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </div>
    </div>
  );
}
