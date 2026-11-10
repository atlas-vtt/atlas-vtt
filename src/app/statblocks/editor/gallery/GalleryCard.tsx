import React, { forwardRef, useMemo } from 'react';
import type { App } from 'obsidian';
import { sampleRecord } from '../../model/sampleValues';
import type { StatblockTemplate } from '../../model/templateTypes';
import { StatblockSheet } from '../../render/StatblockSheet';
import type { FieldRecord } from '../../values/fieldValues';
import { AttributionButton } from './AttributionPopover';
import { sourceLine } from './gallerySources';

/** The four placeholder rows a blank template starts with (§7.9). */
const GHOST_ROWS = ['Name', 'Line', 'Stats', 'Actions'];

/** What a card shows: a template drawn by the real renderer, or the blank template's ghost. */
export type CardLook = { kind: 'template'; template: StatblockTemplate; values?: FieldRecord | undefined } | { kind: 'blank' };

function CardRender({ app, look, name }: { app: App; look: CardLook; name: string }): React.JSX.Element {
  const template = look.kind === 'template' ? look.template : null;
  const values = look.kind === 'template' ? look.values : undefined;
  // A template's card is titled with the template's own name, so cards tell apart at a glance.
  const record = useMemo(() => values ?? (template ? { ...sampleRecord(template), name } : {}), [values, template, name]);
  if (!template) {
    return (
      <div className="atlas-te-gallery-card__ghost">
        {GHOST_ROWS.map((row) => <span key={row} className="atlas-te-gallery-card__ghost-row">{row}</span>)}
      </div>
    );
  }
  return <StatblockSheet template={template} name={name} fields={record} variant="feed" app={app} rollBonuses="preview" />;
}

export interface GalleryCardProps {
  app: App;
  name: string;
  look: CardLook;
  /** A muted line under the name, in place of a source line. */
  detail?: string | undefined;
  selected: boolean;
  /** One card of the group takes Tab; the arrows move between them. */
  tabbable: boolean;
  /** Where the attribution popover is drawn. */
  layer: HTMLElement | null;
  onSelect: () => void;
  /** Double click or Enter: Use template. */
  onUse: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * One template in the gallery (§7.9): a real 320 px render, scaled into a
 * 200 px frame, its name, and for a licensed built-in the source line with an
 * info button for the full attribution. The frame takes no input; a click
 * anywhere on the card chooses it.
 */
export const GalleryCard = forwardRef<HTMLButtonElement, GalleryCardProps>((props, ref) => {
  const { app, name, look, detail, selected, tabbable, layer, onSelect, onUse, onKeyDown } = props;
  const source = look.kind === 'template' ? look.template.source : undefined;
  const line = look.kind === 'template' ? sourceLine(look.template) : null;

  return (
    <li className="atlas-te-gallery-card" data-selected={selected || undefined} onClick={onSelect} onDoubleClick={onUse}>
      <div className="atlas-te-gallery-card__frame" aria-hidden="true" inert>
        <div className="atlas-te-gallery-card__render">
          <CardRender app={app} look={look} name={name} />
        </div>
      </div>
      <div className="atlas-te-gallery-card__caption">
        <button
          ref={ref}
          type="button"
          role="radio"
          aria-checked={selected}
          tabIndex={tabbable ? 0 : -1}
          className="atlas-te-gallery-card__name"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          onKeyDown={onKeyDown}
        >
          {name}
        </button>
        {detail !== undefined && (
          <div className="atlas-te-gallery-card__source">
            <span className="atlas-te-gallery-card__source-text">{detail}</span>
          </div>
        )}
        {detail === undefined && source && line && (
          <div className="atlas-te-gallery-card__source">
            <span className="atlas-te-gallery-card__source-text">{line}</span>
            <AttributionButton source={source} name={name} layer={layer} />
          </div>
        )}
      </div>
    </li>
  );
});

GalleryCard.displayName = 'GalleryCard';
