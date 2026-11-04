import React, { useRef } from 'react';
import type { App } from 'obsidian';
import type { LibraryTemplate } from '../../model/resolvedTypes';
import type { TemplateId } from '../../model/templateTypes';
import { GalleryCard, type CardLook } from './GalleryCard';
import { t } from '../../../i18n';

/** A card of the grid: a template of the library, or the blank template. */
export interface GridItem {
  id: string;
  name: string;
  look: CardLook;
  /** A muted line under the name ("12 statblocks to move"). */
  detail?: string | undefined;
}

export function templateItem(entry: LibraryTemplate): GridItem {
  return { id: entry.template.id, name: entry.name, look: { kind: 'template', template: entry.template } };
}

export const BLANK_ITEM: GridItem = { id: 'blank', name: t('statblockEditor.blank'), look: { kind: 'blank' } };

const STEPS: Readonly<Record<string, 1 | -1>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export interface TemplateGridProps {
  app: App;
  label: string;
  items: readonly GridItem[];
  selected: TemplateId | null;
  layer: HTMLElement | null;
  onSelect: (id: string) => void;
  onUse: (id: string) => void;
}

/**
 * The cards of a source as one radio group: Tab reaches the chosen card, the
 * arrows choose the next or previous one, Enter or a double click uses it.
 */
export function TemplateGrid({ app, label, items, selected, layer, onSelect, onUse }: TemplateGridProps): React.JSX.Element {
  const radios = useRef(new Map<string, HTMLButtonElement>());
  const tabbable = items.some((item) => item.id === selected) ? selected : items[0]?.id ?? null;

  const onKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const step = STEPS[event.key];
    const item = items[index];
    if (event.key === 'Enter' && item) {
      onUse(item.id);
    } else if (step !== undefined || event.key === 'Home' || event.key === 'End') {
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (step ?? 0) + items.length) % items.length;
      const next = items[target];
      if (!next) return;
      onSelect(next.id);
      radios.current.get(next.id)?.focus();
    } else {
      return;
    }
    event.preventDefault();
  };

  return (
    <ul className="atlas-te-gallery__grid" role="radiogroup" aria-label={label}>
      {items.map((item, index) => (
        <GalleryCard
          key={item.id}
          ref={(element) => {
            if (element) radios.current.set(item.id, element);
            else radios.current.delete(item.id);
          }}
          app={app}
          name={item.name}
          look={item.look}
          detail={item.detail}
          selected={item.id === selected}
          tabbable={item.id === tabbable}
          layer={layer}
          onSelect={() => onSelect(item.id)}
          onUse={() => onUse(item.id)}
          onKeyDown={onKeyDown(index)}
        />
      ))}
    </ul>
  );
}
