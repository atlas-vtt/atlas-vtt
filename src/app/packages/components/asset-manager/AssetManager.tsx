import { AssetService } from '../../../services/AssetService';
import { useAtlasSettings } from '../../../keyboard/useMapHotkeys';
import { SettingsService } from '../../../services/SettingsService';
import React, { useState, useRef, useMemo, useCallback, startTransition } from 'react';
import type { AssetManagerProps, Tab } from './types';

import { Header } from './components/Header';
import type { HeaderMenuHandle } from './components/HeaderMenu';
import { Sidebar } from './components/Sidebar';
import { BestiaryTokensOffer } from './components/BestiaryTokensOffer';
import { useStarterOfferDismissal } from './hooks/useStarterOfferDismissal';
import { EmptyTabAction, type CreatableTab } from './components/EmptyTabAction';
import { Content } from './components/Content';
import { LocationBar } from './components/LocationBar';
import { ModalLayer } from './components/ModalLayer';
import { AssetManagerWindow, useOpenedAfterPress } from './components/AssetManagerWindow';
import { AssetManagerTours } from './components/AssetManagerTours';
import { useAssetData } from './hooks/useAssetData';
import { useSelectionHandlers, type VisibleIds } from './hooks/useSelectionHandlers';
import { useAssetCrud } from './hooks/useAssetCrud';
import { useTagsAndCollections } from './hooks/useTagsAndCollections';
import { AssetTagMenuContext, type AssetTagMenuActions } from './components/assetTagMenuContext';
import { tagGroupOfTab } from './utils/assetTags';
import { useContextMenus } from './hooks/useContextMenus';
import { useStatblockLink } from './hooks/useStatblockLink';
import { useAssetManagerEffects } from './hooks/useAssetManagerEffects';
import { useAssetManagerShortcuts } from './hooks/useAssetManagerShortcuts';
import { hasOpenDialog } from './utils/openDialogs';
import { useFollowSelectedCollection } from './hooks/useFollowSelectedCollection';
import { useOverlayBodyClass } from './hooks/useOverlayBodyClass';
import { useSidebarLayout } from './hooks/useSidebarLayout';
import { useRememberedPlace } from './hooks/useRememberedPlace';
import { useLeaveHiddenFolder } from './hooks/useLeaveHiddenFolder';
import { useDisplayedContent } from './hooks/useDisplayedContent';
import { useRevealMoved } from './hooks/useRevealMoved';
import { ActiveFilterBar } from './components/search/ActiveFilterBar';
import { showDungeonGenerator } from '../dungeon-generator/openDungeonGenerator';
import { runInBackground } from '../../../utils/backgroundTask';

