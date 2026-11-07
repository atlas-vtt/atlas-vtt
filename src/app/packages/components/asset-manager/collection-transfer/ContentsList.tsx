import React, { useId, useState } from 'react';
import { ChevronDown, CircleUser, Clapperboard, Coins, LayoutTemplate, Map as MapIcon, NotebookText, Paperclip, ScrollText, Swords, type LucideIcon } from 'lucide-react';
import type { ContentCategory, ContentGroup } from '../../../../services/collectionBundle/bundleContents';
import type { ContentMedia } from './contentMedia';
import { Checkbox, withKeys, type ContentSelection } from './contentSelection';
import { ItemGrid } from './ItemGrid';
import { TokenGrid } from './TokenGrid';
import { t } from '../../../../i18n';

interface ContentsListProps {
  groups: readonly ContentGroup[];
  media: ContentMedia;
  /** Without a selection the list only shows what is included. */
  selection?: ContentSelection | undefined;
}

interface GroupRowProps {
  group: ContentGroup;
  media: ContentMedia;
  selection?: ContentSelection | undefined;
}

const ICONS: Record<ContentCategory, LucideIcon> = {
  scenes: Clapperboard, maps: MapIcon, tokens: CircleUser, encounters: Swords, statblocks: ScrollText, templates: LayoutTemplate, notes: NotebookText, attachments: Paperclip, loot: Coins,
};

function GroupRow({ group, media, selection }: GroupRowProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  // Items mount on first opening and stay, so closing animates and reopening is instant.
  const [opened, setOpened] = useState(false);
  const id = useId();
  const Icon = ICONS[group.category];
  const keys = group.items.map((item) => item.key);
  const total = keys.length;
  const included = selection ? keys.filter((key) => selection.included.has(key)).length : total;
  const leftOut = selection ? keys.filter((key) => selection.excluded.has(key)).length : 0;
  const count = total === 0 ? t('contents.none') : included === total ? String(total) : t('contents.countOf', { count: included, total });
  return (
    <li className="atlas-transfer-group" data-empty={total === 0 || undefined}>
      <div className="atlas-transfer-group__header">
        {selection && (
          <Checkbox
            aria-labelledby={`${id}-all`}
            checked={total > 0 && leftOut === 0}
            indeterminate={leftOut > 0 && leftOut < total}
            disabled={total === 0}
            onChange={() => selection.onChange(withKeys(selection.excluded, keys, leftOut > 0))}
          />
        )}
        <button
          type="button"
          className="atlas-transfer-group__trigger"
          aria-expanded={expanded}
          aria-controls={`${id}-items`}
          disabled={total === 0}
          onClick={() => {
            setExpanded(!expanded);
            setOpened(true);
          }}
        >
          <Icon className="atlas-transfer-group__icon" aria-hidden="true" />
          <span className="atlas-transfer-group__label">{group.label}</span>
          <span className="atlas-transfer-group__count">{count}</span>
          <ChevronDown className="atlas-transfer-group__chevron" aria-hidden="true" />
        </button>
        {selection && <span id={`${id}-all`} hidden>{t('contents.includeAll', { group: group.label.toLocaleLowerCase() })}</span>}
      </div>
      <div id={`${id}-items`} className="atlas-transfer-group__panel" data-expanded={expanded} aria-hidden={!expanded} inert={!expanded}>
        <div className="atlas-transfer-group__clip">
          {opened && (
            <div className="atlas-transfer-group__items">
              {group.category === 'tokens'
                ? <TokenGrid items={group.items} media={media} selection={selection} />
                : <ItemGrid items={group.items} selection={selection} tree={group.category === 'notes'} />}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** A collection's contents by kind, each kind expandable to list its items (tokens as cards). */
export function ContentsList({ groups, media, selection }: ContentsListProps): React.JSX.Element {
  const titleId = useId();
  return (
    <section className="atlas-transfer-section" aria-labelledby={titleId}>
      <h4 id={titleId} className="atlas-transfer-section__title">What&rsquo;s included</h4>
      <ul className="atlas-transfer-groups">
        {groups.map((group) => <GroupRow key={group.category} group={group} media={media} selection={selection} />)}
      </ul>
    </section>
  );
}
