import type * as React from 'react';
import type { App as ObsidianApp } from 'obsidian';
import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type { AssetService } from '../../../../services/AssetService';
import type { AnyAsset, Folder, InputModalState } from '../types';
import { folderRenameProblem, renameAssetFolder } from '../utils/assetFolderRename';
import { confirmAction } from '../../../../ui/confirmDialog';
import { runInBackground } from '../../../../utils/backgroundTask';
import { t } from '../../../../i18n';

export interface FolderContextMenuDeps {
  app: ObsidianApp;
  assetService: AssetService | null;
  folders: Folder[];
  assets: AnyAsset[];
  setInputModalState: (state: InputModalState) => void;
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>;
  setSelectedFolderIds: React.Dispatch<React.SetStateAction<string[]>>;
  handleFolderDoubleClick: (folderId: string) => void;
  deleteFolderFromVault: (folder: Folder) => Promise<void>;
  loadFoldersForActiveTab: () => Promise<void>;
  loadAssetsForActiveTab: () => Promise<void>;
}

/**
 * Renames the folder in the vault, then shows the tab's folders and assets as the vault and the
 * index hold them now: the folder's id is its path, so it and every folder in it have a new one.
 */
async function renameFolder(folder: Folder, name: string, deps: FolderContextMenuDeps): Promise<void> {
  const { app, assetService } = deps;
  if (!assetService) return;
  try {
    const renamedId = await renameAssetFolder(app, assetService, folder.id, name);
    if (renamedId) deps.setSelectedFolderIds((selected) => selected.map((id) => (id === folder.id ? renamedId : id)));
  } finally {
    await deps.loadFoldersForActiveTab();
    await deps.loadAssetsForActiveTab();
  }
}

export function buildFolderContextMenuEntries(
  folder: Folder,
  deps: FolderContextMenuDeps
): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];

  // Open / Navigate
  entries.push({
    type: 'item',
    label: t('common.open'),
    icon: 'folder-open',
    onClick: () => deps.handleFolderDoubleClick(folder.id),
  });


  // Rename
  entries.push({
    type: 'item',
    label: t('am.menu.rename'),
    icon: 'edit',
    onClick: () => {
      deps.setInputModalState({
        isOpen: true,
        title: t('am.folder.renameTitle', { name: folder.name }),
        placeholder: t('am.folder.newName'),
        defaultValue: folder.name,
        onConfirm: (newName: string) => {
          runInBackground(renameFolder(folder, newName, deps), `Renaming folder ${folder.id}`, t('am.folder.renameFailed'));
        },
        validation: (value: string) => folderRenameProblem(deps.app, folder.id, value),
      });
    },
  });

  // New Subfolder
  entries.push({
    type: 'item',
    label: t('am.menu.newSubfolder'),
    icon: 'folder-plus',
    onClick: () => {
      deps.setInputModalState({
        isOpen: true,
        title: t('am.folder.createSubfolder'),
        placeholder: t('am.folder.subfolderName'),
        onConfirm: (subfolderName: string) => {
          const newFolder: Folder = {
            id: `folder-${Date.now()}`,
            name: subfolderName.trim(),
            type: folder.type,
            path: `${folder.path}/${subfolderName.trim()}`,
            parentId: folder.id,
          };
          deps.setFolders((prev) => [...prev, newFolder]);
        },
        validation: (value: string) => {
          const trimmed = value.trim();
          if (!trimmed) return t('am.folder.subfolderEmpty');
          const children = deps.folders.filter((f) => f.parentId === folder.id);
          if (children.some((f) => f.name === trimmed)) {
            return t('am.folder.subfolderExists', { name: trimmed });
          }
          return null;
        },
      });
    },
  });


  // Move contents
  const otherFolders = deps.folders.filter(
    (f) => f.type === folder.type && f.id !== folder.id
  );
  if (otherFolders.length > 0) {
    entries.push({
      type: 'item',
      label: t('am.folder.moveToRoot'),
      icon: 'folder-input',
      onClick: () => {
        deps.setAssets((prev) =>
          prev.map((a) => (a.folderId === folder.id ? { ...a, folderId: null } : a))
        );
      },
    });

    otherFolders.slice(0, 5).forEach((target) => {
      entries.push({
        type: 'item',
        label: t('am.folder.moveTo', { name: target.name }),
        icon: 'folder-input',
        onClick: () => {
          deps.setAssets((prev) =>
            prev.map((a) => (a.folderId === folder.id ? { ...a, folderId: target.id } : a))
          );
        },
      });
    });
  }


  // Delete
  entries.push({
    type: 'item',
    label: t('am.folder.delete'),
    icon: 'trash',
    destructive: true,
    onClick: async () => {
      const assetsInFolder = deps.assets.filter((a) => a.folderId === folder.id);
      const message = [t('am.folder.confirmDelete', { name: folder.name })];
      if (assetsInFolder.length > 0) {
        message.push(t('am.folder.contains', { count: assetsInFolder.length }));
      }
      const confirmed = await confirmAction({ title: t('am.folder.deleteTitle'), message, confirmLabel: t('common.delete'), destructive: true });
      if (!confirmed) return;

      deps.setAssets((prev) =>
        prev.map((a) =>
          a.folderId === folder.id ? { ...a, folderId: folder.parentId || null } : a
        )
      );
      deps.setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      deps.setSelectedFolderIds((prev) => prev.filter((id) => id !== folder.id));
      await deps.deleteFolderFromVault(folder);
    },
  });

  return entries;
}
