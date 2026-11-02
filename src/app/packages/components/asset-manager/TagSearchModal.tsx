import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from 'obsidian';
import { Search, Check, Plus, Minus, Tag as TagIcon } from 'lucide-react';
import { CloseButton } from '../primitives/CloseButton';
import { Button } from '../primitives/button';
import type { AnyAsset, Tag } from './types';
import { hasAssetTag } from '../../../services/tagGroups';
import { toggleAssetTag } from './utils/assetTags';
import { t } from '../../../i18n';

interface TagSearchModalProps {
  selectedAssets: AnyAsset[];
  availableTags: Tag[];
  allAssets: AnyAsset[];
  /** Saves one asset's tags after a toggle; called for each asset of the dialog. */
  onSetAssetTags: (asset: AnyAsset, tags: string[]) => void;
  /** Receives the dialog's assets with the tags toggled so far. */
  onCreateTag: (tagName: string, selectedAssets: AnyAsset[]) => void;
  onClose: () => void;
}

function TagSearchModalInner({
  selectedAssets: initialAssets,
  availableTags,
  allAssets,
  onSetAssetTags,
  onCreateTag,
  onClose,
}: TagSearchModalProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('');
  const [assets, setAssets] = useState(initialAssets);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search on mount
  useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Tag usage counts
  const tagUsageMap = useMemo(() => {
    const map = new Map<string, number>();
    availableTags.forEach(tag => {
      map.set(tag.id, allAssets.filter(a => hasAssetTag(a.tags, tag)).length);
    });
    return map;
  }, [availableTags, allAssets]);

  // Filtered + sorted tags
  const sortedTags = useMemo(() => {
    const filtered = searchQuery
      ? availableTags.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : availableTags;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [availableTags, searchQuery]);

  const canCreate = searchQuery.trim() &&
    !availableTags.some(t => t.name.toLowerCase() === searchQuery.trim().toLowerCase());

  // Assets carry tags by name (creators, Edit Token) or, from older versions, by id.
  const handleToggleTag = (tag: Tag): void => {
    const toggled = assets.map(asset => ({ ...asset, tags: toggleAssetTag(asset.tags, tag) }));
    toggled.forEach((asset, index) => onSetAssetTags(assets[index]!, asset.tags));
    setAssets(toggled);
  };

  const handleCreate = (): void => {
    const name = searchQuery.trim();
    if (!name) return;
    onCreateTag(name, assets);
    setSearchQuery('');
    onClose();
  };

  return (
    <div
      className="atlas-modal-overlay"
      onClick={onClose}
      // This separate React root must not trigger the asset manager's outside-click listener.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="atlas-modal atlas-tag-search-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="atlas-modal-header">
          <div>
            <h3>{t('am.tags.manage')}</h3>
            <span className="atlas-tag-search__subtitle">
              {assets.length} asset{assets.length !== 1 ? 's' : ''} selected
            </span>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        {/* Search */}
        <div className="atlas-tag-search__search">
          <Search size={16} className="atlas-tag-search__search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="atlas-input"
            placeholder={t('am.tags.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canCreate) handleCreate();
            }}
          />
        </div>

        {/* Tag list */}
        <div className="atlas-tag-search__list">
          {sortedTags.map((tag) => {
            const allHave = assets.every(a => hasAssetTag(a.tags, tag));
            const someHave = assets.some(a => hasAssetTag(a.tags, tag));
            const count = tagUsageMap.get(tag.id) || 0;

            return (
              <div
                key={tag.id}
                className={`atlas-tag-search__item ${allHave ? 'atlas-tag-search__item--selected' : someHave ? 'atlas-tag-search__item--partial' : ''}`}
                onClick={() => handleToggleTag(tag)}
              >
                <div className="atlas-tag-search__item-icon">
                  {allHave ? <Check size={16} /> : someHave ? <Minus size={16} /> : <Plus size={16} />}
                </div>
                <TagIcon size={14} className="atlas-tag-search__item-tag-icon" />
                <span className="atlas-tag-search__item-name">{tag.name}</span>
                {count > 0 && (
                  <span className="atlas-tag-search__item-count">{count}</span>
                )}
              </div>
            );
          })}

          {canCreate && (
            <div className="atlas-tag-search__create" onClick={handleCreate}>
              <Plus size={16} />
              <span>Create &ldquo;{searchQuery.trim()}&rdquo;</span>
            </div>
          )}

          {sortedTags.length === 0 && !canCreate && (
            <div className="atlas-tag-search__empty">
              {searchQuery ? t('am.tags.noMatch') : t('am.tags.none')}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="atlas-modal-footer">
          <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="default" size="sm" onClick={onClose}>{t('common.done')}</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Obsidian-compatible wrapper.
 * Keeps the same `new TagSearchModal(app, props).open()` API
 * but renders a React modal via createRoot instead of Obsidian's Modal chrome.
 */
export class TagSearchModal {
  private container: HTMLDivElement | null = null;
  private root: ReturnType<typeof createRoot> | null = null;
  private props: Omit<TagSearchModalProps, 'onClose'>;

  constructor(_app: App, props: Omit<TagSearchModalProps, 'onClose'>) {
    this.props = props;
  }

  open(): void {
    this.container = document.body.createDiv({ cls: 'atlas-vtt-plugin atlas-vtt-root' });

    this.root = createRoot(this.container);
    this.root.render(
      <TagSearchModalInner
        {...this.props}
        onClose={() => this.close()}
      />,
    );
  }

  close(): void {
    this.root?.unmount();
    this.container?.remove();
    this.root = null;
    this.container = null;
  }
}
