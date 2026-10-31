import React, { useId, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { STANDING_LIST } from '../../../keyboard/tooltipEscape';
import { GalleryCard } from './GalleryCard';
import { matchingNotes, noteValues, statblockTemplate, type StatblockNoteChoice } from './statblockNotes';
import { t } from '../../../i18n';

/** At most this many notes are listed; typing narrows the rest down. */
const LISTED_NOTES = 50;

export interface StatblockSourcePanelProps {
  app: App;
  notes: readonly StatblockNoteChoice[];
  selected: string | null;
  layer: HTMLElement | null;
  onSelect: (path: string) => void;
  onUse: () => void;
}

/**
 * "From a statblock" (§7.9, §6.4): the vault's statblocks to search, and the
 * chosen one as a card, drawn by the template its own values give.
 */
export function StatblockSourcePanel({ app, notes, selected, layer, onSelect, onUse }: StatblockSourcePanelProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const listId = useId();
  const found = useMemo(() => matchingNotes(notes, query), [notes, query]);
  const listed = found.slice(0, LISTED_NOTES);
  const values = useMemo(() => (selected ? noteValues(app, selected) : null), [app, selected]);
  const template = useMemo(() => (values ? statblockTemplate(values) : null), [values]);
  const chosen = notes.find((note) => note.path === selected);
  const index = listed.findIndex((note) => note.path === selected);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing || listed.length === 0) return;
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step !== 0) {
      const next = listed[(Math.max(index, step === 1 ? -1 : 0) + step + listed.length) % listed.length];
      if (next) onSelect(next.path);
    } else if (event.key === 'Enter' && template) {
      onUse();
    } else {
      return;
    }
    event.preventDefault();
  };

  return (
    <div className="atlas-te-gallery__statblocks">
      <div className="atlas-te-gallery__notes">
        <input
          type="text"
          className="atlas-te-gallery__search"
          placeholder={t('statblockEditor.findStatblock')}
          aria-label={t('statblockEditor.findStatblock')}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={index >= 0 ? `${listId}-${index}` : undefined}
          spellCheck={false}
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div id={listId} className="atlas-te-gallery__note-list" role="listbox" aria-label={t('statblockEditor.statblocks')} {...STANDING_LIST}>
          {listed.map((note, position) => (
            <div
              key={note.path}
              id={`${listId}-${position}`}
              role="option"
              aria-selected={note.path === selected}
              className="atlas-ctx-item atlas-te-gallery__note"
              data-highlighted={note.path === selected ? '' : undefined}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onSelect(note.path)}
              onDoubleClick={onUse}
            >
              <span className="atlas-ctx-item__label">{note.name}</span>
            </div>
          ))}
          {notes.length === 0 && <p className="atlas-te-gallery__empty">{t('statblockEditor.noStatblocks')}</p>}
          {notes.length > 0 && found.length === 0 && <p className="atlas-te-gallery__empty">{t('statblockEditor.noStatblockMatches')}</p>}
          {found.length > listed.length && <p className="atlas-te-gallery__empty">{t('statblockEditor.typeToFind', { count: found.length - listed.length })}</p>}
        </div>
      </div>
      <ul className="atlas-te-gallery__grid atlas-te-gallery__grid--single" role="radiogroup" aria-label={t('statblockEditor.templateFromIt')}>
        {chosen && template && (
          <GalleryCard
            app={app}
            name={chosen.name}
            look={{ kind: 'template', template, values: values ?? undefined }}
            selected
            tabbable
            layer={layer}
            onSelect={() => undefined}
            onUse={onUse}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              onUse();
            }}
          />
        )}
        {chosen && !template && <li className="atlas-te-gallery__empty">{t('statblockEditor.noValues')}</li>}
        {!chosen && notes.length > 0 && <li className="atlas-te-gallery__empty">{t('statblockEditor.chooseStatblock')}</li>}
      </ul>
    </div>
  );
}
