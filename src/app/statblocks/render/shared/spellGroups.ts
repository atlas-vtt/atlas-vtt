/**
 * Spell lists in Fantasy Statblocks' shape: a list of header lines
 * ("Innate spellcasting:") and spell lines, each spell line plain text or
 * `{ <level>: <spells> }`.
 */

import type { FieldValue } from '../../model/templateTypes';

/** A spells value as Fantasy Statblocks writes it: a list, or a record of level lines, or one line. */
export function spellEntries(value: FieldValue | undefined): FieldValue[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Object.entries(value).map(([level, spells]): FieldValue => ({ [level]: spells }));
  return [value];
}

export interface SpellLine {
  /** "1st level (4 slots)"; absent for a spell line written as plain text. */
  level?: string;
  spells: string;
}

export interface SpellGroup {
  header: string;
  spells: SpellLine[];
}

function ensureColon(header: string): string {
  return /[^a-zA-Z0-9]$/.test(header) ? header : `${header}:`;
}

function isHeaderLine(entry: unknown): entry is string {
  return typeof entry === 'string' && (entry.trim().endsWith(':') || !entry.includes(':'));
}

/** A statblock is the user's own text: an empty list item is null, and anything else that names no level is no spell line. */
function spellLine(entry: unknown, textOf: (value: unknown) => string): SpellLine | null {
  if (typeof entry === 'string') return { spells: entry };
  const [level, spells] = Object.entries(entry !== null && typeof entry === 'object' ? entry : {})[0] ?? [];
  return level === undefined || spells === undefined ? null : { level, spells: textOf(spells) };
}

/**
 * The entries grouped under their header lines. Spell lines before the first
 * header go under `defaultHeader` ("Wolf knows the following spells:").
 * `textOf` writes a value as text the way the renderer does.
 */
export function spellGroups(
  entries: readonly unknown[],
  defaultHeader: string,
  textOf: (value: unknown) => string,
): SpellGroup[] {
  const groups: SpellGroup[] = [];
  for (const entry of entries) {
    if (isHeaderLine(entry)) {
      groups.push({ header: ensureColon(entry), spells: [] });
      continue;
    }
    const line = spellLine(entry, textOf);
    if (!line) continue;
    if (!groups.length) groups.push({ header: defaultHeader, spells: [] });
    groups[groups.length - 1]?.spells.push(line);
  }
  return groups;
}
