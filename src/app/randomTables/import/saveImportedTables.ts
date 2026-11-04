import type { App } from 'obsidian';
import { AssetService } from '../../services/AssetService';
import type { RandomTableKind, RandomTableSource } from '../../types/randomTableTypes';
import { withRandomTable } from '../tableSettings';
import { writeTableNote } from '../tableNoteWrite';
import type { PastedTable } from '../pastedTable';
import { TableImportError, validateImportTable } from './importModel';

export interface ImportedTableNote {
  id: number;
  name: string;
  kind: RandomTableKind;
  table: PastedTable;
}

/** Lives for the dialog session. Created notes are never recreated by a retry. */
export type ImportSaveJournal = Map<number, RandomTableSource>;

export async function saveImportedTables(
  app: App, collectionId: string, notes: readonly ImportedTableNote[], journal: ImportSaveJournal,
): Promise<RandomTableSource[]> {
  const assets = AssetService.getInstance(app);
  if (!assets.loadedCollections().some((collection) => collection.id === collectionId)) throw new Error('The destination collection is gone');
  if (notes.length === 0 || new Set(notes.map((note) => note.id)).size !== notes.length) throw new TableImportError('malformed');
  for (const note of notes) {
    if (note.name.trim() === '') throw new TableImportError('malformed');
    validateImportTable(note.table, note.name);
  }
  const sources: RandomTableSource[] = [];
  for (const note of notes) {
    const created = journal.get(note.id);
    if (created && !app.vault.getFileByPath(created.path)) throw new Error('An imported note was moved or deleted before saving finished');
    const source = created ?? await writeTableNote(app, collectionId, note.name.trim(), note.table, note.kind);
    journal.set(note.id, source);
    sources.push(source);
  }
  let settings = assets.getCollectionSettings(collectionId);
  for (const source of sources) settings = { ...settings, randomTables: withRandomTable(settings, source) };
  // Retry the actual disk write even if a failed previous write already updated the in-memory settings.
  await assets.updateCollectionSettings(collectionId, { randomTables: settings.randomTables });
  return sources;
}
