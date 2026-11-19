import React from 'react';
import { t } from '../../../i18n';
import type { ItemShareSession } from '../../upload/ItemShareSession';
import { ITEM_NOTES_LIMITS, type ItemShareSnapshot } from '../../upload/shareState';
import { itemKindLabel } from '../shareWording';
import { CountedText } from './ListingFields';

/**
 * A single file's own step: what it is, the version it becomes (the first of a new listing, or the next of the
 * account's listing of it) and, for a next version, what changed, which whoever updates reads.
 */
export function ItemStep({ snapshot, session }: { snapshot: ItemShareSnapshot; session: ItemShareSession }): React.JSX.Element {
  const { item, version, notes, problems } = snapshot;
  const update = version !== null && version > 1;
  return (
    <div className="atlas-share-form">
      <p className="atlas-share-text atlas-share-text--muted">{update ? t('armariumShare.item.updateIntro') : t('armariumShare.item.newIntro')}</p>
      <dl className="atlas-share-facts">
        <dt>{t('armariumShare.kind')}</dt>
        <dd>{itemKindLabel(item.kind)}</dd>
        <dt>{t('armariumShare.fromBundle.name')}</dt>
        <dd>{item.name}</dd>
        <dt>{t('armariumShare.item.version')}</dt>
        <dd>{update ? t('armariumShare.item.nextVersion', { version }) : t('armariumShare.item.newListing')}</dd>
      </dl>
      {update && (
        <CountedText
          label={t('armariumShare.item.notes')}
          hint={t('armariumShare.item.notesHint')}
          value={notes}
          onChange={(text) => session.setNotes(text)}
          limits={ITEM_NOTES_LIMITS}
          rows={4}
          field="notes"
          problems={problems}
        />
      )}
    </div>
  );
}
