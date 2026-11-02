import React, { useRef } from 'react';
import { Button } from '../../../packages/components/primitives/button';
import type { GallerySource, GallerySourceId } from './gallerySources';
import { t } from '../../../i18n';

const STEPS: Readonly<Record<string, 1 | -1>> = { ArrowDown: 1, ArrowUp: -1 };

export interface GallerySourceNavProps {
  sources: readonly GallerySource[];
  value: GallerySourceId;
  /** The id of the panel the tabs show. */
  panelId: string;
  onChange: (source: GallerySourceId) => void;
}

/** The gallery's sources down its left side: vertical tabs, the arrows move between them. */
export function GallerySourceNav({ sources, value, panelId, onChange }: GallerySourceNavProps): React.JSX.Element {
  const tabs = useRef(new Map<GallerySourceId, HTMLButtonElement>());

  const onKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const step = STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = sources[(index + step + sources.length) % sources.length];
    if (!next) return;
    onChange(next.id);
    tabs.current.get(next.id)?.focus();
  };

  return (
    <nav className="atlas-te-gallery__sources" role="tablist" aria-orientation="vertical" aria-label={t('statblockEditor.sources')}>
      {sources.map((source, index) => (
        <Button
          key={source.id}
          ref={(element) => {
            if (element) tabs.current.set(source.id, element);
            else tabs.current.delete(source.id);
          }}
          type="button"
          variant="ghost"
          role="tab"
          aria-selected={source.id === value}
          aria-controls={panelId}
          tabIndex={source.id === value ? 0 : -1}
          className={`atlas-te-gallery__source${source.id === value ? ' atlas-active' : ''}`}
          onClick={() => onChange(source.id)}
          onKeyDown={onKeyDown(index)}
        >
          {source.label}
        </Button>
      ))}
    </nav>
  );
}
