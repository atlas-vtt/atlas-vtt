import type * as React from 'react';
import { useState } from 'react';
import { TFolder, App as ObsidianApp } from 'obsidian';
import type { AnyAsset, CollectionOption, EncounterAsset, TokenAsset, Folder, Tab, InputModalState } from '../types';
import { saveEncounter, type EncounterTokenDraft } from '../../../../encounters/encounterSaveService';
import type { AssetService } from '../../../../services/AssetService';
import { showAtlasToast } from '../../../../react/components/AtlasToast';
import { ensureFolder } from '../../../../plugin/vaultFolders';
import { useCollectionTransfer, type CollectionTransferActions } from './useCollectionTransfer';
import { t } from '../../../../i18n';
import { folderIdOf, tabFolderPath } from '../utils/assetFolders';
import { folderMoveProblem, moveAssetsIntoFolder } from '../utils/assetFolderMove';
import { tabHasFolders } from '../utils/tabKinds';

/** Background and name carried over when a scene is created from a map asset. */
export interface CreateScenePrefill {
  backgroundPath: string | null;
  defaultName: string;
}

export interface AssetCrudActions extends CollectionTransferActions {
  // Modal state
  isTokenCreatorOpen: boolean;
  isEncounterBuilderOpen: boolean;
  isMapCreatorOpen: boolean;
  editingToken: AnyAsset | null;
  /** The saved encounter the encounter builder changes; null while it builds a new one. */
  editingEncounter: EncounterAsset | null;
  isCreateSceneModalOpen: boolean;
  createScenePrefill: CreateScenePrefill | null;
  isCreateFolderModalOpen: boolean;
  isMoveModalOpen: boolean;
  moveTargetFolderId: string | null;
  moveFolderSearch: string;
  moveFolderListOpen: boolean;
  targetFolderName: string;
  settingsModalCollectionId: string | null;
  isCreateCollectionModalOpen: boolean;
  inputModalState: InputModalState;
  // Setters
  setIsTokenCreatorOpen: (open: boolean) => void;
  setIsEncounterBuilderOpen: (open: boolean) => void;
  setIsMapCreatorOpen: (open: boolean) => void;
  setEditingToken: (asset: AnyAsset | null) => void;
  /** Opens the encounter builder on a saved encounter. */
  editEncounter: (encounter: EncounterAsset) => void;
  /** Closes the encounter builder, whichever encounter it built. */
  closeEncounterBuilder: () => void;
  setIsCreateSceneModalOpen: (open: boolean) => void;
  openCreateSceneModalFromMap: (prefill: CreateScenePrefill) => void;
  setIsCreateFolderModalOpen: (open: boolean) => void;
  setIsMoveModalOpen: (open: boolean) => void;
  setMoveTargetFolderId: (id: string | null) => void;
  setMoveFolderSearch: (s: string) => void;
  setMoveFolderListOpen: (open: boolean) => void;
  setTargetFolderName: (name: string) => void;
  setSettingsModalCollectionId: (id: string | null) => void;
  setIsCreateCollectionModalOpen: (open: boolean) => void;
  /** Shows a collection the create dialog just made. */
  showCreatedCollection: (collectionId: string) => Promise<void>;
  setInputModalState: (state: InputModalState) => void;
  // Handlers
  handleCreateFolder: () => void;
  handleCreateMap: () => void;
  handleCreateCollection: () => void;
  handleRefresh: () => Promise<void>;
  createFolderInVault: (folderName: string) => Promise<void>;
  deleteAssetFromVault: (asset: { id: string; name: string }) => Promise<boolean>;
  deleteFolderFromVault: (folder: Folder) => Promise<void>;
  moveAssetsToFolder: (assetIds: string[], targetFolderId: string | null) => Promise<void>;
  handleDrop: (targetFolderId: string | null) => void;
  handleSaveAsEncounter: (tokenAssets: AnyAsset[]) => Promise<void>;
}

