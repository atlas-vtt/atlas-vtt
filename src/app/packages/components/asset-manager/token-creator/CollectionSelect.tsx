import type { CollectionMetadata } from '../../../../services/AssetService';
import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Folder, Search } from 'lucide-react';
import { cn } from '../../../../../utils/cn';
import { t } from '../../../../i18n';

interface CollectionSelectProps {
  value: string;
  options: CollectionMetadata[];
  onChange: (collection: string) => void;
}

/** Searchable collection picker, sharing the asset manager's dropdown styling. */
export function CollectionSelect({ value, options, onChange }: CollectionSelectProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    searchRef.current?.focus();
    const handlePointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  const close = (): void => {
    setIsOpen(false);
    setQuery('');
  };

  const select = (collection: string): void => {
    onChange(collection);
    close();
  };

  const filtered = options.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div ref={rootRef} className={cn('atlas-collection-dropdown', isOpen && 'atlas-open')}>
      <button
        type="button"
        className={cn('atlas-collection-dropdown-trigger', isOpen && 'atlas-open')}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="atlas-collection-selected">
          <Folder />
          <span>{options.find(c => c.id === value)?.name ?? value}</span>
        </span>
        <ChevronDown className={cn('atlas-collection-chevron', isOpen && 'atlas-rotated')} />
      </button>

      {isOpen && (
        <div className="atlas-collection-dropdown-content" role="listbox">
          <div className="atlas-collection-search">
            <Search className="atlas-collection-search-icon" />
            <input
              ref={searchRef}
              type="text"
              placeholder={t('creator.searchCollections')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
              className="atlas-collection-search-input"
            />
          </div>
          <div className="atlas-collection-options">
            {filtered.map((collection) => (
              <button
                key={collection.id}
                type="button"
                role="option"
                aria-selected={collection.id === value}
                className={cn('atlas-collection-option', collection.id === value && 'atlas-selected')}
                onClick={() => select(collection.id)}
              >
                <div className="atlas-collection-option-content">
                  <Folder className="atlas-collection-option-icon" />
                  <span className="atlas-collection-option-text">{collection.name}</span>
                </div>
                <Check className="atlas-collection-check" />
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="atlas-collection-no-results">{t('creator.noCollections')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
