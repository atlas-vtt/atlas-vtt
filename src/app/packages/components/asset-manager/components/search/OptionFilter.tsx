import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { FacetOption } from '../../../../../creatures/creatureFilterEngine';
import type { OptionState } from '../../../../../types/creatureFilterTypes';
import { Button } from '../../../primitives/button';
import { LabelTooltip } from '../../../primitives/tooltip';
import { FilterSection } from './FilterSection';
import { OptionChips } from './OptionChips';
import { t } from '../../../../../i18n';

/** Chips an options filter shows: its most common options, or a search's first matches. */
export const SHOWN_OPTIONS = 8;

interface OptionFilterProps {
  title: string;
  options: readonly FacetOption[];
  onChange: (key: string, state: OptionState) => void;
}

/**
 * The chips `query` leaves of `options`: those whose label holds it (all of them for an empty
 * one), the first `SHOWN_OPTIONS` of them, and every picked option besides, so a pick never
 * disappears.
 */
export function shownOptions(options: readonly FacetOption[], query: string): FacetOption[] {
  const typed = query.trim().toLocaleLowerCase();
  const matches = options.filter((option) => !typed || option.label.toLocaleLowerCase().includes(typed));
  const first = new Set(matches.slice(0, SHOWN_OPTIONS));
  return options.filter((option) => first.has(option) || option.state !== null);
}

/**
 * An options filter: a title over its most common options as chips, never more than a few, and
 * beside the title a search that finds the others among them.
 */
export function OptionFilter({ title, options, onChange }: OptionFilterProps): React.JSX.Element {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const searchable = options.length > SHOWN_OPTIONS;
  useEffect(() => {
    if (searching) inputRef.current?.focus();
  }, [searching]);

  const close = (): void => {
    setSearching(false);
    setQuery('');
  };

  const action = !searchable ? undefined : searching ? (
    <span className="atlas-filter-section__search">
      <Search aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={t('filters.searchOptions', { field: title.toLocaleLowerCase() })}
        aria-label={t('filters.searchOptions', { field: title.toLocaleLowerCase() })}
        spellCheck={false}
        onChange={(event) => setQuery(event.target.value)}
        onBlur={() => { if (!query) close(); }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
      />
      <LabelTooltip label={t('common.clearSearch')}>
        <Button variant="ghost" size="icon" className="atlas-filter-section__search-close" onMouseDown={(event) => event.preventDefault()} onClick={close}>
          <X />
        </Button>
      </LabelTooltip>
    </span>
  ) : (
    <LabelTooltip label={t('filters.searchOptions', { field: title.toLocaleLowerCase() })}>
      <Button variant="ghost" size="icon" className="atlas-filter-section__search-button" onClick={() => setSearching(true)}>
        <Search />
      </Button>
    </LabelTooltip>
  );

  const shown = shownOptions(options, query);
  return (
    <FilterSection title={title} active={options.some((option) => option.state !== null)} action={action}>
      {shown.length > 0
        ? <OptionChips label={title} options={shown} onChange={onChange} />
        : <p className="atlas-filter-panel__hint">{t('filters.noOptionMatch')}</p>}
    </FilterSection>
  );
}
