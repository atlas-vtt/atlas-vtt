import type { App } from 'obsidian';
import { ensureFolder, isPathTaken } from '../plugin/vaultFolders';
import { freeNamedPath, nameStem } from '../services/recordFiles/recordNames';
import type { RandomTableKind, RandomTableSource } from '../types/randomTableTypes';
import { noteName } from '../utils/pathUtils';
import { tablesOfNote } from './noteTables';
import type { PastedTable } from './pastedTable';
import { tableNoteText } from './tableMarkdown';
import { tablesFolder } from './tablePaths';

/** A file name for `name` (`fallback` for none): file systems limit bytes, not characters, so the full name stays in the note. */
export function noteFileStem(name: string, fallback = 'Table'): string {
  const encoder = new TextEncoder();
  let stem = '';
  let bytes = 0;
  for (const char of nameStem(name, fallback)) {
    const size = encoder.encode(char).length;
    if (bytes + size > 200) break;
    stem += char;
    bytes += size;
  }
  return stem;
}

/**
 * Writes a pasted table as a new note in the collection's `tables` folder, under a free name,
 * and returns how the collection names its table. The note holds the table and nothing else.
 */
export async function writeTableNote(
  app: App, collectionId: string, name: string, table: PastedTable, kind: RandomTableKind,
): Promise<RandomTableSource> {
  const folder = await ensureFolder(app, tablesFolder(collectionId));
  const path = freeNamedPath(folder.path, noteFileStem(name), '.md', (candidate) => isPathTaken(app, candidate));
  const text = tableNoteText(name, table);
  await app.vault.create(path, text);
  const written = tablesOfNote(text, noteName(path)).tables[0];
  return { path, ...(written?.heading !== undefined && { table: written.name }), index: 0, kind };
}
