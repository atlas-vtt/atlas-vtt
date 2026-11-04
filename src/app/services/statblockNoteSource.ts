import type { App, TFile } from 'obsidian';

/**
 * Matches Fantasy Statblocks' watcher: only these exact values cause a note to
 * be parsed into the bestiary. `statblock: <layout name>` chooses a layout and
 * does *not* make the note a bestiary entry. Whether a note is a statblock at
 * all is `statblockSourceOf` (`statblocks/notes/statblockSource.ts`).
 */
export function hasBestiaryFrontmatter(app: App, file: TFile): boolean {
  const statblock: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.statblock;
  return statblock === true || statblock === 'true' || statblock === 'inline';
}
