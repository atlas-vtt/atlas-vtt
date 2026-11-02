import { t } from '../../../../../i18n';
import { clampTrim, MAX_TRIM_DB } from '../../../../../sound/codec/soundInfo';
import type { SoundLicence } from '../../../../../sound/soundTypes';
import type { LibraryEntry } from '../../../../../soundLibrary/libraryOperations';
import type { LibraryFile } from '../../../../../soundLibrary/SoundLibrary';
import type { StoredSound } from '../../../../../soundLibrary/soundRecords';
import { MENU_SEPARATOR, type ContextMenuEntry } from '../../../context-menu/AtlasContextMenu';
import type { LibraryActions } from './useLibraryActions';
import type { LibraryRow } from './rowModel';

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

function organising(context: RowMenuContext, row: LibraryRow): ContextMenuEntry[] {
  const { actions, entries } = context;
  return [
    { type: 'item', label: t('audio.library.rename'), icon: 'pencil', disabled: entries.length !== 1, onClick: () => context.beginRename(row) },
    { type: 'item', label: t('audio.library.move'), icon: 'folder-input', onClick: () => actions.askMove(entries) },
  ];
}

const deleting = ({ actions, entries }: RowMenuContext): ContextMenuEntry => ({ type: 'item', label: t('audio.mood.delete'), icon: 'trash-2', destructive: true, onClick: () => actions.remove(entries) });

/** A row's menu, the same from its ⋯, a right press and Shift+F10. */
export function rowMenu(row: LibraryRow, context: RowMenuContext): ContextMenuEntry[] {
  const { actions, rows } = context;
  if (row.type === 'waiting') return [{ type: 'item', label: t('audio.mood.delete'), icon: 'trash-2', destructive: true, onClick: () => actions.forget(row.sound) }];
  if (row.type === 'folder') {
    return [
      ...(row.kind === 'music' ? [
        { type: 'item' as const, label: t('audio.library.playFolder'), icon: 'play', onClick: () => actions.playFolder(row.kind, row.path, false) },
        { type: 'item' as const, label: t('audio.library.shuffleFolder'), icon: 'shuffle', onClick: () => actions.playFolder(row.kind, row.path, true) },
      ] : []),
      { type: 'item', label: t('audio.library.prepareFolder'), icon: 'hard-drive-download', onClick: () => actions.prepare(row.kind, row.path) },
      MENU_SEPARATOR,
      ...organising(context, row),
      MENU_SEPARATOR,
      deleting(context),
    ];
  }
  const files = rows.flatMap((one) => (one.type === 'file' ? [one.file] : []));
  return [
    ...(row.file.kind === 'music' ? [{ type: 'item' as const, label: t('audio.library.playNow'), icon: 'play', onClick: () => actions.toMix(files, 'now') }, MENU_SEPARATOR] : []),
    ...organising(context, row),
    ...recordEntries(context, files),
    MENU_SEPARATOR,
    deleting(context),
  ];
}
