import { t } from '../../../../../i18n';
import type { SoundKind } from '../../../../../sound/soundTypes';
import type { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { isLinked } from '../../../../../soundLibrary/SoundRoots';
import type { ContextMenuEntry } from '../../../context-menu/AtlasContextMenu';
import type { LibraryActions } from './useLibraryActions';

/**
 * What becomes of the originals from now on, offered only where it changes the GM's choice: keep where they go to
 * the trash, the trash where they are kept and the folder has one. Files already in the trash stay there.
 */
function originalsEntry(library: SoundLibrary, kind: SoundKind): ContextMenuEntry[] {
  if (!isLinked(library.rootOf(kind))) return [];
  const choice = library.roots.originalsOf(kind);
  if (choice === 'trash') {
    return [{ type: 'item', label: t('audio.library.keepOriginals'), icon: 'archive', onClick: () => library.roots.setOriginals(kind, 'keep') }];
  }
  if (choice === 'keep' && library.locationOf(kind)?.canTrash()) {
    return [{ type: 'item', label: t('audio.library.trashOriginals'), icon: 'trash', onClick: () => library.roots.setOriginals(kind, 'trash') }];
  }
  return [];
}

/** A root's menu in the rail. */
export function rootMenu(library: SoundLibrary, actions: LibraryActions, kind: SoundKind, win: Window): ContextMenuEntry[] {
  return [
    { type: 'item', label: t('audio.library.prepareAll'), icon: 'hard-drive-download', disabled: library.locationOf(kind) === null, onClick: () => actions.prepare(kind) },
    ...originalsEntry(library, kind),
    { type: 'item', label: t('audio.library.changeFolder'), icon: 'folder-open', onClick: () => actions.link(kind, win) },
    { type: 'item', label: t('audio.library.unlink'), icon: 'unlink', onClick: () => actions.unlink(kind) },
  ];
}
