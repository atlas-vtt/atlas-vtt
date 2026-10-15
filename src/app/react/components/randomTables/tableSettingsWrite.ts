import type { App } from 'obsidian';
import {
  storedRandomTable, withoutRandomTable, withRandomTable, withRandomTableChanged, withRestoredRandomTable,
} from '../../../randomTables/tableSettings';
import { AssetService } from '../../../services/AssetService';
import type { CollectionSettings } from '../../../types/collectionSettingsTypes';
import type { RandomTableSource } from '../../../types/randomTableTypes';
import type { CollectionTable } from '../../../randomTables/TableNoteReader';
import { withLabel } from './tableFacts';
import { runInBackground } from '../../../utils/backgroundTask';
import { showNotice } from '../../../ui/notice';
import { t } from '../../../i18n';

/** Long enough to read the notice and reach its Undo. */
const UNDO_MS = 8000;

type SettingsChange = (settings: CollectionSettings) => Partial<CollectionSettings> | null;

/**
 * Saves what `change` makes of the collection's settings as they are when it is called (not as a
 * view last rendered them), without waiting; nothing when it makes nothing, and a failure is told.
 */
function saveInBackground(app: App, collectionId: string, what: string, change: SettingsChange): Promise<void> {
  const assets = AssetService.getInstance(app);
  const changed = change(assets.getCollectionSettings(collectionId));
  if (!changed) return Promise.resolve();
  const saving = assets.updateCollectionSettings(collectionId, changed);
  runInBackground(saving, what, t('tables.saveFailed'));
  return saving;
}

/** Changes the stored entry of `source`'s table; nothing when the list no longer holds it. */
function changeTable(app: App, collectionId: string, source: RandomTableSource, what: string, change: (stored: RandomTableSource) => RandomTableSource): void {
  void saveInBackground(app, collectionId, what, (settings) => {
    const randomTables = withRandomTableChanged(settings, source.path, source.index, change);
    return randomTables && { randomTables };
  });
}

/** Saves whether several rolls of a table at once may repeat a row; the entry's other fields stay. */
export function setTableNoRepeats(app: App, collectionId: string, source: RandomTableSource, noRepeats: boolean): void {
  changeTable(app, collectionId, source, 'Saving a table setting', ({ noRepeats: _was, ...rest }) => (noRepeats ? { ...rest, noRepeats: true } : rest));
}

/** Adds a table to the collection's tables and saves it; an entry for the same table is replaced. */
export async function addTableSource(app: App, collectionId: string, source: RandomTableSource): Promise<void> {
  const assets = AssetService.getInstance(app);
  await assets.updateCollectionSettings(collectionId, { randomTables: withRandomTable(assets.getCollectionSettings(collectionId), source) });
}

/** Gives a table the name Atlas shows; a blank name, or its own, shows its own again. The note stays as it is. */
export function setTableLabel(app: App, collectionId: string, found: CollectionTable, label: string): void {
  changeTable(app, collectionId, found.source, 'Renaming a table', (stored) => withLabel(found, stored, label));
}

/** Tells that `name` left the list, with an Undo that runs `undo`. */
function offerUndo(name: string, undo: () => void): void {
  const message = createFragment();
  message.append(`${t('tables.removed', { name })} `);
  const link = createEl('a', { text: t('tables.undo'), href: '#' });
  message.append(link);
  const notice = showNotice(message, UNDO_MS);
  link.addEventListener('click', (event) => {
    event.preventDefault();
    notice.hide();
    undo();
  });
}

/** Saves `remove`, then offers to save `restore`; nothing is offered when the removal fails. */
function removeOfferingUndo(app: App, collectionId: string, name: string, what: string, remove: SettingsChange, restore: SettingsChange): void {
  void saveInBackground(app, collectionId, `Removing ${what}`, remove)
    .then(() => offerUndo(name, () => void saveInBackground(app, collectionId, `Restoring ${what}`, restore)), () => undefined);
}

/** Takes a table off the collection's list, offering to put its entry back as it was; its note stays as it is. */
export function removeTableSource(app: App, collectionId: string, source: RandomTableSource, name: string): void {
  const removed = storedRandomTable(AssetService.getInstance(app).getCollectionSettings(collectionId), source.path, source.index);
  if (!removed) return;
  removeOfferingUndo(app, collectionId, name, 'a table',
    (settings) => ({ randomTables: withoutRandomTable(settings, source.path, source.index) }),
    (settings) => ({ randomTables: withRestoredRandomTable(settings, removed.entry, removed.at) }));
}

/** Takes a loot base off the collection's list, offering to put it back; the base stays as it is. */
export function removeLootBase(app: App, collectionId: string, path: string, name: string): void {
  const at = (AssetService.getInstance(app).getCollectionSettings(collectionId).lootBases ?? []).indexOf(path);
  if (at < 0) return;
  removeOfferingUndo(app, collectionId, name, 'a loot base',
    (settings) => ({ lootBases: (settings.lootBases ?? []).filter((entry) => entry !== path) }),
    ({ lootBases = [] }) => (lootBases.includes(path) ? null : { lootBases: [...lootBases.slice(0, at), path, ...lootBases.slice(at)] }));
}
