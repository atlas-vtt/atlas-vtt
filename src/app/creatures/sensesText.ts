/** Reads the senses line out of a statblock's fields, whatever shape Fantasy Statblocks holds it in. */

import { boundedText } from './statblockValues';

function words(key: string): string {
  return key.replace(/_/g, ' ');
}

/** One entry of a senses list as a phrase: text, a named entry (`name`, `desc`), or nothing. */
function phraseOf(entry: unknown): string | null {
  if (typeof entry === 'string') return entry.trim() || null;
  if (typeof entry !== 'object' || entry === null) return null;
  const { name, desc } = entry as { name?: unknown; desc?: unknown };
  const parts = [name, desc].filter((part): part is string | number => (typeof part === 'string' && part.trim() !== '') || typeof part === 'number');
  return parts.length > 0 ? parts.join(' ') : null;
}

/** Senses kept by name (`{ darkvision: "120 ft.", passive_perception: 20 }`) as a line. */
function namedSenses(senses: Record<string, unknown>): string[] {
  return Object.entries(senses).flatMap(([key, value]) => {
    if (value === true) return [words(key)];
    if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) return [`${words(key)} ${value}`];
    return [];
  });
}

/** The senses of a Pathfinder perception line, which follow its modifier: "+7; darkvision". */
function afterModifier(perception: unknown): string | null {
  const entries: unknown[] = Array.isArray(perception) ? perception : [perception];
  const senses = entries.flatMap((entry) => {
    const line = typeof entry === 'object' && entry !== null ? (entry as { desc?: unknown }).desc : entry;
    const modifierEnd = typeof line === 'string' ? line.indexOf(';') : -1;
    const after = typeof line === 'string' && modifierEnd >= 0 ? line.slice(modifierEnd + 1).trim() : '';
    return after ? [after] : [];
  });
  return senses.length > 0 ? boundedText(senses.join(', ')) : null;
}

/**
 * The senses line of a statblock in any shape Fantasy Statblocks holds it: the `senses` text of
 * its Basic 5e and Pathfinder 2e Creature layouts (from frontmatter, a fence or the bestiary), a
 * list of such texts or of named entries, senses kept by name, or, without `senses`, what follows
 * the modifier in the `perception` trait of its Basic Pathfinder 2e layout. Null without one.
 */
export function sensesTextOf(fields: Readonly<Record<string, unknown>>): string | null {
  const { senses } = fields;
  let phrases: string[] = [];
  if (typeof senses === 'string') phrases = senses.trim() ? [senses.trim()] : [];
  else if (Array.isArray(senses)) phrases = senses.flatMap((entry) => phraseOf(entry) ?? []);
  else if (typeof senses === 'object' && senses !== null) phrases = namedSenses(senses as Record<string, unknown>);
  return phrases.length > 0 ? boundedText(phrases.join(', ')) : afterModifier(fields.perception);
}
