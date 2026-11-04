import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import {
  Search, X, Folder, Settings, ChevronDown, Check, Tag,
  Download, Upload,
} from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import type { AnyAsset, CollectionOption, Tag as TagType } from '../types';
import { hasAssetTag } from '../../../../services/tagGroups';
import type { SidebarLayout } from '../hooks/useSidebarLayout';
import { sidebarContentVariants, sidebarMotionState, sidebarVariants } from './sidebarMotion';
import { ClearTagsChip } from './ClearTagsChip';
import { TagListSkeleton } from './TagListSkeleton';
import { t } from '../../../../i18n';

export interface SidebarProps {
  selectedTagIds: string[];
  onSelectTag: (tagId: string) => void;
  onClearTags: () => void;
  tags: TagType[];
  /** The collection's tags are not loaded yet: the list shows placeholders instead of "No tags yet". */
  tagsLoading?: boolean;
  assets: AnyAsset[];
  collections: CollectionOption[];
  /** Id of the selected collection. */
  selectedCollection: string;
  onSelectCollection: (collectionId: string) => void;
  onManageTags: () => void;
  onEditCollectionSettings?: (collectionId: string) => void;
  onExportCollection?: () => void;
  onImportCollection?: () => void;
  /** Floating behaviour from `useSidebarLayout`; omitted, the sidebar is docked. */
  layout?: Pick<SidebarLayout, 'isFloating' | 'isPeeking' | 'isNearEdge' | 'panelRef'>;
}

