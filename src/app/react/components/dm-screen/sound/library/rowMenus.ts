import { t } from '../../../../../i18n';
import { clampTrim, MAX_TRIM_DB } from '../../../../../sound/codec/soundInfo';
import type { SoundKind } from '../../../../../sound/soundTypes';
import type { LibraryEntry } from '../../../../../soundLibrary/libraryOperations';
import type { LibraryFile } from '../../../../../soundLibrary/SoundLibrary';
import type { StoredSound } from '../../../../../soundLibrary/soundRecords';
import type { RootTag } from '../../../../../soundLibrary/soundTags';
import { MENU_SEPARATOR, type ContextMenuEntry } from '../../../context-menu/AtlasContextMenu';
import type { LibraryActions } from './useLibraryActions';
import { filesOfRows, type LibraryRow } from './rowModel';
import { tagsSubmenu } from './tagMenus';

const signed = (db: number): string => (db > 0 ? `+${db}` : String(db));

export interface RowMenuContext {
  actions: LibraryActions;
  /** The rows the menu acts on: the selection if the row is in it, else the row alone. */
  rows: readonly LibraryRow[];
  entries: readonly LibraryEntry[];
  /** The record of the row the menu opened from, whose values it shows. */
  sound: StoredSound | null;
  /** The tags of the row's root, as they stood when the menu opened: one that loses its last track stays there to be pressed again. */
  rootTags: readonly RootTag[];
  /** The other root, where it is linked. */
  moveTo: SoundKind | null;
  beginRename: (row: LibraryRow) => void;
}

/** What a sound's record holds: its trim, for every file the menu acts on. Rights to a file are the GM's to know (owner, 2026-11-03). */
function recordEntries(context: RowMenuContext, files: readonly LibraryFile[]): ContextMenuEntry[] {
  const { actions, sound } = context;
  const trim = sound?.trimDb ?? 0;
  const setTrim = (db: number): void => actions.edit(files, { trimDb: db === 0 ? undefined : clampTrim(db) });
  return [
    {
      type: 'item',
      label: t('audio.trim'),
      icon: 'volume-2',
      keepOpen: true,
      onClick: () => undefined,
      stepper: {
        value: t('audio.trimValue', { value: signed(trim) }),
        label: t('audio.trim'),
        onDecrement: () => setTrim(trim - 1),
        onIncrement: () => setTrim(trim + 1),
        canDecrement: trim > -MAX_TRIM_DB,
      },
    },
  ];
}

/** A row's menu, the same from its ⋯, a right press and Shift+F10. */
export function rowMenu(row: LibraryRow, context: RowMenuContext): ContextMenuEntry[] {
  const { actions, entries, moveTo, rows } = context;
  if (row.type === 'waiting') {
    return [
      { type: 'item', label: t('audio.library.relink'), icon: 'file-search', disabled: !actions.mayRelink(row.sound.kind), onClick: () => actions.relink(row.sound) },
      MENU_SEPARATOR,
      { type: 'item', label: t('audio.library.forget'), icon: 'trash-2', destructive: true, onClick: () => actions.forget(row.sound) },
    ];
  }
  const files = filesOfRows(rows);
  return [
    { type: 'item', label: t('audio.library.preview'), icon: 'headphones', onClick: () => actions.preview(row.file) },
    MENU_SEPARATOR,
    { type: 'item', label: t('audio.library.rename'), icon: 'pencil', disabled: entries.length !== 1, onClick: () => context.beginRename(row) },
    ...(moveTo === null ? [] : [{ type: 'item' as const, label: t(moveTo === 'music' ? 'audio.library.moveToMusic' : 'audio.library.moveToAmbience'), icon: 'arrow-right-left', onClick: () => actions.move(entries, moveTo) }]),
    tagsSubmenu(actions, files, context.rootTags),
    ...recordEntries(context, files),
    MENU_SEPARATOR,
    { type: 'item', label: t('audio.library.moveToTrash'), icon: 'trash-2', destructive: true, onClick: () => actions.remove(entries) },
  ];
}