export default function AssetManager({ isOpen: isOpenProp, onClose, initialTab, onExitComplete }: AssetManagerProps): React.JSX.Element {
  const isOpen = useOpenedAfterPress(isOpenProp);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('tokens');
  const [selectedCollection, setSelectedCollection] = useState(() => AssetService.defaultCollectionId());
  const [collapsedSections, setCollapsedSections] = useState<{ folders: boolean; assets: boolean }>({ folders: false, assets: false });
  const [draggedItems, setDraggedItems] = useState<{ type: 'asset' | 'folder'; ids: string[] } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useOverlayBodyClass(modalRef);
  const containerRef = useRef<HTMLDivElement>(null);
  const sidebar = useSidebarLayout(containerRef, isOpen);

  const data = useAssetData(activeTab, selectedCollection, isOpen);
  useFollowSelectedCollection(data.collections, selectedCollection, setSelectedCollection);
  const settings = useAtlasSettings(SettingsService.forApp(data.app));

  const visibleIds = useRef<VisibleIds>({ assets: [], folders: [] });
  const sel = useSelectionHandlers(visibleIds, data.folders, activeTab, isOpen);
  useLeaveHiddenFolder(data, sel);

  // Another tab or collection renders the whole window again: as a transition, in slices between frames.
  const changeTab = useCallback((tab: Tab): void => {
    if (tab === activeTab) return;
    startTransition(() => {
      setActiveTab(tab);
      sel.resetForTab();
    });
  }, [activeTab, sel.resetForTab]);

  const memory = useRememberedPlace({
    isOpen, initialTab, data, sel,
    place: { collection: selectedCollection, tab: activeTab, search, collapsedSections },
    apply: (place) => {
      setActiveTab(place.tab);
      setSelectedCollection(place.collection);
      setSearch(place.search);
      setCollapsedSections(place.collapsedSections);
    },
  });

  // The open folder, the selection and the tags belong to the collection they were chosen in.
  const changeCollection = (collectionId: string): void => {
    if (collectionId === selectedCollection) return;
    startTransition(() => {
      setSelectedCollection(collectionId);
      sel.resetForTab();
    });
  };

  const { creature, filterSearch, shown, showSkeleton, showTagSkeleton, isFiltering } = useDisplayedContent({
    isOpen, activeTab, selectedCollection, search, setSearch, data, sel, visibleIds,
  });

  // Where a move's notice takes the GM: the cards' new place, with them selected (decision #37).
  const reveal = useRevealMoved({ selectedCollection, changeCollection, assets: data.assets, assetsLoading: data.assetsLoading, sel });

  const crud = useAssetCrud(
    data.app, data.assetService, activeTab, selectedCollection,
    sel.selectedFolderId, data.folders, data.collections,
    data.setFolders, data.reloadCollections, setSelectedCollection,
    data.loadFoldersForActiveTab, data.loadAssetsForActiveTab,
    draggedItems, setDraggedItems, setDropTarget, data.setAssets, reveal.inFolder,
  );

  const tags = useTagsAndCollections(
    data.assetService, selectedCollection, data.tagsByGroup,
    data.setAssets, data.reloadCollections, data.reloadGlobalTags,
  );
  const tagGroup = tagGroupOfTab(activeTab);
  const tagMenuActions = useMemo((): AssetTagMenuActions => ({
    tags: data.availableTags,
    setAssetTags: tags.setAssetTags,
    createTag: (name) => tags.handleCreateTag(tagGroup, name),
  }), [data.availableTags, tags.setAssetTags, tags.handleCreateTag, tagGroup]);

  const statblock = useStatblockLink(data.app);

  const { handleAssetContextMenu, handleAssetDelete, handleFolderContextMenu, handleContentContextMenu } =
    useContextMenus({ data, sel, crud, tags, statblock, selectedCollection, activeTab, onClose, openCollection: reveal.inCollection });

  useAssetManagerEffects({
    isOpen, onClose,
    modalRef, containerRef,
    activeTab, changeTab,
    data, sel, crud, tags, statblock, setSearch,
  });
  const createMenu = useRef<HeaderMenuHandle>(null);
  useAssetManagerShortcuts(data.app, isOpen && !hasOpenDialog(crud, tags, statblock), containerRef, changeTab, () => createMenu.current?.open());

  const onCreate: Record<CreatableTab, () => void> = {
    tokens: () => crud.setIsTokenCreatorOpen(true),
    maps: crud.handleCreateMap,
    encounters: () => crud.setIsEncounterBuilderOpen(true),
  };
  const starterOffer = useStarterOfferDismissal(data.app, data.collections.find((option) => option.id === selectedCollection)?.uid);

  const emptyAction = (
    <EmptyTabAction tab={shown.tab} app={data.app} assetService={data.assetService} collection={selectedCollection} onCreate={onCreate} onShowMaps={() => changeTab('maps')} />
  );

  return (
    <>
      <AssetManagerWindow isOpen={isOpen} onClose={onClose} onExitComplete={onExitComplete} overlayRef={overlayRef}>
        <div
          className={`atlas-asset-manager-container ${sidebar.isFloating ? 'atlas-sidebar-floating' : ''}`}
          ref={containerRef}
        >
          <Sidebar
            selectedTagIds={sel.selectedTagIds}
            onSelectTag={sel.handleTagSelect}
            onClearTags={() => sel.setSelectedTagIds([])}
            tags={data.availableTags}
            tagsLoading={showTagSkeleton}
            tagsFailed={data.assetsFailed}
            countedAssets={creature.matching}
            collections={data.collections}
            selectedCollection={selectedCollection}
            onSelectCollection={changeCollection}
            onManageTags={() => tags.setIsTagManagerOpen(true)}
            onEditCollectionSettings={crud.setSettingsModalCollectionId}
            onExportCollection={() => { void crud.handleExportCollection(); }}
            onImportCollection={crud.handleImportCollection}
            footer={activeTab === 'tokens' && data.assetService && data.assets.length > 0 ? <BestiaryTokensOffer app={data.app} assets={data.assetService} collection={selectedCollection} variant="sidebar" dismissed={starterOffer.dismissed} {...(starterOffer.dismiss && { onDismiss: starterOffer.dismiss })} /> : null}
            layout={sidebar}
          />
          <Header
            app={data.app}
            search={search}
            onSearch={setSearch}
            query={filterSearch}
            activeTab={activeTab}
            onTabChange={changeTab}
            assetCounts={data.assetCounts}
            countsFailed={data.assetsFailed}
            onCreateTokens={() => crud.setIsTokenCreatorOpen(true)}
            onCreateMap={crud.handleCreateMap}
            onGenerateDungeon={() => {
              runInBackground(showDungeonGenerator(data.app, selectedCollection), 'Opening the dungeon generator');
              onClose();
            }}
            onCreateEncounter={() => crud.setIsEncounterBuilderOpen(true)}
            onCreateCollection={crud.handleCreateCollection}
            onCreateFolder={crud.handleCreateFolder}
            createMenu={createMenu}
            sidebarToggleLabel={sidebar.toggleLabel}
            onToggleSidebar={sidebar.toggle}
            sel={sel}
          />
          <div
            className="atlas-asset-manager-body"
            onDragOver={(e) => { if (draggedItems && sel.selectedFolderId === null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
            onDrop={(e) => { if (draggedItems && sel.selectedFolderId === null) { e.preventDefault(); crud.handleDrop(null); } }}
          >
            <ActiveFilterBar groups={filterSearch.chips} onReset={filterSearch.reset} />
            {/* A filtered list holds the matches of every folder, so the location reads as the tab's root while it shows. */}
            <LocationBar
              activeTab={shown.tab}
              path={isFiltering ? [] : shown.folderPath}
              onNavigateToFolder={sel.handleNavigateToFolder}
              sort={sel}
            />
            <div className="atlas-asset-manager-main">
              <AssetTagMenuContext.Provider value={tagMenuActions}>
                <Content
                  collection={shown.collection}
                  collectionName={data.collections.find((option) => option.id === shown.collection)?.name ?? shown.collection}
                  failed={shown.failed}
                  onRetry={data.retryLoad}
                  activeTab={shown.tab}
                  assets={shown.assets}
                  folders={shown.folders}
                  selectedAssetIds={sel.selectedAssetIds}
                  selectedFolderIds={sel.selectedFolderIds}
                  selectedFolderId={shown.folderId}
                  folderDepth={shown.folderPath.length}
                  refinement={shown.refinement}
                  loading={shown.loading}
                  showSkeleton={showSkeleton}
                  assetCount={data.assetCounts?.[shown.tab] ?? null}
                  scrollKey={`${shown.collection ?? 'default'}/${shown.tab}/${shown.folderId ?? ''}?${shown.refinement}`}
                  scrollMemory={memory}
                  onAssetSelect={sel.handleAssetSelect}
                  onAssetContextMenu={handleAssetContextMenu}
                  onAssetDelete={handleAssetDelete}
                  onLinkStatblock={statblock.openStatblockLinkModal}
                  onFolderSelection={sel.handleFolderSelection}
                  onFolderContextMenu={handleFolderContextMenu}
                  onFolderDoubleClick={sel.handleFolderDoubleClick}
                  onContentContextMenu={handleContentContextMenu}
                  onClearSelection={sel.handleClearSelection}
                  onClose={onClose}
                  collapsedSections={collapsedSections}
                  setCollapsedSections={setCollapsedSections}
                  draggedItems={draggedItems}
                  setDraggedItems={setDraggedItems}
                  dropTarget={dropTarget}
                  setDropTarget={setDropTarget}
                  onDrop={crud.handleDrop}
                  view={data.view}
                  app={data.app}
                  emptyAction={emptyAction}
                  assetService={data.assetService}
                  spawnCounts={sel.spawnCounts}
                  onSpawnCountChange={sel.handleSpawnCountChange}
                  reveal={reveal.gridReveal}
                  {...(isFiltering ? { onClearFilters: filterSearch.reset } : {})}
                />
              </AssetTagMenuContext.Provider>
            </div>
          </div>
        </div>
      </AssetManagerWindow>

      <AssetManagerTours isOpen={isOpen} settings={settings} crud={crud} tags={tags} statblock={statblock} />

      <ModalLayer
        isOpen={isOpen}
        activeTab={activeTab}
        selectedCollection={selectedCollection}
        onClose={onClose}
        data={data}
        sel={sel}
        crud={crud}
        tags={tags}
        statblock={statblock}
      />
    </>
  );
}