export function Sidebar({
  selectedTagIds,
  onSelectTag,
  onClearTags,
  tags,
  tagsLoading = false,
  assets,
  collections,
  selectedCollection,
  onSelectCollection,
  onManageTags,
  onEditCollectionSettings,
  onExportCollection,
  onImportCollection,
  layout,
}: SidebarProps): React.JSX.Element {
  const [isCollectionDropdownOpen, setIsCollectionDropdownOpen] = useState(false);
  const [collectionSearchQuery, setCollectionSearchQuery] = useState('');
  const collectionDropdownRef = useRef<HTMLDivElement>(null);

  const [isTagsSearchVisible, setIsTagsSearchVisible] = useState(false);
  const [tagsSearchQuery, setTagsSearchQuery] = useState('');
  const tagsSearchInputRef = useRef<HTMLInputElement>(null);

  const filteredCollections = collections.filter((c) =>
    c.name.toLowerCase().includes(collectionSearchQuery.toLowerCase())
  );
  const selectedCollectionName = collections.find((c) => c.id === selectedCollection)?.name;

  const filteredTags = tagsSearchQuery
    ? tags.filter((t) => t.name.toLowerCase().includes(tagsSearchQuery.toLowerCase()))
    : tags;

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tag of tags) {
      counts.set(tag.id, assets.filter((asset) => hasAssetTag(asset.tags, tag)).length);
    }
    return counts;
  }, [tags, assets]);

  useEffect(() => {
    if (!isCollectionDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent): void => {
      if (collectionDropdownRef.current && !collectionDropdownRef.current.contains(event.target as Node)) {
        setIsCollectionDropdownOpen(false);
        setCollectionSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCollectionDropdownOpen]);

  const handleCollectionSelect = (collectionId: string): void => {
    onSelectCollection(collectionId);
    setIsCollectionDropdownOpen(false);
    setCollectionSearchQuery('');
  };

  const toggleTagSearch = (): void => {
    const next = !isTagsSearchVisible;
    setIsTagsSearchVisible(next);
    if (next) {
      window.setTimeout(() => tagsSearchInputRef.current?.focus(), 100);
    } else {
      setTagsSearchQuery('');
    }
  };

  const renderCollectionOption = (collectionId: string, label: string): React.JSX.Element => (
    <button
      key={collectionId}
      type="button"
      className={`atlas-collection-option ${selectedCollection === collectionId ? 'atlas-selected' : ''}`}
      onClick={() => handleCollectionSelect(collectionId)}
    >
      <div className="atlas-collection-option-content">
        <Folder className="atlas-collection-option-icon" />
        <span className="atlas-collection-option-text">{label}</span>
      </div>
      <Check className="atlas-collection-check" />
    </button>
  );

  const isFloating = layout?.isFloating === true;
  const isHidden = isFloating && !layout.isPeeking;

  return (
    <MotionConfig reducedMotion="user">
      {isFloating && <div className={`atlas-sidebar-edge ${layout.isNearEdge && !layout.isPeeking ? 'atlas-near' : ''}`} aria-hidden />}
      <motion.aside
        ref={layout?.panelRef}
        className={`atlas-asset-manager-sidebar ${isFloating ? 'atlas-floating' : ''}`}
        aria-hidden={isHidden ? true : undefined}
        inert={isHidden ? true : undefined}
        variants={sidebarVariants}
        initial={false}
        animate={sidebarMotionState(isFloating, layout?.isPeeking === true)}
      >
        <motion.div className="atlas-asset-manager-sidebar-content" variants={sidebarContentVariants}>
          <div className="atlas-collections">
            <div className="atlas-collections-heading-row">
              <div className="atlas-section-title">{t('am.sidebar.collection')}</div>
              <div className="atlas-collections-heading-actions">
                {onExportCollection && (
                  <LabelTooltip label={t('am.sidebar.export')}>
                    <Button variant="ghost" size="icon" className="atlas-collection-header-btn" onClick={onExportCollection}>
                      <Upload />
                    </Button>
                  </LabelTooltip>
                )}
                {onImportCollection && (
                  <LabelTooltip label={t('am.sidebar.import')}>
                    <Button variant="ghost" size="icon" className="atlas-collection-header-btn" onClick={onImportCollection}>
                      <Download />
                    </Button>
                  </LabelTooltip>
                )}
              </div>
            </div>

            <div className="atlas-collection-row">
              <div className={`atlas-collection-dropdown ${isCollectionDropdownOpen ? 'atlas-open' : ''}`} ref={collectionDropdownRef}>
                <button
                  type="button"
                  className={`atlas-collection-dropdown-trigger ${isCollectionDropdownOpen ? 'atlas-open' : ''}`}
                  onClick={(e) => { e.stopPropagation(); setIsCollectionDropdownOpen(!isCollectionDropdownOpen); setCollectionSearchQuery(''); }}
                  aria-haspopup="listbox"
                  aria-expanded={isCollectionDropdownOpen}
                >
                  <span className="atlas-collection-selected">
                    <Folder />
                    <span>{selectedCollectionName ?? selectedCollection}</span>
                  </span>
                  <ChevronDown className={`atlas-collection-chevron ${isCollectionDropdownOpen ? 'atlas-rotated' : ''}`} />
                </button>

                {isCollectionDropdownOpen && (
                  <div className="atlas-collection-dropdown-content" role="listbox">
                    <div className="atlas-collection-search">
                      <Search className="atlas-collection-search-icon" />
                      <input
                        type="text"
                        placeholder={t('creator.searchCollections')}
                        value={collectionSearchQuery}
                        onChange={(e) => setCollectionSearchQuery(e.target.value)}
                        className="atlas-collection-search-input"
                        autoFocus
                      />
                    </div>
                    <div className="atlas-collection-options">
                      {filteredCollections.map((collection) => renderCollectionOption(collection.id, collection.name))}
                      {filteredCollections.length === 0 && collectionSearchQuery && (
                        <div className="atlas-collection-no-results">{t('creator.noCollections')}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {onEditCollectionSettings && (
                <LabelTooltip label={t('am.sidebar.settings')}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="atlas-collection-header-btn"
                    onClick={(e) => { e.stopPropagation(); onEditCollectionSettings(selectedCollection); }}
                  >
                    <Settings />
                  </Button>
                </LabelTooltip>
              )}
            </div>
          </div>

          <div className="atlas-tags">
            <div className="atlas-tags-header">
              <div className="atlas-tags-heading">
                <div className="atlas-section-title">{t('am.sidebar.tags')}</div>
                <ClearTagsChip count={selectedTagIds.length} onClear={onClearTags} />
              </div>
              <LabelTooltip label={t('am.sidebar.searchTags')}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTagSearch}
                  className={`atlas-collection-header-btn ${isTagsSearchVisible ? 'atlas-active' : ''}`}
                >
                  <Search />
                </Button>
              </LabelTooltip>
            </div>

            {isTagsSearchVisible && (
              <div className="atlas-tags-search-container">
                <Search className="atlas-tags-search-icon" />
                <input
                  ref={tagsSearchInputRef}
                  type="text"
                  placeholder={t('am.sidebar.searchTagsPlaceholder')}
                  value={tagsSearchQuery}
                  onChange={(e) => setTagsSearchQuery(e.target.value)}
                  className="atlas-tags-search-input"
                />
                {tagsSearchQuery && (
                  <LabelTooltip label={t('common.clearSearch')}>
                    <Button variant="ghost" size="icon" className="atlas-collection-header-btn" onClick={() => setTagsSearchQuery('')}>
                      <X />
                    </Button>
                  </LabelTooltip>
                )}
              </div>
            )}

            <div className="atlas-tags-list">
              {tagsLoading && <TagListSkeleton />}
              {!tagsLoading && (filteredTags.length > 0 ? (
                filteredTags.map((tag) => {
                  const tagCount = tagCounts.get(tag.id) ?? 0;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      className={`atlas-tag-button ${selectedTagIds.includes(tag.id) ? 'atlas-active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); onSelectTag(tag.id); }}
                      aria-pressed={selectedTagIds.includes(tag.id)}
                    >
                      <Tag className="atlas-tag-icon" />
                      <span className="atlas-tag-text">{tag.name}</span>
                      {tagCount > 0 && <span className="atlas-tag-count">{tagCount}</span>}
                    </button>
                  );
                })
              ) : (
                <div className="atlas-tags-empty">
                  <span className="atlas-tags-empty-text">
                    {tagsSearchQuery ? t('am.sidebar.noMatchingTags') : t('am.sidebar.noTags')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="atlas-sidebar-spacer" />

          <Button
            variant="ghost"
            className="atlas-asset-manager-manage-btn"
            onClick={(e) => { e.stopPropagation(); onManageTags(); }}
          >
            <Settings />
            <span>{t('am.sidebar.manage')}</span>
          </Button>
        </motion.div>
      </motion.aside>
    </MotionConfig>
  );
}
