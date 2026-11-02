import { t } from '../../../../../i18n';
import { clampTrim, MAX_TRIM_DB } from '../../../../../sound/codec/soundInfo';
import type { SoundKind, SoundLicence } from '../../../../../sound/soundTypes';
import type { LibraryEntry } from '../../../../../soundLibrary/libraryOperations';
import type { LibraryFile } from '../../../../../soundLibrary/SoundLibrary';
import type { StoredSound } from '../../../../../soundLibrary/soundRecords';
import type { RootTag } from '../../../../../soundLibrary/soundTags';
import { MENU_SEPARATOR, type ContextMenuEntry } from '../../../context-menu/AtlasContextMenu';
import type { LibraryActions } from './useLibraryActions';
import { filesOfRows, type LibraryRow } from './rowModel';
import { tagsSubmenu } from './tagMenus';

const LICENCES: ReadonlyArray<{ licence: SoundLicence; label: string }> = [
  { licence: 'unknown', label: t('audio.licence.unknown') },
  { licence: 'cc0', label: t('audio.licence.cc0') },
  { licence: 'cc-by', label: t('audio.licence.ccBy') },
  { licence: 'other', label: t('audio.licence.other') },
];

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

/** What a sound's record holds: trim, licence and credit, for every file the menu acts on. */
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
    {
      type: 'submenu',
      label: t('audio.licence'),
      icon: 'scale',
      children: LICENCES.map(({ licence, label }) => ({ type: 'item' as const, label, checked: (sound?.licence ?? 'unknown') === licence, onClick: () => actions.edit(files, { licence }) })),
    },
    { type: 'item', label: t('audio.credit'), icon: 'quote', onClick: () => actions.askCredit(files, sound?.credit ?? '', sound?.name ?? files[0]?.name ?? '') },
    ...(sound?.credit ? [{ type: 'item' as const, label: t('audio.creditRemove'), icon: 'eraser', onClick: () => actions.edit(files, { credit: undefined }) }] : []),
  ];
}

/** A row's menu, the same from its ⋯, a right press and Shift+F10. */
export function rowMenu(row: LibraryRow, context: RowMenuContext): ContextMenuEntry[] {
  const { actions, entries, moveTo, rows } = context;
  if (row.type === 'waiting') return [{ type: 'item', label: t('audio.mood.delete'), icon: 'trash-2', destructive: true, onClick: () => actions.forget(row.sound) }];
  const files = filesOfRows(rows);
  return [
    { type: 'item', label: t('audio.library.preview'), icon: 'headphones', onClick: () => actions.preview(row.file) },
    MENU_SEPARATOR,
    { type: 'item', label: t('audio.library.rename'), icon: 'pencil', disabled: entries.length !== 1, onClick: () => context.beginRename(row) },
    ...(moveTo === null ? [] : [{ type: 'item' as const, label: t(moveTo === 'music' ? 'audio.library.moveToMusic' : 'audio.library.moveToAmbience'), icon: 'arrow-right-left', onClick: () => actions.move(entries, moveTo) }]),
    tagsSubmenu(actions, files, context.rootTags),
    ...recordEntries(context, files),
    MENU_SEPARATOR,
    { type: 'item', label: t('audio.mood.delete'), icon: 'trash-2', destructive: true, onClick: () => actions.remove(entries) },
  ];
}
