import { Tutorial } from '../../../onboarding/Tutorial';
import { AssetService } from '../../../services/AssetService';
import { useAtlasSettings } from '../../../keyboard/useMapHotkeys';
import { SettingsService } from '../../../services/SettingsService';
import React, { useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AnyAsset, AssetManagerProps, Tab } from './types';

import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Content } from './components/Content';
import { Breadcrumb } from './components/Breadcrumb';
import { ModalLayer } from './components/ModalLayer';
import { useAssetData } from './hooks/useAssetData';
import { useSelectionHandlers, type VisibleIds } from './hooks/useSelectionHandlers';
import { useAssetCrud } from './hooks/useAssetCrud';
import { useTagsAndCollections } from './hooks/useTagsAndCollections';
import { AssetTagMenuContext, type AssetTagMenuActions } from './components/assetTagMenuContext';
import { tagGroupOfTab } from './utils/assetTags';
import { useContextMenus } from './hooks/useContextMenus';
import { useStatblockLink } from './hooks/useStatblockLink';
import { useAssetManagerEffects } from './hooks/useAssetManagerEffects';
import { useFollowSelectedCollection } from './hooks/useFollowSelectedCollection';
import { useHeldWhile } from './hooks/useHeldWhile';
import { useLoadingReveal } from '../primitives/useLoadingReveal';
import { useSidebarLayout } from './hooks/useSidebarLayout';
import { useRememberedPlace } from './hooks/useRememberedPlace';
import { useExtensionTabs } from '../../../extensions/useExtensionTabs';
import { assetTabSlot } from '../../../extensions/slots';
import { ExtensionAssetPane } from './components/ExtensionAssetPane';
import { sortAssets } from './utils/assetSort';
import { filterFolders, type AssetFilter } from './utils/assetFilter';
import { useCreatureFilters } from './hooks/useCreatureFilters';
import { useCollectionFilterDefinitions } from './hooks/useCollectionFilterDefinitions';
import { useFilterSearch, useSearchKeywords } from './hooks/useFilterSearch';
import { ActiveFilterBar } from './components/search/ActiveFilterBar';
import { DIALOG_EXIT_DURATION, dialogBackdropVariants, useDialogWindowVariants } from '../primitives/dialogMotion';
import { t } from '../../../i18n';

const NO_ASSETS: AnyAsset[] = [];

const wrapperVariants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
  exit: { opacity: 1, transition: { duration: DIALOG_EXIT_DURATION, when: 'afterChildren' as const } },
};

