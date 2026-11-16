import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check } from 'lucide-react';
import { CollectionGlyph } from './collectionGlyph';
import type { CollectionOption } from '../types';
import { CutTooltip, isCut } from '../../../../react/components/dm-screen/sound/CutTooltip';
import { t } from '../../../../i18n';
import { portalHost } from '../../../../host/portalHost';
import { usePickerPlacement } from './usePickerPlacement';
import { useFocusTrap } from '../../primitives/useFocusTrap';

export interface CollectionPickerProps {
  collections: CollectionOption[];
  /** Id of the selected collection. */
  selectedCollection: string;
  onSelectCollection: (collectionId: string) => void;
}

/** A collection's whole name while its row cuts it, so two names that start alike stay apart. */
function cutCollectionName(option: HTMLElement): string | null {
  const name = option.querySelector<HTMLElement>('.atlas-collection-option-text');
  return name && isCut(name) ? name.textContent : null;
}

/** The next highlighted row for an arrow key, clamped to the list; null for any other key. */
function movedHighlight(key: string, highlight: number, count: number): number | null {
  if (count === 0) return null;
  if (key === 'ArrowDown') return Math.min(highlight + 1, count - 1);
  if (key === 'ArrowUp') return Math.max(highlight - 1, 0);
  return null;
}

/**
 * The sidebar's collection picker: a button that opens a searchable list (a combobox over a
 * listbox). Focus stays in the search field; the arrow keys move the highlight, Enter picks it,
 * Escape closes the list and gives focus back to the button, never closing the window behind.
 */
export function CollectionPicker({ collections, selectedCollection, onSelectCollection }: CollectionPickerProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The list hangs outside the sidebar, which clips, so a long name shows whole up to a cap (then a tooltip).
  const [popover, setPopover] = useState<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const attachPopover = useCallback((node: HTMLDivElement | null): void => {
    popoverRef.current = node;
    setPopover(node);
  }, []);
  // Tab stays in the open list's search, never moving on to the window's tabs behind it.
  useFocusTrap(popoverRef, isOpen);
  const placement = usePickerPlacement(isOpen ? trigger : null, popover);
  const listId = useId();

  const filtered = collections.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  const selectedName = collections.find((c) => c.id === selectedCollection)?.name;
  const active = Math.min(highlight, filtered.length - 1);
  const optionId = (index: number): string => `${listId}-${index}`;

  const open = (): void => {
    setQuery('');
    setHighlight(Math.max(0, collections.findIndex((c) => c.id === selectedCollection)));
    setIsOpen(true);
  };
  const close = (refocus: boolean): void => {
    setIsOpen(false);
    setQuery('');
    if (refocus) trigger?.focus();
  };
  const pick = (collectionId: string): void => {
    onSelectCollection(collectionId);
    close(true);
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const doc = rootRef.current?.ownerDocument ?? document;
    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popover?.contains(target)) close(false);
    };
    doc.addEventListener('mousedown', handleClickOutside);
    return () => doc.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, popover]);

  // The highlighted row stays in view as the arrows move it.
  useEffect(() => {
    if (isOpen && active >= 0) listRef.current?.querySelector(`[id="${optionId(active)}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [isOpen, active]);

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    const moved = movedHighlight(event.key, active, filtered.length);
    if (moved !== null) setHighlight(moved);
    else if (event.key === 'Enter' && filtered[active]) pick(filtered[active].id);
    else if (event.key === 'Escape') close(true);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    event.stopPropagation();
    if (!isOpen) open();
  };

  return (
    <div className={`atlas-collection-dropdown ${isOpen ? 'atlas-open' : ''}`} ref={rootRef}>
      <button
        ref={setTrigger}
        type="button"
        className={`atlas-collection-dropdown-trigger ${isOpen ? 'atlas-open' : ''}`}
        onClick={(e) => { e.stopPropagation(); if (isOpen) close(false); else open(); }}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        {...(isOpen && filtered.length > 0 && { 'aria-controls': listId })}
      >
        <span className="atlas-collection-selected">
          <CollectionGlyph />
          <span>{selectedName ?? selectedCollection}</span>
        </span>
        <ChevronDown className={`atlas-collection-chevron ${isOpen ? 'atlas-rotated' : ''}`} />
      </button>

      {isOpen && createPortal(
        <div ref={attachPopover} className="atlas-collection-dropdown-content atlas-collection-dropdown-content--anchored" style={placement} data-placed={placement ? '' : undefined}>
          <div className="atlas-collection-search">
            <Search className="atlas-collection-search-icon" />
            <input
              type="text"
              role="combobox"
              aria-label={t('creator.searchCollections')}
              aria-autocomplete="list"
              aria-expanded={filtered.length > 0}
              {...(filtered.length > 0 && { 'aria-controls': listId })}
              {...(active >= 0 && { 'aria-activedescendant': optionId(active) })}
              placeholder={t('creator.searchCollections')}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
              onKeyDown={handleSearchKeyDown}
              className="atlas-collection-search-input"
              autoFocus
            />
          </div>
          {filtered.length > 0 && <div ref={listRef} id={listId} className="atlas-collection-options" role="listbox" aria-label={t('assetGrid.collections')}>
            {filtered.map((collection, index) => (
              <CutTooltip key={collection.id} wholeOf={cutCollectionName}>
                <button
                  id={optionId(index)}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={selectedCollection === collection.id}
                  {...(index === active && { 'data-highlighted': '' })}
                  className={`atlas-collection-option ${selectedCollection === collection.id ? 'atlas-selected' : ''} ${index === active ? 'atlas-active' : ''}`}
                  onClick={() => pick(collection.id)}
                  onPointerMove={() => setHighlight(index)}
                >
                  <div className="atlas-collection-option-content">
                    <CollectionGlyph className="atlas-collection-option-icon" />
                    <span className="atlas-collection-option-text">{collection.name}</span>
                  </div>
                  <Check className="atlas-collection-check" />
                </button>
              </CutTooltip>
            ))}
          </div>}
          {filtered.length === 0 && query && (
            <div className="atlas-collection-no-results" role="status">{t('creator.noCollections')}</div>
          )}
        </div>,
        // Into the window's container, outside the clipping sidebar: a press outside the container closes the asset manager.
        trigger?.closest<HTMLElement>('.atlas-asset-manager-container') ?? portalHost(trigger?.ownerDocument),
      )}
    </div>
  );
}
