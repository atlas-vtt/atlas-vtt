import React from 'react';
import type { ContentItem } from '../../../../services/collectionBundle/bundleContents';
import type { NoteOrigin } from '../../../../services/collectionBundle/noteTree';
import { plural } from '../../../../utils/plural';
import { Checkbox, itemState, withKeys, type ContentSelection } from './contentSelection';
import { VirtualGrid } from './VirtualGrid';
import { t } from '../../../../i18n';

interface ItemGridProps {
  items: readonly ContentItem[];
  selection?: ContentSelection | undefined;
  /** One item per row, for notes: each is indented below the note that led to it. */
  tree?: boolean;
}

/** Deeper notes stop moving right here, so their names keep room in a narrow dialog. */
const MAX_INDENT_LEVELS = 6;

function originLabel({ kind, name, more }: NoteOrigin): string {
  const others = more > 0 ? ` and ${more} more` : '';
  return kind === 'scene' ? `Opened in ${name}${others}` : `Linked from ${name}${others}`;
}

function ItemRow({ item, selection }: { item: ContentItem; selection?: ContentSelection | undefined }): React.JSX.Element {
  const state = itemState(selection, item.key);
  const orphaned = state === 'orphaned';
  const indent = { '--atlas-transfer-item-level': Math.min(item.depth ?? 0, MAX_INDENT_LEVELS) } as React.CSSProperties;
  const details = (
    <>
      <span className="atlas-transfer-item__name">{item.name}</span>
      {orphaned
        ? <span className="atlas-transfer-item__hint">{t('contents.orphaned')}</span>
        : item.origin && <span className="atlas-transfer-chip atlas-transfer-chip--quiet">{originLabel(item.origin)}</span>}
      {item.linked !== undefined && <span className="atlas-transfer-item__linked">{plural(item.linked, 'linked note')}</span>}
    </>
  );
  return (
    <div className="atlas-transfer-item" role="listitem" data-orphaned={orphaned || undefined} style={indent}>
      {selection ? (
        <label className="atlas-transfer-item__label">
          <Checkbox
            checked={state === 'included'}
            disabled={orphaned}
            onChange={(event) => selection.onChange(withKeys(selection.excluded, [item.key], event.target.checked))}
          />
          {details}
        </label>
      ) : details}
    </div>
  );
}

/** The names of a kind's items in columns, rendered only as far as the pane shows them. */
export function ItemGrid({ items, selection, tree = false }: ItemGridProps): React.JSX.Element {
  return (
    <VirtualGrid
      items={items}
      minColumnWidth={tree ? Number.POSITIVE_INFINITY : 220}
      rowHeight={28}
      rowGap={0}
      columnGap={16}
      className="atlas-transfer-item-grid"
      itemKey={(item) => item.key}
      renderItem={(item) => <ItemRow item={item} selection={selection} />}
    />
  );
}
