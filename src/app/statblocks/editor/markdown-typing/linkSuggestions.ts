/**
 * What `[[` offers, as Obsidian's own link suggestions do: the vault's files
 * and their aliases by fuzzy match (the most recently changed first while
 * nothing is typed), and after `#` the headings of the note named before it.
 */

import { TFile, parseFrontMatterAliases, prepareFuzzySearch, type App } from 'obsidian';
import type { LinkQuery, PickedLink } from './linkQuery';

/** How many suggestions are offered at once. */
export const SUGGESTION_LIMIT = 50;

export interface LinkSuggestion {
  file: TFile;
  /** What the row shows: the note's name, an alias or a heading. */
  title: string;
  /** Muted beside the title: the folder, or the note a heading or alias belongs to. */
  note: string;
  link: PickedLink;
}

/** The folder a file lies in; nothing for the vault's root, whose path is `/`. */
function folderOf(file: TFile): string {
  const folder = file.parent?.path ?? '';
  return folder === '/' ? '' : folder;
}

/** A file's name as links show it: a note without `.md`. */
function shownName(file: TFile): string {
  return file.extension === 'md' ? file.basename : file.name;
}

function fileSuggestions(app: App, query: string, sourcePath: string): LinkSuggestion[] {
  const files = app.vault.getFiles();
  const linktext = (file: TFile): string => app.metadataCache.fileToLinktext(file, sourcePath, true);
  if (!query.trim()) {
    return [...files]
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, SUGGESTION_LIMIT)
      .map((file) => ({ file, title: shownName(file), note: folderOf(file), link: { linktext: linktext(file) } }));
  }
  const match = prepareFuzzySearch(query.trim());
  const scored: Array<{ score: number; suggestion: LinkSuggestion }> = [];
  for (const file of files) {
    const byName = match(shownName(file));
    const byPath = byName ? null : match(file.path);
    const best = byName ?? byPath;
    if (best) scored.push({ score: best.score, suggestion: { file, title: shownName(file), note: folderOf(file), link: { linktext: linktext(file) } } });
    for (const alias of parseFrontMatterAliases(app.metadataCache.getFileCache(file)?.frontmatter ?? null) ?? []) {
      const byAlias = match(alias);
      if (byAlias) scored.push({ score: byAlias.score, suggestion: { file, title: alias, note: shownName(file), link: { linktext: linktext(file), alias } } });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, SUGGESTION_LIMIT).map(({ suggestion }) => suggestion);
}

function headingSuggestions(app: App, path: string, query: string, sourcePath: string): LinkSuggestion[] {
  const file = path ? app.metadataCache.getFirstLinkpathDest(path, sourcePath) : app.vault.getFileByPath(sourcePath);
  if (!(file instanceof TFile)) return [];
  const match = query.trim() ? prepareFuzzySearch(query.trim()) : null;
  // A heading of the note itself is linked as `[[#Heading]]`.
  const linktext = path ? app.metadataCache.fileToLinktext(file, sourcePath, true) : '';
  const scored: Array<{ score: number; suggestion: LinkSuggestion }> = [];
  for (const { heading } of app.metadataCache.getFileCache(file)?.headings ?? []) {
    const found = match ? match(heading) : { score: 0 };
    if (found) scored.push({ score: found.score, suggestion: { file, title: heading, note: shownName(file), link: { linktext, heading } } });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, SUGGESTION_LIMIT).map(({ suggestion }) => suggestion);
}

/** The suggestions for a link being typed in the note at `sourcePath`. */
export function linkSuggestions(app: App, query: LinkQuery, sourcePath: string): LinkSuggestion[] {
  return query.heading === null ? fileSuggestions(app, query.path, sourcePath) : headingSuggestions(app, query.path, query.heading, sourcePath);
}
