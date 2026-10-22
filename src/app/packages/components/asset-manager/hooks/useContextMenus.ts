import React from 'react';
import { openContextMenuGlobal } from '../../../../react/root/ContextMenuContext';
import { buildAssetContextMenuEntries } from '../contextMenus/assetContextMenu';
import { buildFolderContextMenuEntries } from '../contextMenus/folderContextMenu';
import { buildContentContextMenuEntries } from '../contextMenus/contentContextMenu';
import type { AnyAsset, Folder as FolderType, Tab } from '../types';
import type { AssetData } from './useAssetData';
import type { SelectionState } from './useSelectionHandlers';
import type { AssetCrudActions } from './useAssetCrud';
import type { TagsAndCollectionsState } from './useTagsAndCollections';
import type { StatblockLinkState } from './useStatblockLink';
import { tagGroupOfTab } from '../utils/assetTags';
import { tabHasFolders } from '../utils/tabKinds';
import { transferTargets, transferToCollection } from '../utils/collectionTransferActions';

interface ContextMenuDeps {
  data: AssetData;
  sel: SelectionState;
  crud: AssetCrudActions;
  tags: TagsAndCollectionsState;
  statblock: StatblockLinkState;
  /** Id of the collection shown. */
  selectedCollection: string;
  activeTab: Tab;
  onClose: () => void;
}

interface ContextMenuHandlers {
  handleAssetContextMenu: (asset: AnyAsset, event: React.MouseEvent) => void;
  handleFolderContextMenu: (folder: FolderType, event: React.MouseEvent) => void;
  handleContentContextMenu: (event: React.MouseEvent) => void;
}

export function useContextMenus({
  data, sel, crud, tags, statblock, selectedCollection, activeTab, onClose,
}: ContextMenuDeps): ContextMenuHandlers {
  const handleAssetContextMenu = (asset: AnyAsset, event: React.MouseEvent): void => {
    if (!sel.selectedAssetIds.includes(asset.id)) {
      sel.setSelectedAssetIds([asset.id]);
    }
    const selectedAssets = sel.selectedAssetIds.length > 1 && sel.selectedAssetIds.includes(asset.id)
      ? data.assets.filter(a => sel.selectedAssetIds.includes(a.id))
      : [asset];

    const entries = buildAssetContextMenuEntries(asset, selectedAssets, {
      app: data.app, view: data.view,
      assetService: data.assetService, onClose,
      setEditingToken: crud.setEditingToken, setIsTokenCreatorOpen: crud.setIsTokenCreatorOpen,
      editEncounter: crud.editEncounter,
      setIsMoveModalOpen: crud.setIsMoveModalOpen,
      openCreateScene: crud.openCreateSceneModalFromMap,
      setInputModalState: crud.setInputModalState,
      setAssets: data.setAssets, setSelectedAssetIds: sel.setSelectedAssetIds,
      loadAssetsForActiveTab: data.loadAssetsForActiveTab,
      handleCreateTag: (name) => tags.handleCreateTag(tagGroupOfTab(asset.type), name),
      setAssetTags: tags.setAssetTags,
      handleSaveAsEncounter: crud.handleSaveAsEncounter,
      openStatblockLinkModal: statblock.openStatblockLinkModal,
      unlinkStatblock: statblock.unlinkStatblock,
      deleteAssetFromVault: crud.deleteAssetFromVault,
      transferToCollection: (assets, target, mode) => {
        const context = { app: data.app, assetService: data.assetService, setAssets: data.setAssets, setSelectedAssetIds: sel.setSelectedAssetIds };
        void transferToCollection(context, assets, target, mode);
      },
      selectedAssetIds: sel.selectedAssetIds,
      assets: data.assets, folders: data.folders, availableTags: data.availableTags,
      transferTargets: transferTargets(data.collections, selectedCollection),
      collectionId: selectedCollection,
    });
    openContextMenuGlobal(entries, { x: event.clientX, y: event.clientY });
  };

  const handleFolderContextMenu = (folder: FolderType, event: React.MouseEvent): void => {
    event.preventDefault();
    const entries = buildFolderContextMenuEntries(folder, {
      folders: data.folders, assets: data.assets,
      setInputModalState: crud.setInputModalState,
      setFolders: data.setFolders, setAssets: data.setAssets,
      setSelectedFolderIds: sel.setSelectedFolderIds,
      handleFolderDoubleClick: sel.handleFolderDoubleClick,
      deleteFolderFromVault: crud.deleteFolderFromVault,
    });
    openContextMenuGlobal(entries, { x: event.clientX, y: event.clientY });
  };

  const handleContentContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault();
    const entries = buildContentContextMenuEntries({
      sortBy: sel.sortBy, sortOptions: sel.sortOptions, setSortBy: sel.setSortBy,
      sortOrder: sel.sortOrder, setSortOrder: sel.setSortOrder,
      canCreateFolder: tabHasFolders(activeTab),
      handleCreateFolder: crud.handleCreateFolder,
      handleRefresh: crud.handleRefresh,
    });
    openContextMenuGlobal(entries, { x: event.clientX, y: event.clientY });
  };

  return { handleAssetContextMenu, handleFolderContextMenu, handleContentContextMenu };
}
