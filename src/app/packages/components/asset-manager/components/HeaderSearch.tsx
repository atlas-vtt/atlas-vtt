import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
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
export function HeaderSearch({ app, search, onSearch, query, label, shortcut = true, filterButton = true }: HeaderSearchProps): React.JSX.Element {
  const labelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters = query ?? PLAIN_SEARCH;
  const autocomplete = useSearchAutocomplete(search, onSearch, filters, inputRef);
  useSearchShortcut(app, inputRef, shortcut);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const hasFilters = filterButton && filters.panel !== null;

  // A tab without filters closes the panel, so it does not open again on the way back.
  useEffect(() => {
    if (!hasFilters) setFiltersOpen(false);
  }, [hasFilters]);
  const isActive = search !== '' || filters.activeCount > 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (autocomplete.onKeyDown(event)) return;
    // Collapsed, Escape closes the field first instead of the whole asset manager.
    if (event.key !== 'Escape' || toggleRef.current?.offsetParent == null) return;
    event.preventDefault();
    event.stopPropagation();
    inputRef.current?.blur();
  };

  return (
    <div className="atlas-am-search">
      <LabelTooltip label={search ? t('search.current', { query: search }) : t('search.label')}>
        <Button
          ref={toggleRef}
          variant="ghost"
          size="icon"
          className={`atlas-am-icon-btn atlas-am-search-toggle ${isActive ? 'atlas-active' : ''}`}
          onClick={() => inputRef.current?.focus()}
          aria-label={t('search.label')}
        >
          <Search />
        </Button>
      </LabelTooltip>

      <div className="atlas-asset-manager-search">
        <Search />
        <span id={labelId} hidden>{label ?? t('search.assets')}</span>
        <input
          ref={inputRef}
          type="text"
          value={search}
          placeholder={filters.panel ? t('search.placeholderFilters') : t('search.placeholder')}
          spellCheck={false}
          onKeyDown={handleKeyDown}
          aria-labelledby={labelId}
          {...autocomplete.inputProps}
        />
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
            <LabelTooltip label={t('filters.title')}>
              <Button
                ref={filtersButtonRef}
                variant="ghost"
                size="icon"
                className={`atlas-am-icon-btn atlas-am-filters-btn${filtersOpen ? ' atlas-active' : ''}`}
                disabled={!hasFilters}
                aria-expanded={filtersOpen}
                aria-haspopup="dialog"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <SlidersHorizontal />
                {filters.activeCount > 0 && <span className="atlas-am-filters-badge">{filters.activeCount}</span>}
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
