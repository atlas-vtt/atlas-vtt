import { useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type RefObject } from 'react';
import { nextHighlight } from '../../../../search/querySyntax';
import type { FilterSuggestion, FilterSuggestions } from '../search/filterSuggestions';
import type { FilterSearch } from './useFilterSearch';
import { isSearchUntouched, touchSearch } from '../components/search/searchFocus';

/** How long after the field loses focus its typed filters are committed; a click on a suggestion lands first. */
const COMMIT_ON_BLUR_MS = 150;

export interface SearchAutocomplete {
  listId: string;
  /** The suggestions to show; null while closed or when there is nothing to suggest. */
  suggestions: FilterSuggestions | null;
  highlight: number;
  setHighlight: (index: number) => void;
  pick: (item: FilterSuggestion) => void;
  inputProps: Pick<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onFocus' | 'onBlur' | 'onSelect' | 'onPointerDown' | 'role' | 'aria-autocomplete' | 'aria-expanded' | 'aria-controls' | 'aria-activedescendant'>;
  /** Handles the keys the suggestions use; returns whether it did. */
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => boolean;
}

/**
 * Autocomplete for the filter syntax: suggests keywords and values at the
 * cursor, completes them with Tab or Enter (a completed value becomes a filter
 * at once), and commits typed filters on Enter or when the field loses focus.
 */
export function useSearchAutocomplete(
  search: string,
  onSearch: (value: string) => void,
  query: FilterSearch,
  inputRef: RefObject<HTMLInputElement | null>,
): SearchAutocomplete {
  const listId = useId();
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const latest = useRef({ search, query });
  latest.current = { search, query };
  const blurTimer = useRef<number | null>(null);

  useEffect(() => () => { if (blurTimer.current !== null) window.clearTimeout(blurTimer.current); }, []);

  const suggestions = useMemo(() => (open ? query.suggestionsFor(search, cursor) : null), [open, query, search, cursor]);
  const count = suggestions?.items.length ?? 0;

  const placeCursor = (position: number): void => {
    setCursor(position);
    const input = inputRef.current;
    input?.ownerDocument.defaultView?.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(position, position);
    });
  };

  const commit = (text: string): void => {
    const remaining = latest.current.query.commit(text);
    if (remaining !== text) onSearch(remaining);
    setOpen(false);
  };

  const pick = (item: FilterSuggestion): void => {
    const context = suggestions?.context;
    if (!context) return;
    if (item.kind === 'keyword') {
      const replacement = `${item.negated ? '-' : ''}${item.keyword.prefix}:`;
      const text = search.slice(0, context.start) + replacement + search.slice(context.end);
      onSearch(text);
      setHighlight(0);
      placeCursor(context.start + replacement.length);
      return;
    }
    // A word that names a filter's value becomes that filter in its place.
    const text = item.kind === 'filter'
      ? search.slice(0, context.start) + item.insert + search.slice(context.end)
      : context.kind === 'value' ? search.slice(0, context.valueStart) + item.insert + search.slice(context.end) : null;
    if (text === null) return;
    const remaining = query.commit(text);
    onSearch(remaining);
    setHighlight(0);
    placeCursor(remaining.length);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): boolean => {
    const consume = (): true => {
      event.preventDefault();
      event.stopPropagation();
      return true;
    };
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && (count > 0 || !open)) {
      setHighlight(nextHighlight(highlight, count, event.key, open && count > 0));
      setOpen(true);
      return consume();
    }
    if (event.key === 'Tab' && !event.shiftKey && count > 0) {
      pick(suggestions!.items[Math.min(highlight, count - 1)]!);
      return consume();
    }
    if (event.key === 'Enter') {
      if (count > 0) pick(suggestions!.items[Math.min(highlight, count - 1)]!);
      else commit(search);
      return consume();
    }
    if (event.key === 'Escape' && suggestions) {
      setOpen(false);
      return consume();
    }
    return false;
  };

  const activeId = count > 0 ? `${listId}-${Math.min(highlight, count - 1)}` : undefined;
  return {
    listId,
    suggestions,
    highlight,
    setHighlight,
    pick,
    onKeyDown,
    inputProps: {
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': count > 0,
      ...(count > 0 && { 'aria-controls': listId }),
      ...(activeId && { 'aria-activedescendant': activeId }),
      onChange: (event) => {
        touchSearch(event.target);
        onSearch(event.target.value);
        setCursor(event.target.selectionStart ?? event.target.value.length);
        setHighlight(0);
        setOpen(true);
      },
      onFocus: (event) => {
        if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
        setCursor(event.target.selectionStart ?? 0);
        // Focused as the window opened: the suggestions wait for the first key or press (decision #38).
        if (!isSearchUntouched(event.target)) setOpen(true);
      },
      onPointerDown: (event) => {
        touchSearch(event.currentTarget);
        setOpen(true);
      },
      onSelect: (event) => setCursor(event.currentTarget.selectionStart ?? 0),
      onBlur: (event) => {
        touchSearch(event.target);
        blurTimer.current = window.setTimeout(() => {
          blurTimer.current = null;
          commit(latest.current.search);
        }, COMMIT_ON_BLUR_MS);
      },
    },
  };
}