export function useAssetCrud(
  app: ObsidianApp,
  assetService: AssetService | null,
  activeTab: Tab,
  selectedCollection: string,
  selectedFolderId: string | null,
  folders: Folder[],
  collections: CollectionOption[],
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>,
  reloadCollections: () => Promise<void>,
  setSelectedCollection: (c: string) => void,
  loadFoldersForActiveTab: () => Promise<void>,
  loadAssetsForActiveTab: () => Promise<void>,
  draggedItems: { type: 'asset' | 'folder'; ids: string[] } | null,
  setDraggedItems: React.Dispatch<React.SetStateAction<{ type: 'asset' | 'folder'; ids: string[] } | null>>,
  setDropTarget: React.Dispatch<React.SetStateAction<string | null>>
): AssetCrudActions {

  const [isTokenCreatorOpen, setIsTokenCreatorOpen] = useState(false);
  const [isEncounterBuilderOpen, setIsEncounterBuilderOpen] = useState(false);
  const [isMapCreatorOpen, setIsMapCreatorOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<AnyAsset | null>(null);
  const [editingEncounter, setEditingEncounter] = useState<EncounterAsset | null>(null);
  const editEncounter = (encounter: EncounterAsset): void => {
    setEditingEncounter(encounter);
    setIsEncounterBuilderOpen(true);
  };
  const closeEncounterBuilder = (): void => {
    setIsEncounterBuilderOpen(false);
    setEditingEncounter(null);
  };
  const [isCreateSceneModalOpen, setIsCreateSceneModalOpen] = useState(false);
  const [createScenePrefill, setCreateScenePrefill] = useState<CreateScenePrefill | null>(null);
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [moveFolderSearch, setMoveFolderSearch] = useState('');
  const [moveFolderListOpen, setMoveFolderListOpen] = useState(false);
  const [targetFolderName, setTargetFolderName] = useState('');
  const [settingsModalCollectionId, setSettingsModalCollectionId] = useState<string | null>(null);
  const [isCreateCollectionModalOpen, setIsCreateCollectionModalOpen] = useState(false);
  const [inputModalState, setInputModalState] = useState<InputModalState>({
    isOpen: false,
    title: '',
    onConfirm: () => {},
  });

  const handleCreateFolder = (): void => setIsCreateFolderModalOpen(true);
  const handleCreateMap = (): void => setIsMapCreatorOpen(true);
  const openCreateSceneModalFromMap = (prefill: CreateScenePrefill): void => {
    setCreateScenePrefill(prefill);
    setIsCreateSceneModalOpen(true);
  };

  const handleRefresh = async (): Promise<void> => {
    if (assetService && app) await loadAssetsForActiveTab();
  };

  const createFolderInVault = async (folderName: string): Promise<void> => {
    if (!folderName.trim() || !app) return;
    try {
      const tabBase = tabFolderPath(selectedCollection, activeTab);
      let path = tabBase;
      if (selectedFolderId) {
        const parent = folders.find((f) => f.id === selectedFolderId);
        if (parent) path = `${path}/${parent.path}`;
      }
      path = `${path}/${folderName.trim()}`;

      await ensureFolder(app, path);

      const newFolder: Folder = {
        id: folderIdOf(path),
        name: folderName.trim(),
        type: activeTab,
        path: path.substring(tabBase.length + 1),
        parentId: selectedFolderId,
      };
      setFolders((prev) => [...prev, newFolder]);
      setIsCreateFolderModalOpen(false);
      setTargetFolderName('');
      void loadAssetsForActiveTab();
    } catch (error) {
      console.error('[useAssetCrud] Error creating folder:', error);
    }
  };

  const deleteAssetFromVault = async (asset: { id: string; name: string }): Promise<boolean> => {
    if (!assetService) return false;
    try {
      await assetService.deleteAsset(asset.id);
      return true;
    } catch (error) {
      console.error('[useAssetCrud] Error deleting asset:', error);
      showAtlasToast(t('am.deleteFailed', { name: asset.name, error: error instanceof Error ? error.message : String(error) }));
      return false;
    }
  };

  const deleteFolderFromVault = async (folder: Folder): Promise<void> => {
    if (!app) return;
    try {
      let folderPath = tabFolderPath(selectedCollection, folder.type);
      const buildFullPath = (f: Folder): string => {
        if (f.parentId) {
          const parent = folders.find((p) => p.id === f.parentId);
          if (parent) return `${buildFullPath(parent)}/${f.name}`;
        }
        return f.name;
      };
      if (folder.parentId) {
        const parent = folders.find((p) => p.id === folder.parentId);
        if (parent) folderPath = `${folderPath}/${buildFullPath(parent)}`;
      }
      folderPath = `${folderPath}/${folder.name}`;

      const folderFile = app.vault.getAbstractFileByPath(folderPath);
      if (folderFile instanceof TFolder && folderFile.children.length === 0) {
        await app.fileManager.trashFile(folderFile);
      }
    } catch (error) {
      console.error('[useAssetCrud] Error deleting folder:', error);
    }
  };

  const moveAssetsToFolder = async (assetIds: string[], targetFolderId: string | null): Promise<void> => {
    if (!app || !assetService) return;
    const tabBase = tabFolderPath(selectedCollection, activeTab);
    const result = await moveAssetsIntoFolder(app, assetService, assetIds, tabBase, targetFolderId);
    const problem = folderMoveProblem(result);
    if (problem) showAtlasToast(problem);
    if (result.moved.length > 0) await loadAssetsForActiveTab();
  };

  const handleDrop = (targetFolderId: string | null): void => {
    if (!draggedItems) return;
    if (draggedItems.type === 'asset') {
      // The party is shown flat: a card let go on its background stays in the folder it lies in.
      if (tabHasFolders(activeTab)) void moveAssetsToFolder(draggedItems.ids, targetFolderId);
    } else {
      setFolders((prev) =>
        prev.map((f) =>
          draggedItems.ids.includes(f.id) ? { ...f, parentId: targetFolderId } : f
        )
      );
    }
    setDraggedItems(null);
    setDropTarget(null);
  };

  const showCreatedCollection = async (collectionId: string): Promise<void> => {
    await reloadCollections();
    setSelectedCollection(collectionId);
    await loadFoldersForActiveTab();
    await loadAssetsForActiveTab();
  };

  const handleCreateCollection = (): void => setIsCreateCollectionModalOpen(true);

  const handleSaveAsEncounter = async (tokenAssets: AnyAsset[]): Promise<void> => {
    if (!assetService || !app) return;
    const drafts = tokenAssets.map((t): EncounterTokenDraft => {
      const token = t as TokenAsset;
      const draft: EncounterTokenDraft = { id: t.id, name: t.name, imagePath: token.imagePath || '', size: token.size || 1 };
      if (token.statblockPath) draft.statblockPath = token.statblockPath;
      return draft;
    });
    const saved = await saveEncounter(app, assetService, selectedCollection, drafts);
    if (saved && activeTab === 'encounters') await loadAssetsForActiveTab();
  };

  const transfer = useCollectionTransfer({
    app,
    assetService,
    selectedCollection,
    onImported: async (collectionId: string): Promise<void> => {
      await reloadCollections();
      // Selecting another collection reloads its contents by itself.
      if (collectionId !== selectedCollection) {
        setSelectedCollection(collectionId);
        return;
      }
      await loadFoldersForActiveTab();
      await loadAssetsForActiveTab();
    },
  });

  return {
    isTokenCreatorOpen, isEncounterBuilderOpen, isMapCreatorOpen, editingToken, editingEncounter,
    isCreateSceneModalOpen, createScenePrefill,
    isCreateFolderModalOpen, isMoveModalOpen,
    moveTargetFolderId, moveFolderSearch, moveFolderListOpen,
    targetFolderName, settingsModalCollectionId, isCreateCollectionModalOpen, inputModalState,
    setIsTokenCreatorOpen, setIsEncounterBuilderOpen, setIsMapCreatorOpen, setEditingToken, editEncounter, closeEncounterBuilder,
    setIsCreateSceneModalOpen, openCreateSceneModalFromMap,
    setIsCreateFolderModalOpen, setIsMoveModalOpen,
    setMoveTargetFolderId, setMoveFolderSearch, setMoveFolderListOpen,
    setTargetFolderName, setSettingsModalCollectionId, setIsCreateCollectionModalOpen, showCreatedCollection, setInputModalState,
    handleCreateFolder, handleCreateMap,
    handleCreateCollection, handleRefresh,
    createFolderInVault, deleteAssetFromVault, deleteFolderFromVault,
    moveAssetsToFolder, handleDrop, handleSaveAsEncounter,
    ...transfer,
  };
}
