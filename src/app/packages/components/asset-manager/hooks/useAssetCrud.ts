import type * as React from 'react';
import { startTransition, useState } from 'react';
import type { App as ObsidianApp } from 'obsidian';
import type { AnyAsset, CollectionOption, EncounterAsset, TokenAsset, Folder, Tab, InputModalState } from '../types';
import { saveEncounter, type EncounterTokenDraft } from '../../../../encounters/encounterSaveService';
import type { AssetService } from '../../../../services/AssetService';
import { showAtlasToast } from '../../../../react/components/AtlasToast';
import { ensureFolder, isPathTaken } from '../../../../plugin/vaultFolders';
import { useCollectionTransfer, type CollectionTransferActions } from './useCollectionTransfer';
import { t } from '../../../../i18n';
import { folderIdOf, tabFolderPath } from '../utils/assetFolders';
import { useFolderMove } from './useFolderMove';
import { moveFoldersInto, type FolderMoveContext } from '../utils/folderMoveActions';
import { runInBackground } from '../../../../utils/backgroundTask';
import { tabHasFolders } from '../utils/tabKinds';
import type { CollectionPick } from '../utils/collectionTransferActions';

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
  /** The Move or Copy to collection… dialog's errand while it is open (decision #41). */
  collectionPick: CollectionPick | null;
  setCollectionPick: (pick: CollectionPick | null) => void;
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
  /** Opens the dialog for a new scene without a map picked. */
  handleCreateCollection: () => void;
  handleRefresh: () => Promise<void>;
  /** Makes a folder of this name in the open folder; resolves to its id, or null when none was made. */
  createFolderInVault: (folderName: string) => Promise<string | null>;
  /** Whether a new folder of this name would take the place of a file or folder already there. */
  isFolderNameTaken: (folderName: string) => boolean;
  deleteAssetFromVault: (asset: { id: string; name: string }) => Promise<boolean>;
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
  setDropTarget: React.Dispatch<React.SetStateAction<string | null>>,
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>,
  /** Opens a folder of the tab shown (null: its top level) with the moved cards selected: where a move's notice takes the GM. */
  openFolder: (folderId: string | null, assetIds: readonly string[]) => void,
  /** What follows folders a drop moved into another folder: Back and Forward, and the folders selected. */
  folderMoves: Pick<FolderMoveContext, 'followFolderMoves' | 'setSelectedFolderIds'>,
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
  const [collectionPick, setCollectionPick] = useState<CollectionPick | null>(null);
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
  // A transition: React renders the map creator in slices between frames, not in the click's task (F4).
  const handleCreateMap = (): void => startTransition(() => setIsMapCreatorOpen(true));
  const openCreateSceneModalFromMap = (prefill: CreateScenePrefill): void => {
    setCreateScenePrefill(prefill);
    setIsCreateSceneModalOpen(true);
  };

  const handleRefresh = async (): Promise<void> => {
    if (assetService && app) await loadAssetsForActiveTab();
  };

  /** Where a new folder of this name goes: inside the open folder, else at the tab's top level. */
  const newFolderPath = (folderName: string): string => {
    const parent = selectedFolderId ? folders.find((f) => f.id === selectedFolderId) : undefined;
    const tabBase = tabFolderPath(selectedCollection, activeTab);
    return `${parent ? `${tabBase}/${parent.path}` : tabBase}/${folderName.trim()}`;
  };
  const isFolderNameTaken = (folderName: string): boolean => !!app && isPathTaken(app, newFolderPath(folderName));

  const createFolderInVault = async (folderName: string): Promise<string | null> => {
    // A taken name keeps the dialog open, where it says so beside the name.
    if (!folderName.trim() || !app || isFolderNameTaken(folderName)) return null;
    try {
      const tabBase = tabFolderPath(selectedCollection, activeTab);
      const path = newFolderPath(folderName);

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
      return newFolder.id;
    } catch (error) {
      console.error('[useAssetCrud] Error creating folder:', error);
      return null;
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

  const moveAssetsToFolder = useFolderMove({
    app, assetService, activeTab, selectedCollection, folders, setAssets, loadAssetsForActiveTab, openFolder,
  });

  const handleDrop = (targetFolderId: string | null): void => {
    if (!draggedItems) return;
    if (draggedItems.type === 'asset') {
      // The party is shown flat: a card let go on its background stays in the folder it lies in.
      if (tabHasFolders(activeTab)) void moveAssetsToFolder(draggedItems.ids, targetFolderId);
    } else {
      const { followFolderMoves, setSelectedFolderIds } = folderMoves;
      const context: FolderMoveContext = {
        app, assetService, tabBasePath: tabFolderPath(selectedCollection, activeTab),
        followFolderMoves, setSelectedFolderIds, loadFoldersForActiveTab, loadAssetsForActiveTab,
      };
      runInBackground(moveFoldersInto(context, draggedItems.ids, targetFolderId), 'Moving folders into a folder', t('am.folder.moveFailed'));
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
    isCreateFolderModalOpen, isMoveModalOpen, collectionPick, setCollectionPick,
    moveTargetFolderId, moveFolderSearch, moveFolderListOpen,
    targetFolderName, settingsModalCollectionId, isCreateCollectionModalOpen, inputModalState,
    setIsTokenCreatorOpen, setIsEncounterBuilderOpen, setIsMapCreatorOpen, setEditingToken, editEncounter, closeEncounterBuilder,
    setIsCreateSceneModalOpen, openCreateSceneModalFromMap,
    setIsCreateFolderModalOpen, setIsMoveModalOpen,
    setMoveTargetFolderId, setMoveFolderSearch, setMoveFolderListOpen,
    setTargetFolderName, setSettingsModalCollectionId, setIsCreateCollectionModalOpen, showCreatedCollection, setInputModalState,
    handleCreateFolder, handleCreateMap,
    handleCreateCollection, handleRefresh,
    createFolderInVault, isFolderNameTaken, deleteAssetFromVault,
    moveAssetsToFolder, handleDrop, handleSaveAsEncounter,
    ...transfer,
  };
}
