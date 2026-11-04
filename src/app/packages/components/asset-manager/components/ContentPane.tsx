import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PackageOpen } from 'lucide-react';
import type { App } from 'obsidian';
import type {
  Tab, AnyAsset, Folder as FolderType, SelectionEvent,
} from '../types';
import { getTabDisplayName } from '../types';
import { AssetCard } from './AssetCard';
import { FolderGridItem } from './FolderGridItem';
import { SectionHeader } from './SectionHeader';
import { SelectionInfo } from './SelectionInfo';
import { VirtualAssetGrid } from './VirtualAssetGrid';
import { fadeVariants } from './gridMotion';
import { useOpenAsset } from '../hooks/useOpenAsset';
import { useArtPriority } from '../hooks/useArtPriority';
import { useAssetCardHandlers, type DraggedItems } from '../hooks/useAssetCardHandlers';
import type { AssetService } from '../../../../services/AssetService';
import type { AtlasView } from '../../../../atlas-view';
import { useSpawnCountTyping } from '../hooks/useSpawnCountTyping';
import { useAssetStatblockPreview } from '../hooks/useAssetStatblockPreview';
import { useRememberedScroll, type ScrollMemory } from '../hooks/useRememberedScroll';
import { useScrollbarGutter } from '../../primitives/useScrollbarGutter';
import { MapProcessing } from '../../../../pixi/mosaicCanvas/mapProcessing';
import { MapProcessingContext, type MapProcessingLookup } from './mapProcessingContext';
import { Button } from '../../primitives/button';
import { t } from '../../../../i18n';

export interface ContentPaneProps {
  activeTab: Tab;
  /** The assets of the open folder, filtered and sorted. */
  assets: AnyAsset[];
  /** The subfolders of the open folder. */
  folders: FolderType[];
  selectedAssetIds: string[];
  selectedFolderIds: string[];
  onAssetSelect: (assetId: string, event?: SelectionEvent, toggle?: boolean) => void;
  onAssetContextMenu: (asset: AnyAsset, event: React.MouseEvent) => void;
  onFolderSelection: (folderId: string, event?: SelectionEvent) => void;
  onFolderContextMenu: (folder: FolderType, event: React.MouseEvent) => void;
  onFolderDoubleClick: (folderId: string) => void;
  onContentContextMenu: (event: React.MouseEvent) => void;
  onClearSelection: () => void;
  onClose: () => void;
  collapsedSections: { folders: boolean; assets: boolean };
  setCollapsedSections: React.Dispatch<React.SetStateAction<{ folders: boolean; assets: boolean }>>;
  draggedItems: DraggedItems | null;
  setDraggedItems: React.Dispatch<React.SetStateAction<DraggedItems | null>>;
  dropTarget: string | null;
  setDropTarget: React.Dispatch<React.SetStateAction<string | null>>;
  onDrop: (targetFolderId: string | null) => void;
  view: AtlasView | null;
  app: App;
  assetService: AssetService | null;
  spawnCounts: Record<string, number>;
  onSpawnCountChange: (assetId: string, count: number) => void;
  /** Identifies the place the pane shows (collection, tab, folder, refinement) for its scroll position. */
  scrollKey: string;
  scrollMemory: ScrollMemory;
  /** Set while filters narrow the list; the empty state offers to clear them. */
  onClearFilters?: () => void;
}

const NO_IDS: ReadonlySet<string> = new Set();

