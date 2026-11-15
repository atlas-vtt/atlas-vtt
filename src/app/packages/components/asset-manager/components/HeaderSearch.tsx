import React, { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { App } from 'obsidian';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { PLAIN_SEARCH, type FilterSearch } from '../hooks/useFilterSearch';
import { useSearchAutocomplete } from '../hooks/useSearchAutocomplete';
import { useSearchShortcut } from '../hooks/useSearchShortcut';
import { AdvancedFilterPanel } from './search/AdvancedFilterPanel';
import { SearchSuggestions } from './search/SearchSuggestions';
import { t } from '../../../../i18n';
import { modShortcut } from '../utils/modShortcut';

export interface HeaderSearchProps {
  app: App;
  search: string;
  onSearch: (value: string) => void;
  /**
   * Filters typed as `keyword:value`, and the filter panel on the Characters tab. Without it the
   * field searches plain text and has no filter button.
   */
  query?: FilterSearch;
  /** What the field searches, for screen readers; assets unless given. */
  label?: string;
  /** Whether Cmd/Ctrl+F focuses the field while it is mounted; leave it off where the field stays mounted out of sight. */
  shortcut?: boolean;
  /** Whether the tooltips name Cmd/Ctrl+F; by default where the field registers it, also where its window does. */
  shortcutShown?: boolean;
  /** Offers the filter panel at the field's end; off where the filters are shown beside the field anyway. */
  filterButton?: boolean;
}

/**
 * The asset search. Typed `keyword:value` tokens become filters, with
 * suggestions for keywords and the values in view; the button at its end opens
 * the filter panel. On narrow headers the search collapses to a button; the
 * field then opens over the toolbar row while it has focus (see `_header.scss`),
 * so Cmd/Ctrl+F opens it as well.
 */
export function HeaderSearch({
  app, search, onSearch, query, label, shortcut = true, shortcutShown = shortcut, filterButton = true,
}: HeaderSearchProps): React.JSX.Element {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters = query ?? PLAIN_SEARCH;
  const autocomplete = useSearchAutocomplete(search, onSearch, filters, inputRef);
  useSearchShortcut(app, inputRef, shortcut);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const hasFilters = filterButton && filters.panel !== null;
  const focusKey = shortcutShown ? modShortcut('f') : null;
  const focusKeycap = focusKey ? { shortcut: focusKey.label } : {};

  // A tab without filters closes the panel, so it does not open again on the way back.
  useEffect(() => {
    if (!hasFilters) setFiltersOpen(false);
  }, [hasFilters]);
  const isActive = search !== '' || filters.activeCount > 0;

  /**
   * Escape takes one layer per press, as Spotlight and VS Code do: the suggestions close (the
   * autocomplete), then the query clears, then focus leaves the field for the window it lies
   * in, whose next Escape is its own (closing the asset manager).
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (autocomplete.onKeyDown(event) || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (search !== '') {
      onSearch('');
      return;
    }
    const input = inputRef.current;
    input?.blur();
    // Focus stays in the window, whose keys stay live: a collapsed field closes with it.
    input?.parentElement?.closest<HTMLElement>('[tabindex="-1"]')?.focus({ preventScroll: true });
  };

  return (
    <div className="atlas-am-search">
      <LabelTooltip label={search ? t('search.current', { query: search }) : t('search.label')} {...focusKeycap}>
        <Button
          ref={toggleRef}
          variant="ghost"
          size="icon"
          className={`atlas-am-icon-btn atlas-am-search-toggle ${isActive ? 'atlas-active' : ''}`}
          onClick={() => inputRef.current?.focus()}
          aria-label={t('search.label')}
          aria-keyshortcuts={focusKey?.aria}
        >
          <Search />
        </Button>
      </LabelTooltip>

      <div className="atlas-asset-manager-search">
        <Search />
        {/* Names the key on hover; never while the field has focus, where the suggestions hang. */}
        <LabelTooltip
          label={t('search.label')}
          {...focusKeycap}
          describe
          suppressed={!focusKey}
          opensWhen={() => inputRef.current !== inputRef.current?.ownerDocument.activeElement}
        >
          <input
            ref={inputRef}
            type="text"
            value={search}
            placeholder={filters.panel ? t('search.placeholderFilters') : t('search.placeholder')}
            spellCheck={false}
            onKeyDown={handleKeyDown}
            aria-label={label ?? t('search.assets')}
            aria-keyshortcuts={focusKey?.aria}
            {...autocomplete.inputProps}
          />
        </LabelTooltip>
        {search && (
          <LabelTooltip label={t('common.clearSearch')}>
            <Button
              variant="ghost"
              size="icon"
              className="atlas-am-icon-btn"
              // Keeps focus in the field, which keeps a collapsed search open.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSearch('')}
            >
              <X />
            </Button>
          </LabelTooltip>
        )}
        {/* On every tab of the asset manager, so the field keeps its size; tabs without a filter panel yet disable it. */}
        {query && filterButton && (
          <>
            <span className="atlas-am-search-divider" aria-hidden="true" />
            {/* The name holds the badge's count, which it shows (axe label-content-name-mismatch). */}
            <LabelTooltip label={filters.activeCount > 0 ? t('assetGrid.filtersActive', { count: filters.activeCount }) : t('filters.title')}>
              <Button
                ref={filtersButtonRef}
                variant="ghost"
                size="icon"
                className={`atlas-am-icon-btn atlas-am-filters-btn${filtersOpen ? ' atlas-active' : ''}`}
                disabled={!hasFilters}
                aria-expanded={filtersOpen}
                aria-haspopup="dialog"
                // A transition: React renders the panel (about 200 elements, four histograms with sliders) in slices
                // between frames instead of in the click's task, which dropped the frame the panel entered on (F4).
                onClick={() => startTransition(() => setFiltersOpen(!filtersOpen))}
              >
                <SlidersHorizontal />
                {/* The active filters are listed as chips; the digit is for the eye, so the name stays "Filters". */}
                {filters.activeCount > 0 && <span className="atlas-am-filters-badge" aria-hidden="true">{filters.activeCount}</span>}
              </Button>
            </LabelTooltip>
          </>
        )}
        {autocomplete.suggestions && !filtersOpen && (
          <SearchSuggestions
            id={autocomplete.listId}
            suggestions={autocomplete.suggestions}
            highlight={autocomplete.highlight}
            onHighlight={autocomplete.setHighlight}
            onPick={autocomplete.pick}
          />
        )}
      </div>

      <AnimatePresence>
        {filtersOpen && filters.panel && (
          <AdvancedFilterPanel
            key="filters"
            panel={filters.panel}
            onClose={closeFilters}
            onReset={filters.reset}
            anchorRef={filtersButtonRef}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
