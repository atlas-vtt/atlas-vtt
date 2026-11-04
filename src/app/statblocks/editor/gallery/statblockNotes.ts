/**
 * The statblocks "From a statblock" picks from (§7.9, §6.4): notes whose
 * frontmatter marks a statblock, native or Fantasy Statblocks', read from the
 * metadata cache without opening a file. A note's template is its auto
 * template, shaped by its own values, and its body becomes the text in the
 * new template's note, which the statblocks it starts begin with.
 */

import { TFile, type App } from 'obsidian';
import { noteName } from '../../../utils/pathUtils';
import { autoTemplate } from '../../model/autoTemplate';
import type { StatblockTemplate } from '../../model/templateTypes';
import { frontmatterBounds } from '../../notes/frontmatterBounds';
import { cachedFrontmatter, frontmatterSource, type FrontmatterRecord } from '../../notes/statblockSource';

export interface StatblockNoteChoice {
  path: string;
  /** The note's basename. */
  name: string;
}

const BY_NAME = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Every statblock note of the vault, by name. */
export function statblockNoteChoices(app: App): StatblockNoteChoice[] {
  return app.vault.getMarkdownFiles()
    .filter((file) => frontmatterSource(cachedFrontmatter(app, file)) !== null)
    .map((file) => ({ path: file.path, name: noteName(file.path) }))
    .sort((a, b) => BY_NAME.compare(a.name, b.name) || BY_NAME.compare(a.path, b.path));
}

/** The notes whose name or path holds every word typed. */
export function matchingNotes(notes: readonly StatblockNoteChoice[], query: string): StatblockNoteChoice[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return notes.filter((note) => words.every((word) => note.path.toLowerCase().includes(word)));
}

/** The note's values as the metadata cache holds them; empty for a note it has not read. */
export function noteValues(app: App, path: string): FrontmatterRecord {
  const file = app.vault.getAbstractFileByPath(path);
  return (file instanceof TFile ? cachedFrontmatter(app, file) : undefined) ?? {};
}

/** The template a statblock gives: the auto template of its values. Null where it shows nothing. */
export function statblockTemplate(values: FrontmatterRecord): StatblockTemplate | null {
  const template = autoTemplate(values);
  return template.layout.blocks.length > 0 ? template : null;
}

/** What a note holds below its frontmatter; empty where that is only blank lines. */
export function noteBodyOf(text: string): string {
  const body = text.slice(frontmatterBounds(text).contentStart);
  return body.trim() === '' ? '' : body;
}

/** What the statblock note at `path` holds below its frontmatter; empty for a note that is not there. */
export async function noteBodyAt(app: App, path: string): Promise<string> {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? noteBodyOf(await app.vault.cachedRead(file)) : '';
}