/** The scrolling content of one folder: its subfolders and assets, or the empty state. */
export function ContentPane(props: ContentPaneProps): React.JSX.Element {
  const {
    activeTab, assets, folders, selectedAssetIds, selectedFolderIds,
    onFolderSelection, onFolderContextMenu, onFolderDoubleClick, onContentContextMenu, onClearSelection,
    collapsedSections, setCollapsedSections, draggedItems, setDraggedItems, dropTarget, setDropTarget, onDrop,
    spawnCounts,
  } = props;
  // Each pane scrolls on its own, so the pane leaving during a folder change keeps its position.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  // The grid only animates in when it appears inside a pane already on screen.
  const paneShown = useRef(false);
  useEffect(() => { paneShown.current = true; }, []);

  const openAsset = useOpenAsset({
    app: props.app, view: props.view,
    assetService: props.assetService, onClose: props.onClose,
  });
  const onArtNeeded = useArtPriority(props.app, props.assetService);
  const cardHandlers = useAssetCardHandlers({
    app: props.app, openAsset, selectedAssetIds, setDraggedItems,
    onAssetSelect: props.onAssetSelect, onAssetContextMenu: props.onAssetContextMenu,
    onSpawnCountChange: props.onSpawnCountChange, onArtNeeded, onClose: props.onClose,
  });
  useSpawnCountTyping(scrollElement, props.onSpawnCountChange);
  useAssetStatblockPreview({
    app: props.app, container: scrollElement, assets,
    suspended: selectedAssetIds.length > 0 || draggedItems !== null,
  });
  useScrollbarGutter(scrollElement);
  useRememberedScroll(scrollElement, props.scrollKey, props.scrollMemory);

  const processing = useMemo((): MapProcessingLookup => ({ app: props.app, processing: MapProcessing.forApp(props.app) }), [props.app]);
  const selectedIds = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const draggingIds = useMemo(
    () => (draggedItems?.type === 'asset' ? new Set(draggedItems.ids) : NO_IDS),
    [draggedItems],
  );

  const renderCard = useCallback((asset: AnyAsset): React.ReactNode => (
    <AssetCard
      key={asset.id}
      asset={asset}
      isSelected={selectedIds.has(asset.id)}
      isDragging={draggingIds.has(asset.id)}
      spawnCount={spawnCounts[asset.id] || 1}
      {...cardHandlers}
    />
  ), [selectedIds, draggingIds, spawnCounts, cardHandlers]);

  const clearIfBackground = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) onClearSelection();
  };

  const startFolderDrag = (folderId: string, event: React.DragEvent): void => {
    setDraggedItems({ type: 'folder', ids: selectedFolderIds.includes(folderId) ? selectedFolderIds : [folderId] });
    event.dataTransfer.effectAllowed = 'move';
  };
  const endDrag = (): void => { setDraggedItems(null); setDropTarget(null); };

  const isEmpty = assets.length === 0 && folders.length === 0;
  // The first section's header carries the selection, under the sort.
  const selection = (
    <SelectionInfo count={selectedAssetIds.length + selectedFolderIds.length} onClear={onClearSelection} />
  );

  return (
    <div
      ref={setScrollElement}
      className="atlas-asset-manager-content"
      onContextMenu={onContentContextMenu}
      onClick={clearIfBackground}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isEmpty ? (
          <motion.div key="empty" className="atlas-empty-state" variants={fadeVariants} initial="hidden" animate="visible" exit="exit">
            <PackageOpen className="atlas-empty-icon" />
            <h3>{t(props.onClearFilters ? 'am.empty.noMatch' : 'am.empty.none', { tab: getTabDisplayName(activeTab).toLocaleLowerCase() })}</h3>
            {props.onClearFilters ? (
              <Button variant="outline" className="atlas-empty-action" onClick={props.onClearFilters}>{t('am.empty.clearFilters')}</Button>
            ) : (
              <p>{t(activeTab === 'party' ? 'am.empty.partyHint' : 'am.empty.hint')}</p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="sections"
            className="atlas-content-sections"
            variants={fadeVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={clearIfBackground}
          >
            {folders.length > 0 && (
              <section className="atlas-content-section">
                <SectionHeader
                  title={t('am.folders')}
                  count={folders.length}
                  collapsed={collapsedSections.folders}
                  onToggle={() => setCollapsedSections((prev) => ({ ...prev, folders: !prev.folders }))}
                  end={selection}
                />
                {!collapsedSections.folders && (
                  <div className="atlas-folder-grid" onClick={clearIfBackground}>
                    {folders.map((folder) => (
                      <FolderGridItem
                        key={`folder-${folder.id}`}
                        folder={folder}
                        isSelected={selectedFolderIds.includes(folder.id)}
                        isDropTarget={dropTarget === folder.id}
                        canReceiveDrop={draggedItems !== null && !draggedItems.ids.includes(folder.id)}
                        onSelection={onFolderSelection}
                        onOpen={onFolderDoubleClick}
                        onContextMenu={onFolderContextMenu}
                        onDragStart={startFolderDrag}
                        onDragEnd={endDrag}
                        onDragOverTarget={setDropTarget}
                        onDrop={onDrop}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {assets.length > 0 && (
              <section className="atlas-content-section">
                <SectionHeader
                  title={getTabDisplayName(activeTab)}
                  count={assets.length}
                  collapsed={collapsedSections.assets}
                  onToggle={() => setCollapsedSections((prev) => ({ ...prev, assets: !prev.assets }))}
                  end={folders.length === 0 && selection}
                />
                {!collapsedSections.assets && (
                  <MapProcessingContext.Provider value={processing}>
                    <VirtualAssetGrid
                      assets={assets}
                      scrollElement={scrollElement}
                      renderCard={renderCard}
                      onBackgroundClick={clearIfBackground}
                      appear={paneShown.current}
                    />
                  </MapProcessingContext.Provider>
                )}
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
