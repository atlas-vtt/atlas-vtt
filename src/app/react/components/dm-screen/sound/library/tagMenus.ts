import { t } from '../../../../../i18n';
import type { LibraryFile } from '../../../../../soundLibrary/SoundLibrary';
import { holdsTag, type RootTag } from '../../../../../soundLibrary/soundTags';
import { MENU_SEPARATOR, type ContextMenuEntry } from '../../../context-menu/AtlasContextMenu';
import type { LibraryActions } from './useLibraryActions';

/** The Tags of a row's menu: it stays open, and acts on all the files; ticked only where every one has the tag, and fixed where folders give it to them all. */
export function tagsSubmenu(actions: LibraryActions, files: readonly LibraryFile[], tags: readonly RootTag[]): ContextMenuEntry {
  const children = (): ContextMenuEntry[] => {
    const held = actions.tagsOf(files);
    return [
      ...tags.map(({ key, name }): ContextMenuEntry => {
        const fixed = held.every(({ folders }) => holdsTag({ own: [], folders }, key));
        return {
          type: 'item',
          label: name,
          checked: held.every((track) => holdsTag(track, key)),
          keepOpen: true,
          disabled: fixed,
          ...(fixed && { description: t('audio.library.tagFromFolder') }),
          onClick: () => actions.toggleTag(files, name),
        };
      }),
      ...(tags.length > 0 ? [MENU_SEPARATOR] : []),
      { type: 'item', label: t('audio.library.newTag'), icon: 'plus', onClick: () => actions.askNewTag(files) },
    ];
  };
  return { type: 'submenu', label: t('audio.library.tags'), icon: 'tag', children, subscribe: actions.onRecords };
}

/** A tag's menu in the rail. Both act on every record holding it, in both roots; where none does, only folder names give it, which are never written. */
export function tagRowMenu(actions: LibraryActions, name: string): ContextMenuEntry[] {
  const fixed = actions.tracksWithTag(name) === 0;
  const why = fixed ? { description: t('audio.library.tagFromFolder') } : {};
  return [
    { type: 'item', label: t('audio.library.rename'), icon: 'pencil', disabled: fixed, ...why, onClick: () => actions.askRenameTag(name) },
    { type: 'item', label: t('audio.library.removeTag'), icon: 'trash-2', destructive: true, disabled: fixed, ...why, onClick: () => actions.askRemoveTag(name) },
  ];
}
