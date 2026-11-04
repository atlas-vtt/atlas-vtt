import type * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import type { Folder, Tab, SortOption, SortOrder, SelectionEvent } from '../types';
import { NavigationHistory } from '../NavigationHistory';
import { applyClickSelection, resolveSelectAll } from '../utils/clickSelection';
import { clampSpawnCount } from '../utils/spawnCount';
import { resolveSortOption, sortOptionsFor } from '../utils/assetSort';
import { isTextEntryTarget } from '../../../../keyboard/textEntry';

/** IDs currently rendered, in display order, so Shift-click can span them. */
export interface VisibleIds {
  assets: string[];
  folders: string[];
}

export interface SelectionState {
  selectedAssetIds: string[];
  selectedFolderIds: string[];
  selectedFolderId: string | null;
  selectedTagIds: string[];
  spawnCounts: Record<string, number>;
  navigationHistory: NavigationHistory;
  /** The chosen sort option as it applies to the active tab. */
  sortBy: SortOption;
  /** The sort options of the active tab. */
  sortOptions: readonly SortOption[];
  sortOrder: SortOrder;
  // Setters
  setSelectedAssetIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedFolderIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedFolderId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedTagIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSpawnCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setSortBy: React.Dispatch<React.SetStateAction<SortOption>>;
  setSortOrder: React.Dispatch<React.SetStateAction<SortOrder>>;
  // Handlers
  handleAssetSelect: (assetId: string, event?: SelectionEvent, toggle?: boolean) => void;
  handleFolderSelect: (folderId: string | null) => void;
  handleFolderSelection: (folderId: string, event?: SelectionEvent) => void;
  handleFolderDoubleClick: (folderId: string) => void;
  handleNavigateBack: () => void;
  handleNavigateForward: () => void;
  handleNavigateToFolder: (folderId: string | null) => void;
  handleTagSelect: (tagId: string) => void;
  handleClearSelection: () => void;
  /** Back at the root with nothing selected, as a new tab or collection starts. */
  resetForTab: () => void;
  /** Sets how many copies spawning the asset places; 1 clears the counter. */
  handleSpawnCountChange: (assetId: string, count: number) => void;
  getFolderPath: (folderId: string) => Folder[];
}

export function useSelectionHandlers(
  visibleIds: React.RefObject<VisibleIds>,
  folders: Folder[],
  activeTab: Tab,
  isOpen: boolean
): SelectionState {
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [spawnCounts, setSpawnCounts] = useState<Record<string, number>>({});
  const [chosenSortBy, setSortBy] = useState<SortOption>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [navigationHistory] = useState(() => new NavigationHistory());

  // ── Handlers ──────────────────────────────────────────────────

  const assetAnchor = useRef<string | null>(null);
  const folderAnchor = useRef<string | null>(null);

  const handleAssetSelect = (assetId: string, event?: SelectionEvent, toggle = false): void => {
    const next = applyClickSelection({
      selected: selectedAssetIds,
      orderedIds: visibleIds.current.assets,
      id: assetId,
      anchorId: assetAnchor.current,
      event,
      toggle,
    });
    assetAnchor.current = next.anchorId;
    setSelectedAssetIds(next.selected);
    setSpawnCounts((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => next.selected.includes(id)))
    );
  };

  const handleFolderSelect = (folderId: string | null): void => {
    setSelectedFolderId(folderId);
    setSelectedAssetIds([]);
    setSelectedFolderIds([]);
  };

  const handleFolderSelection = (folderId: string, event?: SelectionEvent): void => {
    const next = applyClickSelection({
      selected: selectedFolderIds,
      orderedIds: visibleIds.current.folders,
      id: folderId,
      anchorId: folderAnchor.current,
      event,
    });
    folderAnchor.current = next.anchorId;
    setSelectedFolderIds(next.selected);
  };

  const handleNavigateToFolder = (folderId: string | null): void => {
    if (folderId !== selectedFolderId) {
      setSelectedFolderId(folderId);
      navigationHistory.push(folderId);
      setSelectedAssetIds([]);
      setSelectedFolderIds([]);
    }
  };

  const handleFolderDoubleClick = (folderId: string): void => {
    handleNavigateToFolder(folderId);
  };

  const handleNavigateBack = (): void => {
    const prev = navigationHistory.back();
    if (prev !== undefined) {
      setSelectedFolderId(prev);
      setSelectedAssetIds([]);
      setSelectedFolderIds([]);
    }
  };

  const handleNavigateForward = (): void => {
    const next = navigationHistory.forward();
    if (next !== undefined) {
      setSelectedFolderId(next);
      setSelectedAssetIds([]);
      setSelectedFolderIds([]);
    }
  };

  const handleTagSelect = (tagId: string): void => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const resetForTab = (): void => {
    setSelectedAssetIds([]);
    setSelectedFolderIds([]);
    setSelectedFolderId(null);
    setSelectedTagIds([]);
    navigationHistory.clear();
    navigationHistory.push(null);
  };

  const handleClearSelection = (): void => {
    setSelectedAssetIds([]);
    setSelectedFolderIds([]);
    setSpawnCounts({});
  };

  const handleSpawnCountChange = (assetId: string, count: number): void => {
    setSpawnCounts((prev) => {
      const next = clampSpawnCount(count);
      if (next === 1) {
        const { [assetId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [assetId]: next };
    });
  };

  const getFolderPath = (folderId: string): Folder[] => {
    const path: Folder[] = [];
    let cur: string | null = folderId;
    let depth = 0;
    while (cur && depth < 10) {
      const f = folders.find((x) => x.id === cur);
      if (f) { path.unshift(f); cur = f.parentId || null; }
      else break;
      depth++;
    }
    return path;
  };

  // ── Select-all shortcut ───────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'a' && !isTextEntryTarget(event.target)) {
        event.preventDefault();
        const next = resolveSelectAll({ visible: visibleIds.current, selectedAssetIds, selectedFolderIds });
        setSelectedAssetIds(next.assets);
        setSelectedFolderIds(next.folders);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, visibleIds, selectedAssetIds, selectedFolderIds]);

  const sortBy = resolveSortOption(chosenSortBy, activeTab);
  const sortOptions = sortOptionsFor(activeTab);

  return {
    selectedAssetIds, selectedFolderIds, selectedFolderId, selectedTagIds,
    spawnCounts, navigationHistory, sortBy, sortOptions, sortOrder,
    setSelectedAssetIds, setSelectedFolderIds, setSelectedFolderId, setSelectedTagIds,
    setSpawnCounts, setSortBy, setSortOrder,
    handleAssetSelect, handleFolderSelect, handleFolderSelection,
    handleFolderDoubleClick, handleNavigateBack, handleNavigateForward,
    handleNavigateToFolder, handleTagSelect, handleClearSelection, resetForTab, handleSpawnCountChange,
    getFolderPath,
  };
}
