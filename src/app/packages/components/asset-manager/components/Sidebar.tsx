import React, { useState, useRef, useMemo } from 'react';
import { MotionConfig, motion, useReducedMotion } from 'framer-motion';
import { Search, X, Settings, Download, Upload, CloudUpload, MoreHorizontal } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import type { AnyAsset, CollectionOption, Tag as TagType } from '../types';
import { hasAssetTag } from '../../../../services/tagGroups';
import type { SidebarLayout } from '../hooks/useSidebarLayout';
import { sidebarContentVariants, sidebarMotionState, sidebarVariants, stillSidebarContentVariants, stillSidebarVariants } from './sidebarMotion';
import { ClearTagsChip } from './ClearTagsChip';
import { SidebarTagList, type SidebarTagItem } from './SidebarTagList';
import type { StoreTagsState } from '../../../../armarium/storeTagFilter';
import { CollectionPicker } from './CollectionPicker';
import { HeaderMenu, type HeaderMenuItem } from './HeaderMenu';
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
  /** Opens the tag manager; left out (a window choosing a map), the Manage button is too. */
  onManageTags?: () => void;
  onEditCollectionSettings?: (collectionId: string) => void;
  onExportCollection?: () => void;
  onImportCollection?: () => void;
  /** Shares the selected collection in the Armarium: sign-in, upload, checks and the listing, all in Atlas. */
  onShareCollection?: () => void;
  /** Stands above the Manage button: what the open tab offers to add (the bestiary tokens). */
  footer?: React.ReactNode;
  /** Floating behaviour from `useSidebarLayout`; omitted, the sidebar is docked. */
  layout?: Pick<SidebarLayout, 'isFloating' | 'isPeeking' | 'isNearEdge' | 'panelRef'>;
  /**
   * While the Armarium is shown: its store's tags stand in place of the collection's, a press picks them in the store,
   * and Manage, which manages the collection's tags, is left out.
   */
  storeTags?: StoreTagsSidebar | undefined;
}

/** The Armarium store's tags for the sidebar: what the page last said, and where presses go. */
export interface StoreTagsSidebar {
  state: StoreTagsState;
  onToggle: (tagId: string) => void;
  onClear: () => void;
}

/** The store's tags as list items, group by group. */
function storeTagItems(state: StoreTagsState): SidebarTagItem[] {
  if (state.status !== 'ready') return [];
  return state.tags.groups.flatMap((group) => group.tags.map((tag) => ({ id: tag.id, name: tag.label, count: tag.count, group: group.label })));
}

/** The selected collection's actions in its ⋯ menu, each offered only where the manager handles it. */
function collectionMenuItems(handlers: {
  onSettings: (() => void) | undefined;
  onExport: (() => void) | undefined;
  onImport: (() => void) | undefined;
  onShare: (() => void) | undefined;
}): HeaderMenuItem[] {
  const items: HeaderMenuItem[] = [
    { key: 'settings', label: t('am.sidebar.settings'), icon: <Settings />, onSelect: handlers.onSettings },
    { key: 'export', label: t('am.sidebar.export'), icon: <Upload />, onSelect: handlers.onExport },
    { key: 'import', label: t('am.sidebar.import'), icon: <Download />, onSelect: handlers.onImport },
    { key: 'share', label: t('armariumShare.shareCollection'), icon: <CloudUpload />, onSelect: handlers.onShare },
  ];
  return items.filter((item) => item.onSelect !== undefined);
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
  onShareCollection,
  footer,
  layout,
  storeTags,
}: SidebarProps): React.JSX.Element {
  const [isTagsSearchVisible, setIsTagsSearchVisible] = useState(false);
  const [tagsSearchQuery, setTagsSearchQuery] = useState('');
  const tagsSearchInputRef = useRef<HTMLInputElement>(null);

  const libraryItems = useMemo((): SidebarTagItem[] => tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    count: countedAssets.filter((asset) => hasAssetTag(asset.tags, tag)).length,
  })), [tags, countedAssets]);
  const storeState = storeTags?.state;
  const items = useMemo(() => (storeState ? storeTagItems(storeState) : libraryItems), [storeState, libraryItems]);
  const query = tagsSearchQuery.toLowerCase();
  const filteredItems = query ? items.filter((item) => item.name.toLowerCase().includes(query)) : items;
  const selectedIds = storeState?.status === 'ready' ? storeState.tags.picked : selectedTagIds;
  const selectTag = storeTags ? storeTags.onToggle : onSelectTag;
  const clearTags = storeTags ? storeTags.onClear : onClearTags;

  const toggleTagSearch = (): void => {
    const next = !isTagsSearchVisible;
    setIsTagsSearchVisible(next);
    if (next) {
      window.setTimeout(() => tagsSearchInputRef.current?.focus(), 100);
    } else {
      setTagsSearchQuery('');
    }
  };

  const collectionActions = collectionMenuItems({
    onSettings: onEditCollectionSettings && (() => onEditCollectionSettings(selectedCollection)),
    onExport: onExportCollection,
    onImport: onImportCollection,
    onShare: onShareCollection,
  });

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
            <CollectionPicker
              collections={collections}
              selectedCollection={selectedCollection}
              onSelectCollection={onSelectCollection}
            />
            {collectionActions.length > 0 && (
              <HeaderMenu
                label={t('am.sidebar.collection')}
                triggerClassName="atlas-collection-more-btn"
                iconTrigger
                triggerContent={<MoreHorizontal />}
                items={collectionActions}
              />
            )}
          </div>

          <div className="atlas-tags">
            <div className="atlas-tags-header">
              <div className="atlas-tags-heading">
                <div className="atlas-section-title">{t('am.sidebar.tags')}</div>
                <ClearTagsChip count={selectedIds.length} onClear={clearTags} />
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

            <SidebarTagList
              items={filteredItems}
              selectedIds={selectedIds}
              onSelect={selectTag}
              loading={storeState ? storeState.status === 'waiting' : tagsLoading}
              failed={storeState ? false : tagsFailed}
              emptyText={tagsSearchQuery ? t('am.sidebar.noMatchingTags') : t(storeState ? 'am.sidebar.noStoreTags' : 'am.sidebar.noTags')}
            />
          </div>

          <div className="atlas-sidebar-spacer" />

          {footer}

          {!storeTags && onManageTags && (
            <div className="atlas-sidebar-actions">
              <Button
                variant="ghost"
                className="atlas-asset-manager-manage-btn"
                onClick={(e) => { e.stopPropagation(); onManageTags(); }}
              >
                <Settings />
                <span>{t('am.sidebar.manage')}</span>
              </Button>
            </div>
          )}
        </motion.div>
      </motion.aside>
    </MotionConfig>
  );
}
