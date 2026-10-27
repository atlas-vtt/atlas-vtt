/**
 * A generator's result written as a note of its own: frontmatter with its name and one key per
 * part (the part's name in lower case, spaces as `_`), the generator note's `atlas-save-tags`
 * as `tags`, and the parts as `**Part.** value` paragraphs. A Base view over the folder the
 * notes go to makes every saved result rollable and givable again. Pure.
 */

import type { TableResult } from '../loot/lootHistory';
import { applyFrontmatterPatches } from '../statblocks/notes/frontmatterPatch';
import type { NotePatch } from '../statblocks/notes/patchTypes';
import { isRecord } from '../utils/guards';

/** The generator note's frontmatter key naming the tags its saved results get. */
export const SAVE_TAGS_KEY = 'atlas-save-tags';
const MAX_SAVE_TAGS = 20;
const MAX_TAG_LENGTH = 100;

/** A part's frontmatter key: "Special Benefit" → `special_benefit`. */
export const partNoteKey = (label: string): string => label.trim().toLowerCase().replace(/\s+/g, '_');

/** The tags a generator's frontmatter names for its saved results (`atlas-save-tags`: one tag or a list), `#` dropped. */
export function saveTagsOf(frontmatter: unknown): string[] {
  const value = isRecord(frontmatter) ? frontmatter[SAVE_TAGS_KEY] : undefined;
  const listed = Array.isArray(value) ? value : [value];
  const tags = listed
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().replace(/^#+/, ''))
    .filter((tag) => tag.length > 0 && tag.length <= MAX_TAG_LENGTH);
  return [...new Set(tags)].slice(0, MAX_SAVE_TAGS);
}

/** A part's heading in the body, closed with a full stop unless it ends with a mark of its own. */
const partHeading = (label: string): string => (/[.!?:]$/.test(label) ? label : `${label}.`);

/**
 * The note's text. `name` comes first and `tags` last; a part whose key one of them or an earlier
 * part already holds is left out of the frontmatter, never out of the body.
 */
export function generatorNoteText(result: TableResult, tags: readonly string[] = []): string {
  const values = new Map<string, string | string[]>([['name', result.text]]);
  for (const field of result.fields) {
    const key = partNoteKey(field.label);
    if (!values.has(key) && !(key === 'tags' && tags.length > 0)) values.set(key, field.value);
  }
  if (tags.length > 0) values.set('tags', [...tags]);
  const patches = [...values].map(([key, next]): NotePatch => ({ op: 'set', path: [key], base: undefined, next }));
  const written = applyFrontmatterPatches('', patches);
  if (written.conflicts.length > 0) throw new Error('The result could not be written as a note.');
  const body = result.fields.map((field) => `**${partHeading(field.label)}** ${field.value}`).join('\n\n');
  return `${written.text}${body ? `\n${body}\n` : ''}`;
}
