import React from 'react';
import { openContextMenuGlobal } from '../../../../react/root/ContextMenuContext';
import { buildAssetContextMenuEntries, type AssetContextMenuDeps } from '../contextMenus/assetContextMenu';
import { deleteAssets } from '../contextMenus/deleteAssetsEntry';
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
import { tabFolderPath } from '../utils/assetFolders';
import { transferTargets, transferToCollection } from '../utils/collectionTransferActions';
import { openTokenStatblock } from '../utils/openTokenStatblock';
import type { MenuAnchor } from '../utils/menuAnchor';
import { runInBackground } from '../../../../utils/backgroundTask';
import { t } from '../../../../i18n';

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
  /** Shows another collection: where the notice of a move to it takes the GM. */
  openCollection: (collectionId: string, assetIds: readonly string[]) => void;
}

interface ContextMenuHandlers {
  handleAssetContextMenu: (asset: AnyAsset, anchor: MenuAnchor) => void;
  /** The Delete key on a card: deletes the selection, or the asset alone where it is not part of it, once confirmed. */
  handleAssetDelete: (asset: AnyAsset) => void;
  handleFolderContextMenu: (folder: FolderType, anchor: MenuAnchor) => void;
  handleContentContextMenu: (event: React.MouseEvent) => void;
}

export function useContextMenus({
  data, sel, crud, tags, statblock, selectedCollection, activeTab, onClose, openCollection,
}: ContextMenuDeps): ContextMenuHandlers {
  /** The selection when `asset` is part of it, else `asset` alone. */
  const actedOn = (asset: AnyAsset): AnyAsset[] => (sel.selectedAssetIds.length > 1 && sel.selectedAssetIds.includes(asset.id)
    ? data.assets.filter(a => sel.selectedAssetIds.includes(a.id))
    : [asset]);

  const assetMenuDeps = (asset: AnyAsset): AssetContextMenuDeps => ({
    app: data.app, view: data.view,
    assetService: data.assetService, onClose,
    setEditingToken: crud.setEditingToken, setIsTokenCreatorOpen: crud.setIsTokenCreatorOpen,
    editEncounter: crud.editEncounter,
    setIsMoveModalOpen: crud.setIsMoveModalOpen,
    canMoveToFolder: tabHasFolders(activeTab),
    openCreateScene: crud.openCreateSceneModalFromMap,
    setInputModalState: crud.setInputModalState,
    setAssets: data.setAssets, setSelectedAssetIds: sel.setSelectedAssetIds,
    loadAssetsForActiveTab: data.loadAssetsForActiveTab,
    handleCreateTag: (name) => tags.handleCreateTag(tagGroupOfTab(asset.type), name),
    setTagsOfAssets: tags.setTagsOfAssets,
    handleSaveAsEncounter: crud.handleSaveAsEncounter,
    openStatblock: (token) => openTokenStatblock(data.app, token, { onMissing: statblock.openStatblockLinkModal, onEditorOpened: onClose }),
    openStatblockLinkModal: statblock.openStatblockLinkModal,
    unlinkStatblock: statblock.unlinkStatblock,
    deleteAssetFromVault: crud.deleteAssetFromVault,
    pickCollection: (assets, mode) => {
      const context = { app: data.app, assetService: data.assetService, setAssets: data.setAssets, setSelectedAssetIds: sel.setSelectedAssetIds, openCollection };
      crud.setCollectionPick({ mode, assets, transfer: (target) => { void transferToCollection(context, assets, target, mode); } });
    },
    selectedAssetIds: sel.selectedAssetIds,
    assets: data.assets, folders: data.folders, availableTags: data.availableTags,
    transferTargets: transferTargets(data.collections, selectedCollection),
    collectionId: selectedCollection,
  });

  const handleAssetContextMenu = (asset: AnyAsset, anchor: MenuAnchor): void => {
    if (!sel.selectedAssetIds.includes(asset.id)) {
      sel.setSelectedAssetIds([asset.id]);
    }
    const entries = buildAssetContextMenuEntries(asset, actedOn(asset), assetMenuDeps(asset));
    openContextMenuGlobal(entries, { x: anchor.clientX, y: anchor.clientY }, {
      returnFocus: anchor.returnFocus,
      label: t('assetGrid.menuOf', { name: asset.name }),
    });
  };

  const handleAssetDelete = (asset: AnyAsset): void => {
    runInBackground(deleteAssets(actedOn(asset), assetMenuDeps(asset)), `Deleting asset ${asset.id}`);
  };

  const handleFolderContextMenu = (folder: FolderType, anchor: MenuAnchor): void => {
    const entries = buildFolderContextMenuEntries(folder, {
      app: data.app, assetService: data.assetService,
      tabBasePath: tabFolderPath(selectedCollection, activeTab),
      folders: data.folders, assets: data.assets,
      setInputModalState: crud.setInputModalState,
      setSelectedFolderIds: sel.setSelectedFolderIds,
      followFolderMoves: sel.followFolderMoves,
      leaveDeletedFolder: sel.leaveDeletedFolder,
      moveAssetsToFolder: crud.moveAssetsToFolder,
      handleFolderDoubleClick: sel.handleFolderDoubleClick,
      loadFoldersForActiveTab: data.loadFoldersForActiveTab,
      loadAssetsForActiveTab: data.loadAssetsForActiveTab,
    });
    openContextMenuGlobal(entries, { x: anchor.clientX, y: anchor.clientY }, {
      returnFocus: anchor.returnFocus,
      label: t('assetGrid.menuOf', { name: folder.name }),
    });
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

  return { handleAssetContextMenu, handleAssetDelete, handleFolderContextMenu, handleContentContextMenu };
}
