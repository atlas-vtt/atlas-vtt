import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Folder } from 'lucide-react';
import { normalizePath, type App, type TFolder } from 'obsidian';
import { cn } from '../../../utils/cn';
import { t } from '../../i18n';

/** At most this many folders are suggested; typing narrows the list. */
const MAX_SUGGESTIONS = 50;

/** Whether a path lies in a dot folder, which Obsidian does not index. */
const isHidden = (path: string): boolean => path.split('/').some((segment) => segment.startsWith('.'));

/** A folder path as it is stored: no surrounding space or slashes; empty for Obsidian's location for new notes. */
export function folderPathOf(text: string): string {
  const trimmed = text.trim();
  return trimmed ? normalizePath(trimmed).replace(/^\/+|\/+$/g, '') : '';
}

/**
 * The folders offered for what was typed: those whose name begins with it first, then those
 * whose path does, then any that contain it, each group in path order. The folder typed
 * exactly is not offered again.
 */
export function folderSuggestions(folders: readonly TFolder[], typed: string): string[] {
  const needle = typed.trim().toLowerCase();
  const rank = (path: string): number => {
    const lower = path.toLowerCase();
    if (!needle) return 0;
    if ((lower.split('/').pop() ?? '').startsWith(needle)) return 0;
    if (lower.startsWith(needle)) return 1;
    return lower.includes(needle) ? 2 : -1;
  };
  return folders
    .map((folder) => folder.path)
    .filter((path) => path && path !== '/' && !isHidden(path) && path.toLowerCase() !== needle)
    .map((path) => ({ path, rank: rank(path) }))
    .filter(({ rank: order }) => order >= 0)
    .sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path))
    .slice(0, MAX_SUGGESTIONS)
    .map(({ path }) => path);
}

interface FolderFieldProps {
  app: App;
  /** The folder as stored or typed; empty for Obsidian's location for new notes. */
  value: string;
  onChange: (folder: string) => void;
  /** Names the field for screen readers. */
  label: string;
  /** What an empty field means; Obsidian's location for new notes where not given. */
  placeholder?: string;
}

/**
 * A vault folder, typed or picked from the vault's folders as they match. A folder that does
 * not exist yet may be typed. The suggestions are the field's own list: arrow keys move through
 * them, Enter picks, Escape closes them.
 */
export function FolderField({ app, value, onChange, label, placeholder = t('statblockEditor.folderDefault') }: FolderFieldProps): React.JSX.Element {
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const suggestions = useMemo(() => (open ? folderSuggestions(app.vault.getAllFolders(false), value) : []), [app, open, value]);
  const showing = open && suggestions.length > 0;
  const active = Math.min(highlight, suggestions.length - 1);
  const optionId = (index: number): string => `${listId}-${index}`;

  useEffect(() => {
    if (showing) listRef.current?.ownerDocument.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [showing, active, listId]);

  const type = (text: string): void => {
    onChange(text);
    setHighlight(0);
    setOpen(true);
  };

  const pick = (path: string): void => {
    onChange(path);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!showing) {
        setOpen(true);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((active + step + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && showing) {
      event.preventDefault();
      pick(suggestions[active]!);
    } else if (event.key === 'Escape' && showing) {
      // The list takes the key; the dialog stays open (`handledByAnotherControl`).
      event.preventDefault();
      setOpen(false);
    }
  };

  const leave = (): void => {
    setOpen(false);
    const path = folderPathOf(value);
    if (path !== value) onChange(path);
  };

  return (
    <div className={cn('atlas-sb-folder-field', showing && 'atlas-open')}>
      <Folder className="atlas-sb-folder-field__icon" aria-hidden="true" />
      <input
        type="text"
        role="combobox"
        className="atlas-csm-input atlas-sb-folder-field__input"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={showing}
        aria-controls={showing ? listId : undefined}
        aria-activedescendant={showing ? optionId(active) : undefined}
        placeholder={placeholder}
        spellCheck={false}
        value={value}
        onChange={(event) => type(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={leave}
        onKeyDown={onKeyDown}
      />
      {showing && (
        // Pressing a folder keeps the focus in the field, so it is picked before the field is left.
        <div ref={listRef} id={listId} role="listbox" aria-label={t('statblockEditor.folders')} className="atlas-sb-folder-field__list" onMouseDown={(event) => event.preventDefault()}>
          {suggestions.map((path, index) => (
            <div
              key={path}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className={cn('atlas-sb-folder-field__option', index === active && 'atlas-active')}
              onMouseMove={() => { if (index !== active) setHighlight(index); }}
              onClick={() => pick(path)}
            >
              {path}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
