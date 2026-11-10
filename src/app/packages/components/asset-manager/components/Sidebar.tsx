import React, { useState, useRef, useMemo } from 'react';
import { MotionConfig, motion, useReducedMotion } from 'framer-motion';
import { Search, X, Settings, Tag, Download, Upload } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import type { AnyAsset, CollectionOption, Tag as TagType } from '../types';
import { hasAssetTag } from '../../../../services/tagGroups';
import type { SidebarLayout } from '../hooks/useSidebarLayout';
import { sidebarContentVariants, sidebarMotionState, sidebarVariants, stillSidebarContentVariants, stillSidebarVariants } from './sidebarMotion';
import { ClearTagsChip } from './ClearTagsChip';
import { TagListSkeleton } from './TagListSkeleton';
import { CollectionPicker } from './CollectionPicker';
import { t } from '../../../../i18n';

export interface SidebarProps {
  selectedTagIds: string[];
  onSelectTag: (tagId: string) => void;
  onClearTags: () => void;
  tags: TagType[];
  /** The collection's tags are not loaded yet: the list shows placeholders instead of "No tags yet". */
  tagsLoading?: boolean;
  /** The collection could not be loaded: its tags are unknown, so the list shows neither placeholders nor "No tags yet". */
  tagsFailed?: boolean;
  /**
   * The assets tags are counted in: those of the tab, in every folder, that the search and the other filters leave
   * (`CreatureFiltering.matching`). A tag's count is therefore what the list shows once it is picked.
   */
  countedAssets: readonly AnyAsset[];
  collections: CollectionOption[];
  /** Id of the selected collection. */
  selectedCollection: string;
  onSelectCollection: (collectionId: string) => void;
  onManageTags: () => void;
  onEditCollectionSettings?: (collectionId: string) => void;
  onExportCollection?: () => void;
  onImportCollection?: () => void;
  /** Stands above the Manage button: what the open tab offers to add (the bestiary tokens). */
  footer?: React.ReactNode;
  /** Floating behaviour from `useSidebarLayout`; omitted, the sidebar is docked. */
  layout?: Pick<SidebarLayout, 'isFloating' | 'isPeeking' | 'isNearEdge' | 'panelRef'>;
}

export function Sidebar({
  selectedTagIds,
  onSelectTag,
  onClearTags,
  tags,
  tagsLoading = false,
  tagsFailed = false,
  countedAssets,
  collections,
  selectedCollection,
  onSelectCollection,
  onManageTags,
  onEditCollectionSettings,
  onExportCollection,
  onImportCollection,
  footer,
  layout,
}: SidebarProps): React.JSX.Element {
  const [isTagsSearchVisible, setIsTagsSearchVisible] = useState(false);
  const [tagsSearchQuery, setTagsSearchQuery] = useState('');
  const tagsSearchInputRef = useRef<HTMLInputElement>(null);

  const filteredTags = tagsSearchQuery
    ? tags.filter((t) => t.name.toLowerCase().includes(tagsSearchQuery.toLowerCase()))
    : tags;

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tag of tags) {
      counts.set(tag.id, countedAssets.filter((asset) => hasAssetTag(asset.tags, tag)).length);
    }
    return counts;
  }, [tags, countedAssets]);

  const toggleTagSearch = (): void => {
    const next = !isTagsSearchVisible;
    setIsTagsSearchVisible(next);
    if (next) {
      window.setTimeout(() => tagsSearchInputRef.current?.focus(), 100);
    } else {
      setTagsSearchQuery('');
    }
  };

  const isFloating = layout?.isFloating === true;
  const isHidden = isFloating && !layout.isPeeking;
  const still = useReducedMotion() === true;

  return (
    <MotionConfig reducedMotion="user">
      {isFloating && <div className={`atlas-sidebar-edge ${layout.isNearEdge && !layout.isPeeking ? 'atlas-near' : ''}`} aria-hidden />}
      <motion.aside
        ref={layout?.panelRef}
        className={`atlas-asset-manager-sidebar ${isFloating ? 'atlas-floating' : ''}`}
        aria-hidden={isHidden ? true : undefined}
        inert={isHidden ? true : undefined}
        variants={still ? stillSidebarVariants : sidebarVariants}
        initial={false}
        animate={sidebarMotionState(isFloating, layout?.isPeeking === true)}
      >
        <motion.div className="atlas-asset-manager-sidebar-content" variants={still ? stillSidebarContentVariants : sidebarContentVariants}>
          <div className="atlas-collections">
            <div className="atlas-collections-heading-row">
              <div className="atlas-section-title">{t('am.sidebar.collection')}</div>
              <div className="atlas-collections-heading-actions">
                {onExportCollection && (
                  <LabelTooltip label={t('am.sidebar.export')}>
                    <Button variant="ghost" size="icon" className="atlas-collection-header-btn" onClick={onExportCollection} aria-label={t('am.sidebar.export')}>
                      <Upload />
                    </Button>
                  </LabelTooltip>
                )}
                {onImportCollection && (
                  <LabelTooltip label={t('am.sidebar.import')}>
                    <Button variant="ghost" size="icon" className="atlas-collection-header-btn" onClick={onImportCollection} aria-label={t('am.sidebar.import')}>
                      <Download />
                    </Button>
                  </LabelTooltip>
                )}
              </div>
            </div>

            <div className="atlas-collection-row">
              <CollectionPicker
                collections={collections}
                selectedCollection={selectedCollection}
                onSelectCollection={onSelectCollection}
              />

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
              {tagsLoading && !tagsFailed && <TagListSkeleton />}
              {!tagsLoading && !tagsFailed && (filteredTags.length > 0 ? (
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

          {footer}

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
