/**
 * A generator as its note writes it: a table whose rows are its parts, the first column naming
 * the part and the second holding what it rolls (`| Part | Result |`). The part named `Name`
 * names the result and may name other parts with `{Part}`, filled with what they rolled. Pure.
 */

import { statblockLinksAsText } from '../services/statblockLinks';
import type { RandomTable } from './tableModel';

/** One part of a generator: its row, its name and the cell it rolls. */
export interface GeneratorPart {
  /** The row's index in the table, which results record for rerolls. */
  readonly row: number;
  readonly label: string;
  readonly cell: string;
}

export interface GeneratorShape {
  /** The `Name` part; null where the result is named after the generator. */
  readonly name: GeneratorPart | null;
  /** Every other part, in row order. */
  readonly parts: readonly GeneratorPart[];
}

/** A part name as `{Part}` and the special parts find it: case and runs of spaces do not count. */
export const partKey = (label: string): string => label.trim().replace(/\s+/g, ' ').toLowerCase();

const NAME_PART = 'name';
/** The part whose presence makes a generator's result an item, and its type. */
export const TYPE_PART = 'type';

/** The parts of a generator table: rows without a part name are left out, and only the first `Name` names. */
export function generatorShape(table: RandomTable): GeneratorShape {
  let name: GeneratorPart | null = null;
  const parts: GeneratorPart[] = [];
  for (const row of table.rows) {
    const label = (row.cells[0] ?? '').trim();
    if (!label) continue;
    const part: GeneratorPart = { row: row.index, label, cell: row.cells[1] ?? '' };
    if (partKey(label) === NAME_PART) name ??= part;
    else parts.push(part);
  }
  return { name, parts };
}

/** `{Part}` written in a name, one line and bounded, so the scan stays linear. */
const PLACEHOLDER = /\{([^{}\n]{1,200})\}/g;

/**
 * `template` with every `{Part}` that names a part replaced by what it rolled (by `partKey`;
 * the first part of a name counts), an unknown one left as written, and the spaces an empty
 * part leaves behind closed up.
 */
export function fillName(template: string, values: ReadonlyMap<string, string>): string {
  const filled = template.replace(PLACEHOLDER, (written, label: string) => values.get(partKey(label)) ?? written);
  return filled.replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * A part as the name shows it: plain text, links as the words they show and no emphasis, since a
 * name is a file name and an item's name too ("Scroll of *[[Spells/Illusion|Illusion]]*" → "Scroll of Illusion").
 */
export function plainPart(value: string): string {
  return statblockLinksAsText(value).replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
}

/** What each part rolled as plain text, by `partKey`, for `fillName`; the first of two parts of one name counts. */
export function partValues(parts: readonly { label: string; value: string }[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const part of parts) if (!values.has(partKey(part.label))) values.set(partKey(part.label), plainPart(part.value));
  return values;
}