export default function AssetManager({ isOpen, onClose, initialTab, onExitComplete }: AssetManagerProps): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('tokens');
  const [selectedCollection, setSelectedCollection] = useState(() => AssetService.defaultCollectionId());
  const [collapsedSections, setCollapsedSections] = useState<{ folders: boolean; assets: boolean }>({ folders: false, assets: false });
  const [draggedItems, setDraggedItems] = useState<{ type: 'asset' | 'folder'; ids: string[] } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sidebar = useSidebarLayout(containerRef, isOpen);
  const windowVariants = useDialogWindowVariants();

  const data = useAssetData(activeTab, selectedCollection, isOpen);
  useFollowSelectedCollection(data.collections, selectedCollection, setSelectedCollection);
  const settings = useAtlasSettings(SettingsService.forApp(data.app));

  const visibleIds = useRef<VisibleIds>({ assets: [], folders: [] });
  const sel = useSelectionHandlers(visibleIds, data.folders, activeTab, isOpen);

  const extensionTabs = useExtensionTabs(assetTabSlot, isOpen);
  const changeTab = useCallback((tab: Tab): void => {
    extensionTabs.show(null);
    if (tab === activeTab) return;
    setActiveTab(tab);
    sel.resetForTab();
  }, [activeTab, sel.resetForTab, extensionTabs.show]);
  const showExtensionTab = (key: string): void => {
    sel.resetForTab();
    extensionTabs.show(key);
  };

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
    setSelectedCollection(collectionId);
    sel.resetForTab();
  };

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
    assets: data.assets, folders: data.folders, filter: assetFilter,
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

  const displayedFolders = useMemo(() => filterFolders(data.folders, creature.filter), [data.folders, creature.filter]);

  // A change of tab or collection keeps the previous content on screen, untouched by the
  // resets the change triggers, while its assets load: a quick load swaps the panes once.
  // A load that takes longer gives way to the skeleton of the new place, so the manager
  // answers at once however long its content takes.
  const showSkeleton = useLoadingReveal(data.assetsLoading);
  const isPending = data.assetsLoading || showSkeleton;
  const shown = useHeldWhile(data.assetsLoading && !showSkeleton, {
    collection: selectedCollection,
    tab: activeTab,
    loading: isPending,
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

  const crud = useAssetCrud(
    data.app, data.assetService, activeTab, selectedCollection,
    sel.selectedFolderId, data.folders, data.collections,
    data.setFolders, data.reloadCollections, setSelectedCollection,
    data.loadFoldersForActiveTab, data.loadAssetsForActiveTab,
    draggedItems, setDraggedItems, setDropTarget,
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

  const { handleAssetContextMenu, handleFolderContextMenu, handleContentContextMenu } =
    useContextMenus({ data, sel, crud, tags, statblock, selectedCollection, onClose });

  useAssetManagerEffects({
    isOpen, onClose,
    modalRef, containerRef,
    activeTab, changeTab,
    data, sel, crud, tags, statblock,
  });

  const anyModalOpen = crud.isTokenCreatorOpen || crud.isMapCreatorOpen;

  return (
    <>
      {/* Stays mounted while closed so the window can animate out. */}
      <AnimatePresence {...(onExitComplete ? { onExitComplete } : {})}>
        {isOpen && (
          <motion.div
            key="asset-manager-modal"
            className="atlas-vtt-plugin atlas-vtt-root atlas-asset-manager-modal"
            ref={modalRef}
            tabIndex={-1}
            variants={wrapperVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              className="atlas-asset-manager-backdrop"
              onClick={onClose}
              variants={dialogBackdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            />
            {/* The window moves as one piece. The container inside clips its content to the
                window's corners; what is drawn around the window (a theme's ornament) hangs
                from this element and so moves and fades with it. */}
            <motion.div
              className="atlas-asset-manager-window"
              variants={windowVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div
                className={`atlas-asset-manager-container ${sidebar.isFloating ? 'atlas-sidebar-floating' : ''}`}
                ref={containerRef}
              >
                <Sidebar
                  selectedTagIds={sel.selectedTagIds}
                  onSelectTag={sel.handleTagSelect}
                  onClearTags={() => sel.setSelectedTagIds([])}
                  tags={data.availableTags}
                  tagsLoading={data.tagsLoading}
                  assets={data.assets}
                  collections={data.collections}
                  selectedCollection={selectedCollection}
                  onSelectCollection={changeCollection}
                  onManageTags={() => tags.setIsTagManagerOpen(true)}
                  onEditCollectionSettings={crud.setSettingsModalCollectionId}
                  onExportCollection={() => { void crud.handleExportCollection(); }}
                  onImportCollection={crud.handleImportCollection}
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
                  extensionTabs={{ tabs: extensionTabs.tabs, active: extensionTabs.active, onSelect: showExtensionTab }}
                  onCreateTokens={() => crud.setIsTokenCreatorOpen(true)}
                  onCreateMap={crud.handleCreateMap}
                  onCreateCollection={crud.handleCreateCollection}
                  onCreateFolder={crud.handleCreateFolder}
                  onRefresh={() => { void crud.handleRefresh(); }}
                  sidebarToggleLabel={sidebar.toggleLabel}
                  onToggleSidebar={sidebar.toggle}
                  sel={sel}
                />
                <div
                  className="atlas-asset-manager-body"
                  onDragOver={(e) => { if (draggedItems && sel.selectedFolderId === null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                  onDrop={(e) => { if (draggedItems && sel.selectedFolderId === null) { e.preventDefault(); crud.handleDrop(null); } }}
                >
                  {extensionTabs.active ? (
                    <ExtensionAssetPane entry={extensionTabs.active} collectionId={selectedCollection} />
                  ) : (<>
                  <ActiveFilterBar groups={filterSearch.chips} onReset={filterSearch.reset} />
                  <Breadcrumb
                    activeTab={shown.tab}
                    path={shown.folderPath}
                    onNavigateToFolder={sel.handleNavigateToFolder}
                  />
                  <div className="atlas-asset-manager-main">
                    <AssetTagMenuContext.Provider value={tagMenuActions}>
                      <Content
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
                        assetService={data.assetService}
                        spawnCounts={sel.spawnCounts}
                        onSpawnCountChange={sel.handleSpawnCountChange}
                        {...(creature.isActive ? { onClearFilters: filterSearch.reset } : {})}
                      />
                    </AssetTagMenuContext.Provider>
                  </div>
                  </>)}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isOpen && !anyModalOpen && !crud.inputModalState?.isOpen && !crud.settingsModalCollectionId && !crud.isCreateSceneModalOpen && !crud.isMoveModalOpen && !tags.isTagManagerOpen && !statblock.linkingStatblockAsset && (
        settings?.shouldShowTutorial('assets') ? <Tutorial settings={settings} id="assets" steps={[
          { title: t('am.tour.libraryTitle'), body: t('am.tour.libraryBody'), selector: '.atlas-am-toolbar-center' },
          { title: t('am.tour.collectionTitle'), body: t('am.tour.collectionBody'), selector: '.atlas-collections' },
        ]} action={{ label: t('am.tour.createCollection'), onClick: crud.handleCreateCollection }} /> :
        settings?.getSetting('onboarding').tokenImported ? <Tutorial settings={settings} id="tokenStatblocks" steps={[
          { title: t('am.tour.statblockTitle'), body: t('am.tour.statblockBody'), selector: '.atlas-asset-manager-main' },
        ]} /> : null
      )}

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
