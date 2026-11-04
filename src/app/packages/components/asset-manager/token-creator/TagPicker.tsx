import React, { useId, useRef, useState } from 'react';
import { Check, Plus, Search, Tag as TagIcon, X } from 'lucide-react';
import { cn } from '../../../../../utils/cn';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { t } from '../../../../i18n';

interface TagPickerProps {
  available: string[];
  selected: string[];
  onToggle: (tag: string) => void;
  onCreate: (tag: string) => Promise<string>;
  disabled?: boolean;
}

/** Search, select or create tags without leaving the creator. */
export function TagPicker({ available, selected, onToggle, onCreate, disabled = false }: TagPickerProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const creatingRef = useRef(false);
  const labelId = useId();
  const name = query.trim();
  const tags = Array.from(new Set([...available, ...selected]));
  const filtered = tags.filter((tag) => tag.toLowerCase().includes(name.toLowerCase()));
  const existing = tags.find((tag) => tag.toLowerCase() === name.toLowerCase());

  const addTag = async (): Promise<void> => {
    if (!name || disabled || creatingRef.current) return;
    setError('');
    if (existing) {
      if (!selected.includes(existing)) onToggle(existing);
      setQuery('');
      return;
    }
    creatingRef.current = true;
    setIsCreating(true);
    try {
      const created = await onCreate(name);
      if (!selected.includes(created)) onToggle(created);
      setQuery('');
      inputRef.current?.focus();
    } catch {
      setError('Could not create tag. Please try again.');
    } finally {
      creatingRef.current = false;
      setIsCreating(false);
    }
  };

  return (
    <section className="atlas-token-creator__section">
      <div className="atlas-token-creator__section-title">
        <span>{t('creator.tags')} <span className="atlas-token-creator__count">{t('creator.selected', { count: selected.length })}</span></span>
      </div>

      <div className="atlas-token-creator__search">
        <Search />
        <span id={labelId} hidden>{t('creator.searchTags')}</span>
        <input
          ref={inputRef}
          type="text"
          aria-labelledby={labelId}
          placeholder={t('creator.searchTagsPlaceholder')}
          value={query}
          disabled={disabled}
          readOnly={isCreating}
          onChange={(e) => { setQuery(e.target.value); setError(''); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              e.stopPropagation();
              void addTag();
            }
          }}
        />
        {query && (
          <LabelTooltip label={t('common.clearSearch')}>
            <Button type="button" variant="ghost" size="icon" className="atlas-collection-header-btn" disabled={disabled || isCreating}
              onClick={() => { setQuery(''); setError(''); }}>
              <X />
            </Button>
          </LabelTooltip>
        )}
      </div>

      {name && !existing && (
        <Button type="button" variant="outline" size="sm" disabled={disabled || isCreating} onClick={() => { void addTag(); }}>
          <Plus />
          <span>{isCreating ? t('creator.creatingTag') : t('creator.createTag', { name })}</span>
        </Button>
      )}
      {error && <div className="atlas-token-creator__empty-note" role="alert">{error}</div>}

      {filtered.length > 0 ? (
        <div className="atlas-token-creator__chips">
          {filtered.map((tag) => {
            const isActive = selected.includes(tag);
            return (
              <Button
                key={tag}
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || isCreating}
                onClick={() => onToggle(tag)}
                className={cn('atlas-token-creator__chip', isActive && 'atlas-selected')}
                aria-pressed={isActive}
              >
                {isActive ? <Check /> : <TagIcon />}
                <span>{tag}</span>
              </Button>
            );
          })}
        </div>
      ) : !name && (
        <div className="atlas-token-creator__empty-note">{t('creator.firstTag')}</div>
      )}
    </section>
  );
}
