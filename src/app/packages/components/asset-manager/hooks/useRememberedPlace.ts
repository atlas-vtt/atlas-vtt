import { AssetService } from '../../../../services/AssetService';
import { useEffect, useMemo, useRef } from 'react';
import type { Tab } from '../types';
import type { AssetData } from './useAssetData';
import type { SelectionState } from './useSelectionHandlers';
import { AssetManagerMemory, placeToRestore, type AssetManagerPlace, type RestoredPlace } from '../assetManagerMemory';
import { isFolderOfTab } from '../utils/assetFolders';

interface RememberedPlaceDeps {
  isOpen: boolean;
  initialTab: Tab | undefined;
  data: AssetData;
  sel: SelectionState;
  /** Whether the place is kept for the next opening; a window opened to choose a map leaves the library's place alone. */
  remember: boolean;
  /** The parts of the place the manager itself holds. */
  place: Pick<RestoredPlace, 'collection' | 'tab' | 'search' | 'collapsedSections'>;
  apply: (place: Pick<RestoredPlace, 'collection' | 'tab' | 'search' | 'collapsedSections'>) => void;
}

/**
 * Opens the asset manager where it was left (tab, collection, folder, search,
 * tag filter, sort) and remembers that place when it closes or unmounts.
 */
export function useRememberedPlace({ isOpen, initialTab, data, sel, remember, place, apply }: RememberedPlaceDeps): AssetManagerMemory {
  const memory = useMemo(() => AssetManagerMemory.forApp(data.app), [data.app]);
  const openedOver = useRef<string | null>(null);
  const latest = useRef<AssetManagerPlace | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const mapCollection = data.mapPath ? data.assetService?.getCollectionForMap(data.mapPath) ?? null : null;
    openedOver.current = mapCollection;
    const restored = placeToRestore(memory.getPlace(), {
      requestedTab: initialTab,
      mapCollection,
      defaultCollection: AssetService.defaultCollectionId(),
      folderExists: (folderId, collection, tab) => isFolderOfTab(data.app, folderId, collection, tab),
    });

    apply(restored);
    sel.setSelectedFolderId(restored.folderId);
    sel.setSelectedTagIds(restored.tagIds);
    sel.setSortBy(restored.sortBy);
    sel.setSortOrder(restored.sortOrder);
    sel.setSelectedAssetIds([]);
    sel.setSelectedFolderIds([]);
    sel.setSpawnCounts({});
    sel.navigationHistory.clear();
    sel.navigationHistory.push(null);
    if (restored.folderId) sel.navigationHistory.push(restored.folderId);
  }, [isOpen]);

  // The place as last shown; a closed manager keeps the place it was closed at
  useEffect(() => {
    if (!isOpen) return;
    latest.current = {
      ...place,
      mapCollection: openedOver.current,
      folderId: sel.selectedFolderId,
      tagIds: sel.selectedTagIds,
      sortBy: sel.sortBy,
      sortOrder: sel.sortOrder,
    };
  });

  // A remembered tag deleted since would hide every asset; drop it once the collection's tags are in
  const { tagsCollection, availableTags } = data;
  const { selectedTagIds, setSelectedTagIds } = sel;
  useEffect(() => {
    if (tagsCollection !== place.collection) return;
    const known = new Set(availableTags.map((tag) => tag.id));
    if (selectedTagIds.some((id) => !known.has(id))) setSelectedTagIds((ids) => ids.filter((id) => known.has(id)));
  }, [tagsCollection, availableTags, place.collection, selectedTagIds, setSelectedTagIds]);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen) {
      wasOpen.current = true;
      return;
    }
    if (remember && wasOpen.current && latest.current) memory.setPlace(latest.current);
    wasOpen.current = false;
  }, [isOpen, memory, remember]);

  useEffect(() => () => {
    if (remember && wasOpen.current && latest.current) memory.setPlace(latest.current);
  }, [memory, remember]);

  return memory;
}
