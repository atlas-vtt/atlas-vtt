import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type { AnyAsset, Folder, InputModalState } from '../types';
import { folderRenameProblem, renameAssetFolder } from '../utils/assetFolderRename';
import { createSubfolder, subfolderNameProblem } from '../utils/assetFolderTree';
import { deleteFolderKeepingContents, moveFolderContentsInto, type FolderDeleteContext } from '../utils/folderMoveActions';
import { confirmAction } from '../../../../ui/confirmDialog';
import { runInBackground } from '../../../../utils/backgroundTask';
import { t } from '../../../../i18n';

export interface FolderContextMenuDeps extends FolderDeleteContext {
  folders: Folder[];
  assets: AnyAsset[];
  setInputModalState: (state: InputModalState) => void;
  handleFolderDoubleClick: (folderId: string) => void;
  /** Move to Folder, as the asset manager runs it for cards. */
  moveAssetsToFolder: (assetIds: string[], targetFolderId: string | null) => Promise<void>;
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
    if (renamedId && renamedId !== folder.id) {
      deps.setSelectedFolderIds((selected) => selected.map((id) => (id === folder.id ? renamedId : id)));
      deps.followFolderMoves([{ from: folder.id, to: renamedId }]);
    }
  } finally {
    await deps.loadFoldersForActiveTab();
    await deps.loadAssetsForActiveTab();
  }
}

/** Makes the folder in the vault, then shows the tab's folders as the vault holds them now. */
async function createSubfolderIn(folder: Folder, name: string, deps: FolderContextMenuDeps): Promise<void> {
  try {
    await createSubfolder(deps.app, folder.id, name);
  } finally {
    await deps.loadFoldersForActiveTab();
  }
}

/** Moves what the folder holds into `targetFolderId` (null: the tab's top level), in the vault. */
function moveContents(folder: Folder, targetFolderId: string | null, deps: FolderContextMenuDeps): void {
  runInBackground(
    moveFolderContentsInto(deps, deps.moveAssetsToFolder, folder.id, targetFolderId),
    `Moving the contents of folder ${folder.id}`,
    t('am.folder.moveContentsFailed'),
  );
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
          runInBackground(createSubfolderIn(folder, subfolderName, deps), `Creating a subfolder of ${folder.id}`, t('am.folder.createFailed'));
        },
        validation: (value: string) => subfolderNameProblem(deps.app, folder.id, value),
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
      onClick: () => moveContents(folder, null, deps),
    });

    otherFolders.slice(0, 5).forEach((target) => {
      entries.push({
        type: 'item',
        label: t('am.folder.moveTo', { name: target.name }),
        icon: 'folder-input',
        onClick: () => moveContents(folder, target.id, deps),
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
      const assetCount = deps.assets.filter((a) => a.folderId === folder.id).length;
      const folderCount = deps.folders.filter((f) => f.parentId === folder.id).length;
      const message = [t('am.folder.confirmDelete', { name: folder.name })];
      if (assetCount > 0) message.push(t('am.folder.contains', { count: assetCount }));
      if (folderCount > 0) message.push(t('am.folder.containsFolders', { count: folderCount }));
      const confirmed = await confirmAction({ title: t('am.folder.deleteTitle'), message, confirmLabel: t('common.delete'), destructive: true });
      if (!confirmed) return;

      runInBackground(
        deleteFolderKeepingContents(deps, deps.moveAssetsToFolder, folder),
        `Deleting folder ${folder.id}`,
        t('am.folder.deleteFailed'),
      );
    },
  });

  return entries;
}
