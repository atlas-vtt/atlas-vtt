import { normalizePath, type App, type TFile } from 'obsidian';
import type { TableResult } from '../loot/lootHistory';
import { ensureFolder, isPathTaken } from '../plugin/vaultFolders';
import { freeNamedPath } from '../services/recordFiles/recordNames';
import { generatorNoteText, saveTagsOf } from './generatorNote';
import { noteFileStem } from './tableNoteWrite';

/** Tries for a free name this often when another writer takes the one found first. */
const ATTEMPTS = 3;

/**
 * Writes a generator's result as a new note in `folder` (created when missing), named after the
 * result and numbered where the name is taken; never over an existing file. Its tags are those
 * the generator's note names in `atlas-save-tags`.
 */
export async function saveGeneratorNote(app: App, result: TableResult, folder: string): Promise<TFile> {
  const target = await ensureFolder(app, normalizePath(folder));
  const generator = app.vault.getFileByPath(result.notePath);
  const tags = generator ? saveTagsOf(app.metadataCache.getFileCache(generator)?.frontmatter) : [];
  const text = generatorNoteText(result, tags);
  const stem = noteFileStem(result.text, 'Result');
  for (let attempt = 1; ; attempt++) {
    const path = freeNamedPath(target.path, stem, '.md', (candidate) => isPathTaken(app, candidate));
    try {
      return await app.vault.create(path, text);
    } catch (error) {
      // Taken meanwhile: `create` never writes over a file, so look for the next free name.
      if (attempt >= ATTEMPTS || !isPathTaken(app, path)) throw error;
    }
  }
}
