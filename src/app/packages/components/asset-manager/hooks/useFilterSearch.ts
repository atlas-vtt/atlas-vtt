import { useCallback, useMemo } from 'react';
import { emptyCreatureSelection, type CreatureFilterDefinition } from '../../../../types/creatureFilterTypes';
import { keywordLookup, parseQuery } from '../../../../search/querySyntax';
import type { Tab, Tag } from '../types';
import { activeFilterChips, type FilterChipGroup } from '../search/activeFilterChips';
import { applyFilterTokens } from '../search/applyFilterTokens';
import { filterKeywords, type FilterKeyword } from '../search/filterKeywords';
import { filterSuggestions, type FilterSuggestions } from '../search/filterSuggestions';
import type { CreatureFilterPanel } from './useCreatureFilters';

export interface SearchKeywords {
  keywords: FilterKeyword[];
  lookup: ReadonlyMap<string, FilterKeyword>;
  /** The plain words of the search, which names must contain; filter tokens are left out. */
  nameQuery: string;
}

/** The keywords the search of `tab` understands, and the name search left once they are taken out. */
export function useSearchKeywords(tab: Tab, definitions: readonly CreatureFilterDefinition[], search: string): SearchKeywords {
  const keywords = useMemo(() => filterKeywords(tab, definitions), [tab, definitions]);
  const lookup = useMemo(() => keywordLookup(keywords), [keywords]);
  const nameQuery = useMemo(() => parseQuery(search, lookup).leftover, [search, lookup]);
  return { keywords, lookup, nameQuery };
}

export interface FilterSearch {
  suggestionsFor: (text: string, cursor: number) => FilterSuggestions | null;
  /** Applies the filter tokens in `text` and returns the text that stays in the field. */
  commit: (text: string) => string;
  chips: FilterChipGroup[];
  /** Active filters besides the text search. */
  activeCount: number;
  /** The creature filters; set on the Characters tab only. */
  panel: CreatureFilterPanel | null;
  /** Clears the search and every filter. */
  reset: () => void;
}

/** A search without filters: no keywords, suggestions, chips or panel; the text is searched as it is. */
export const PLAIN_SEARCH: FilterSearch = {
  suggestionsFor: () => null,
  commit: (text) => text,
  chips: [],
  activeCount: 0,
  panel: null,
  reset: () => undefined,
};

interface FilterSearchOptions {
  keywords: SearchKeywords;
  setSearch: (search: string) => void;
  panel: CreatureFilterPanel | null;
  tags: readonly Tag[];
  tagIds: readonly string[];
  setTagIds: (update: (current: string[]) => string[]) => void;
}

/**
 * The asset search with filters: typed `keyword:value` tokens become filters
 * when committed, the filter panel edits the same filters, and every active
 * filter shows as a chip.
 */
export function useFilterSearch({ keywords, setSearch, panel, tags, tagIds, setTagIds }: FilterSearchOptions): FilterSearch {
  const facets = panel?.result.facets ?? null;
  const selection = panel?.selection ?? null;

  const suggestionsFor = useCallback(
    (text: string, cursor: number) => filterSuggestions(text, cursor, { keywords: keywords.keywords, lookup: keywords.lookup, facets, tags }),
    [keywords, facets, tags],
  );

  const commit = useCallback((text: string): string => {
    const { tokens, leftover, incomplete } = parseQuery(text, keywords.lookup);
    if (tokens.length === 0) return text;
    const current = { selection: selection ?? emptyCreatureSelection(), tagIds: [...tagIds] };
    const { filters, words } = applyFilterTokens(text, tokens, current, { facets, tags });
    if (panel && filters.selection !== current.selection) panel.setSelection(() => filters.selection);
    if (filters.tagIds.length !== tagIds.length) setTagIds(() => filters.tagIds);
    return [...words, leftover, ...incomplete].filter(Boolean).join(' ');
  }, [keywords, selection, tagIds, facets, tags, panel, setTagIds]);

  const chips = useMemo(() => activeFilterChips({
    selection: selection ?? emptyCreatureSelection(),
    definitions: panel?.definitions ?? [],
    facets,
    tagIds,
    tags,
    setSelection: panel?.setSelection ?? (() => undefined),
    setTagIds,
  }), [selection, panel, facets, tagIds, tags, setTagIds]);

  const reset = useCallback((): void => {
    setSearch('');
    setTagIds(() => []);
    panel?.setSelection(() => emptyCreatureSelection());
  }, [setSearch, setTagIds, panel]);

  return {
    suggestionsFor,
    commit,
    chips,
    activeCount: chips.reduce((sum, group) => sum + group.items.length, 0),
    panel,
    reset,
  };
}
