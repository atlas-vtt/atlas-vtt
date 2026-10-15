import type { App } from 'obsidian';
import { withoutRandomTable, withRandomTable } from '../../../randomTables/tableSettings';
import { AssetService } from '../../../services/AssetService';
import type { CollectionSettings } from '../../../types/collectionSettingsTypes';
import type { RandomTableSource } from '../../../types/randomTableTypes';
import type { CollectionTable } from '../../../randomTables/TableNoteReader';
import { tableName } from './tableFacts';
import { runInBackground } from '../../../utils/backgroundTask';
import { t } from '../../../i18n';

/** Saves what `change` makes of the collection's settings without waiting; a failure is told. */
function saveInBackground(app: App, collectionId: string, what: string, change: (settings: CollectionSettings) => Partial<CollectionSettings>): void {
  const assets = AssetService.getInstance(app);
  runInBackground(assets.updateCollectionSettings(collectionId, change(assets.getCollectionSettings(collectionId))), what, t('tables.saveFailed'));
}

/** Saves whether several rolls of a table at once may repeat a row; the entry's other fields stay. */
export function setTableNoRepeats(app: App, collectionId: string, source: RandomTableSource, noRepeats: boolean): void {
  const { noRepeats: _was, ...rest } = source;
  const next: RandomTableSource = noRepeats ? { ...rest, noRepeats: true } : rest;
  saveInBackground(app, collectionId, 'Saving a table setting', (settings) => ({ randomTables: withRandomTable(settings, next) }));
}

/** Adds a table to the collection's tables and saves it; an entry for the same table is replaced. */
export async function addTableSource(app: App, collectionId: string, source: RandomTableSource): Promise<void> {
  const assets = AssetService.getInstance(app);
  await assets.updateCollectionSettings(collectionId, { randomTables: withRandomTable(assets.getCollectionSettings(collectionId), source) });
}

/** Gives a table the name the window shows; an empty name, or its own, shows its own again. */
export function setTableLabel(app: App, collectionId: string, found: CollectionTable, label: string): void {
  const { label: _was, ...rest } = found.source;
  const name = label.trim();
  const next: RandomTableSource = name && name !== tableName({ ...found, source: rest }) ? { ...rest, label: name } : rest;
  saveInBackground(app, collectionId, 'Renaming a table', (settings) => ({ randomTables: withRandomTable(settings, next) }));
}

/** Takes a table off the collection's list; its note stays as it is. */
export function removeTableSource(app: App, collectionId: string, source: RandomTableSource): void {
  saveInBackground(app, collectionId, 'Removing a table', (settings) => ({ randomTables: withoutRandomTable(settings, source.path, source.index) }));
}

/** Takes a loot base off the collection's list; the base stays as it is. */
export function removeLootBase(app: App, collectionId: string, path: string): void {
  saveInBackground(app, collectionId, 'Removing a loot base', (settings) => ({ lootBases: (settings.lootBases ?? []).filter((entry) => entry !== path) }));
}
