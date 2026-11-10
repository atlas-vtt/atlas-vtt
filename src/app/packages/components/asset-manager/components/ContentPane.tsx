import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PackageOpen, SearchX } from 'lucide-react';
import type { App } from 'obsidian';
import type {
  Tab, AnyAsset, Folder as FolderType, SelectionEvent, TokenAsset,
} from '../types';
import { getTabDisplayName } from '../types';
import { AssetCard } from './AssetCard';
import { FolderGridItem } from './FolderGridItem';
import { SectionHeader } from './SectionHeader';
import { SelectionInfo } from './SelectionInfo';
import { selectedCardAction } from '../utils/cardMainAction';
import { VirtualAssetGrid, type CardSlot } from './VirtualAssetGrid';
import type { GridReveal } from '../hooks/useRevealMoved';
import { fadeVariants } from './gridMotion';
import { useOpenAsset } from '../hooks/useOpenAsset';
import { useArtPriority } from '../hooks/useArtPriority';
import { useAssetCardHandlers, type DraggedItems } from '../hooks/useAssetCardHandlers';
import { useFolderGridKeys } from '../hooks/useFolderGridKeys';
import type { MenuAnchor } from '../utils/menuAnchor';
import type { AssetService } from '../../../../services/AssetService';
import type { AtlasView } from '../../../../atlas-view';
import { useSpawnCountTyping } from '../hooks/useSpawnCountTyping';
import { useAssetStatblockPreview } from '../hooks/useAssetStatblockPreview';
import { useMissingStatblocks } from '../hooks/useMissingStatblocks';
import { useRememberedScroll, type ScrollMemory } from '../hooks/useRememberedScroll';
import { MapProcessing } from '../../../../pixi/mosaicCanvas/mapProcessing';
import { MapProcessingContext, type MapProcessingLookup } from './mapProcessingContext';
import { Button } from '../../primitives/button';
import { PaneMessage } from './PaneMessage';
import { t } from '../../../../i18n';

export interface ContentPaneProps {
  /** The collection shown; another one swaps the pane in place. */
  collection: string;
  activeTab: Tab;
  /** The assets of the open folder, filtered and sorted. */
  assets: AnyAsset[];
  /** The subfolders of the open folder. */
  folders: FolderType[];
  selectedAssetIds: string[];
  selectedFolderIds: string[];
  onAssetSelect: (assetId: string, event?: SelectionEvent, toggle?: boolean) => void;
  onAssetContextMenu: (asset: AnyAsset, anchor: MenuAnchor) => void;
  /** Asks to delete the selection, or the asset alone where it is not part of it (the Delete key). */
  onAssetDelete: (asset: AnyAsset) => void;
  /** Opens the dialog that links a token to a statblock. */
  onLinkStatblock: (asset: TokenAsset) => void;
  onFolderSelection: (folderId: string, event?: SelectionEvent) => void;
  onFolderContextMenu: (folder: FolderType, anchor: MenuAnchor) => void;
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
  /** How many assets the tab holds; null while that is not known. Sizes the skeleton while the tab loads. */
  assetCount: number | null;
  /** Set while a search, tags or filters narrow the list: an empty list then has no match, and the state offers to clear them. */
  onClearFilters?: () => void;
  /** What an empty tab offers to make (`EmptyTabAction`), when no filter made it empty. */
  emptyAction?: React.ReactNode;
  /** A card to bring into view and focus once it is listed: where a move notice's button took the GM. */
  reveal?: GridReveal | null;
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
    assetService: props.assetService, onClose: props.onClose, collectionId: props.collection,
  }, activeTab);
  const onArtNeeded = useArtPriority(props.app, props.assetService);
  const cardHandlers = useAssetCardHandlers({
    app: props.app, openAsset, selectedAssetIds, setDraggedItems,
    onAssetSelect: props.onAssetSelect, onAssetContextMenu: props.onAssetContextMenu, onAssetDelete: props.onAssetDelete,
    onSpawnCountChange: props.onSpawnCountChange, onArtNeeded, onLinkStatblock: props.onLinkStatblock, onClose: props.onClose,
  });
  const missingStatblocks = useMissingStatblocks(props.app, assets);
  useSpawnCountTyping(scrollElement, props.onSpawnCountChange);
  useAssetStatblockPreview({
    app: props.app, container: scrollElement, assets,
    suspended: selectedAssetIds.length > 0 || draggedItems !== null,
  });
  useRememberedScroll(scrollElement, props.scrollKey, props.scrollMemory);

  const processing = useMemo((): MapProcessingLookup => ({ app: props.app, processing: MapProcessing.forApp(props.app) }), [props.app]);
  const selectedIds = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const draggingIds = useMemo(
    () => (draggedItems?.type === 'asset' ? new Set(draggedItems.ids) : NO_IDS),
    [draggedItems],
  );

  const renderCard = useCallback((asset: AnyAsset, slot: CardSlot): React.ReactNode => (
    <AssetCard
      key={asset.id}
      asset={asset}
      {...slot}
      isSelected={selectedIds.has(asset.id)}
      isDragging={draggingIds.has(asset.id)}
      spawnCount={spawnCounts[asset.id] || 1}
      statblockMissing={asset.type === 'tokens' && missingStatblocks.has(asset.statblockPath ?? '')}
      {...cardHandlers}
    />
  ), [selectedIds, draggingIds, spawnCounts, missingStatblocks, cardHandlers]);

  const clearIfBackground = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) onClearSelection();
  };

  const startFolderDrag = (folderId: string, event: React.DragEvent): void => {
    setDraggedItems({ type: 'folder', ids: selectedFolderIds.includes(folderId) ? selectedFolderIds : [folderId] });
    event.dataTransfer.effectAllowed = 'move';
  };
  const endDrag = (): void => { setDraggedItems(null); setDropTarget(null); };
  const folderKeys = useFolderGridKeys(onFolderSelection);

  const isEmpty = assets.length === 0 && folders.length === 0;
  const tabName = getTabDisplayName(activeTab).toLocaleLowerCase();
  // The first section's header carries the selection, under the sort.
  const selectedCount = selectedAssetIds.length + selectedFolderIds.length;
  const soleSelected = selectedCount === 1 ? assets.find((asset) => asset.id === selectedAssetIds[0]) : undefined;
  const selection = (
    <SelectionInfo count={selectedCount} action={soleSelected ? selectedCardAction(soleSelected.type) : null} onClear={onClearSelection} />
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
            {props.onClearFilters ? (
              <PaneMessage
                icon={SearchX}
                title={t('am.empty.noMatch', { tab: tabName })}
                action={<Button variant="outline" className="atlas-empty-action" onClick={props.onClearFilters}>{t('am.empty.clearFilters')}</Button>}
              />
            ) : (
              <PaneMessage icon={PackageOpen} title={t('am.empty.none', { tab: tabName })} action={props.emptyAction} />
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
                  <div
                    className="atlas-folder-grid"
                    onClick={clearIfBackground}
                    role="listbox"
                    aria-label={t('am.folders')}
                    aria-multiselectable="true"
                    onKeyDown={folderKeys}
                  >
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
                      label={getTabDisplayName(activeTab)}
                      onSelect={props.onAssetSelect}
                      appear={paneShown.current}
                      reveal={props.reveal}
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
