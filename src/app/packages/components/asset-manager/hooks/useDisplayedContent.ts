import { useMemo, type RefObject } from 'react';
import type { AnyAsset, Folder, Tab } from '../types';
import type { AssetData } from './useAssetData';
import type { SelectionState, VisibleIds } from './useSelectionHandlers';
import { useHeldWhile } from './useHeldWhile';
import { useCreatureFilters, type CreatureFiltering } from './useCreatureFilters';
import { useCollectionFilterDefinitions } from './useCollectionFilterDefinitions';
import { useFilterSearch, useSearchKeywords, type FilterSearch, type SearchKeywords } from './useFilterSearch';
import { useLoadingReveal } from '../../primitives/useLoadingReveal';
import { sortAssets } from '../utils/assetSort';
import { filterFolders, isFiltering as narrows, type AssetFilter } from '../utils/assetFilter';

const NO_ASSETS: AnyAsset[] = [];

interface DisplayedContentOptions {
  isOpen: boolean;
  activeTab: Tab;
  selectedCollection: string;
  search: string;
  setSearch: (search: string) => void;
  data: AssetData;
  sel: SelectionState;
  /** Written with what is listed now, for selecting all and moving through the list by key. */
  visibleIds: RefObject<VisibleIds>;
}

/** What the content pane shows: one place, as loaded, filtered and sorted, held while the next place loads. */
export interface ShownContent {
  collection: string;
  tab: Tab;
  loading: boolean;
  failed: boolean;
  assets: AnyAsset[];
  folders: Folder[];
  folderId: string | null;
  folderPath: Folder[];
  refinement: string;
}

export interface DisplayedContent {
  searchKeywords: SearchKeywords;
  creature: CreatureFiltering;
  filterSearch: FilterSearch;
  shown: ShownContent;
  showSkeleton: boolean;
  showTagSkeleton: boolean;
  /** A search, tags or creature filters narrow the list, which then lists their matches from every folder of the tab. */
  isFiltering: boolean;
}

/** The search, the filters and the sorting applied to the loaded assets and folders, and the place the pane shows. */
export function useDisplayedContent({ isOpen, activeTab, selectedCollection, search, setSearch, data, sel, visibleIds }: DisplayedContentOptions): DisplayedContent {
  const filterDefinitions = useCollectionFilterDefinitions(data.app, data.assetService, selectedCollection);
  const searchKeywords = useSearchKeywords(activeTab, filterDefinitions, search);

  const assetFilter = useMemo((): AssetFilter => ({
    tab: activeTab,
    folderId: sel.selectedFolderId,
    search: searchKeywords.nameQuery,
    tags: sel.selectedTagIds.map((tagId) => data.availableTags.find((tag) => tag.id === tagId) ?? { id: tagId, name: tagId }),
  }), [activeTab, sel.selectedFolderId, searchKeywords.nameQuery, sel.selectedTagIds, data.availableTags]);

  const creature = useCreatureFilters({
    app: data.app, definitions: filterDefinitions, isOpen,
    assets: data.assets, filter: assetFilter,
  });

  const filterSearch = useFilterSearch({
    keywords: searchKeywords,
    setSearch,
    panel: creature.panel,
    tags: data.availableTags,
    tagIds: sel.selectedTagIds,
    setTagIds: sel.setSelectedTagIds,
  });

  const displayedAssets = useMemo(
    () => sortAssets(creature.assets, sel.sortBy, sel.sortOrder, creature.ratingOf),
    [creature.assets, sel.sortBy, sel.sortOrder, creature.ratingOf],
  );

  const isFiltering = narrows(creature.filter);
  const displayedFolders = useMemo(() => filterFolders(data.folders, creature.filter), [data.folders, creature.filter]);

  // A change of tab or collection keeps the previous content on screen, untouched by the
  // resets the change triggers, while its assets load: a quick load swaps the panes once.
  // A load that takes longer gives way to the skeleton of the new place, so the manager
  // answers at once however long its content takes.
  const showSkeleton = useLoadingReveal(data.assetsLoading);
  // The tag list keeps the tags it shows while a quick load replaces them, as the content does.
  const showTagSkeleton = useLoadingReveal(data.tagsLoading);
  const isPending = data.assetsLoading || showSkeleton;
  const shown = useHeldWhile(data.assetsLoading && !showSkeleton, {
    collection: selectedCollection,
    tab: activeTab,
    loading: isPending,
    failed: data.assetsFailed,
    assets: isPending ? NO_ASSETS : displayedAssets,
    folders: displayedFolders,
    folderId: sel.selectedFolderId,
    folderPath: sel.selectedFolderId ? sel.getFolderPath(sel.selectedFolderId) : [],
    refinement: [searchKeywords.nameQuery, sel.sortBy, sel.sortOrder, ...sel.selectedTagIds, creature.refinementKey].join('\n'),
  });

  visibleIds.current = {
    assets: displayedAssets.map((asset) => asset.id),
    folders: displayedFolders.map((folder) => folder.id),
  };

  return { searchKeywords, creature, filterSearch, shown, showSkeleton, showTagSkeleton, isFiltering };
}
