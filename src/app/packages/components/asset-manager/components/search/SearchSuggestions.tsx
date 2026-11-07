import React, { useEffect, useRef } from 'react';
import type { FilterSuggestion, FilterSuggestions } from '../../search/filterSuggestions';

interface SearchSuggestionsProps {
  id: string;
  suggestions: FilterSuggestions;
  highlight: number;
  onHighlight: (index: number) => void;
  onPick: (item: FilterSuggestion) => void;
}

/** The id of a suggestion row, for the field's `aria-activedescendant`. */
export function suggestionId(listId: string, index: number): string {
  return `${listId}-${index}`;
}

function SuggestionRow({ item }: { item: FilterSuggestion }): React.JSX.Element {
  if (item.kind === 'keyword') {
    const { prefix, aliases, description } = item.keyword;
    return (
      <>
        <span className="atlas-search-suggestion__key">
          <code>{prefix}:</code>
          {aliases.length > 0 && <span className="atlas-search-suggestion__aliases">{aliases.map((alias) => `${alias}:`).join(' ')}</span>}
        </span>
        <span className="atlas-search-suggestion__detail">{description}</span>
      </>
    );
  }
  return (
    <>
      <span className="atlas-search-suggestion__key">{item.label}</span>
      <span className="atlas-search-suggestion__detail atlas-search-suggestion__count">{item.count ?? ''}</span>
    </>
  );
}

/**
 * The dropdown under the search: keywords while one is typed, the values the
 * assets in view have after it. Clicks keep the focus in the field.
 */
export function SearchSuggestions({ id, suggestions, highlight, onHighlight, onPick }: SearchSuggestionsProps): React.JSX.Element {
  const { heading, items, hint, mode, context } = suggestions;
  const listRef = useRef<HTMLDivElement>(null);
  const active = Math.min(highlight, items.length - 1);

  useEffect(() => {
    listRef.current?.ownerDocument.getElementById(suggestionId(id, active))?.scrollIntoView?.({ block: 'nearest' });
  }, [id, active]);

  return (
    <div className="atlas-search-suggestions" onMouseDown={(e) => e.preventDefault()}>
      <div className="atlas-search-suggestions__heading">
        <span>{heading}</span>
        {items.length > 0 && <kbd>Tab</kbd>}
      </div>
      {hint && <div className="atlas-search-suggestions__hint">{hint}</div>}
      {mode === 'value' && items.length === 0 && !hint && (
        <div className="atlas-search-suggestions__hint">No matches for “{context.kind === 'value' ? context.fragment : ''}”</div>
      )}
      {items.length > 0 && (
        <div ref={listRef} id={id} className="atlas-search-suggestions__list" role="listbox" aria-label={heading}>
          {items.map((item, index) => (
            <div
              key={item.kind === 'keyword' ? item.keyword.prefix : item.label}
              id={suggestionId(id, index)}
              role="option"
              aria-selected={index === active}
              className={`atlas-search-suggestion${index === active ? ' atlas-active' : ''}`}
              // Moving, not entering: arrow keys scroll rows under a resting pointer.
              onMouseMove={() => { if (index !== active) onHighlight(index); }}
              onClick={() => onPick(item)}
            >
              <SuggestionRow item={item} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
