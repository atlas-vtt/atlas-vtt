import React from 'react';
import { Plus } from 'lucide-react';
import { insertItemFor, itemKey, type InsertItem } from './insertItems';
import { t } from '../../../i18n';

/** The rows of a blank template's ghost card, each a kind it adds (spec §12.4); whole statblocks to start from are the gallery's. */
const GHOST_ROWS: ReadonlyArray<{ label: string; item: InsertItem }> = [
  { label: t('templateEditor.blank.value'), item: insertItemFor('stat') },
  { label: t('templateEditor.abilities'), item: insertItemFor('entries') },
  { label: t('templateEditor.blank.table'), item: insertItemFor('scores') },
  { label: t('templateEditor.primitive.text'), item: insertItemFor('text') },
];

export interface BlankCardProps {
  /** Unset while the template takes no edits. */
  onInsert?: ((item: InsertItem) => void) | undefined;
}

/** What a template that lays out no block shows under its header (spec §12.4): a ghost of a card whose rows each insert what they name. */
export function BlankCard({ onInsert }: BlankCardProps): React.JSX.Element {
  return (
    <div className="atlas-te-blank" role="group" aria-label={t('templateEditor.blank.label')}>
      {GHOST_ROWS.map(({ label, item }) => (
        <button
          key={label}
          type="button"
          className="atlas-te-blank__row atlas-te-chrome-control"
          data-row={itemKey(item)}
          disabled={!onInsert}
          onClick={() => onInsert?.(item)}
        >
          <Plus aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
