/**
 * A Table cell as text: what typed text stores, what an input starts with,
 * and what pasted text fills. Pure: no React, no Obsidian.
 */

import type { TableCell } from '../../model/templateTypes';
import { parseNumberText } from '../../values/numberText';
import { scoreValues } from '../../values/valueCoercion';

/** A modifier printed beside a score ("18 (+4)"), as statblocks in books and PDFs write them. */
const PRINTED_MODIFIER = /\(\s*[+\-−–]?\d+\s*\)/g;

/** What a cell's typed text stores: a number where it reads as one, else the text as typed; nothing when blank. */
export function cellValue(text: string): TableCell {
  const typed = text.trim();
  if (!typed) return null;
  return parseNumberText(typed) ?? typed;
}

/** A cell's value as its input starts with it. */
export function cellText(cell: TableCell | undefined): string {
  return cell === undefined || cell === null ? '' : String(cell);
}

/**
 * The cells pasted text fills, rows of cells: a spreadsheet's block (tabs
 * between cells, a line per row), else a row of numbers ("14 12 13") or a
 * statblock's line with its printed modifiers ("18 (+4) 14 (+2)"). Null where
 * it is one value, which the cell takes as typed text.
 */
export function pastedCells(text: string): TableCell[][] | null {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  if (lines.length > 1 || text.includes('\t')) return lines.map((line) => line.split('\t').map(cellValue));
  const values = scoreValues(text.replace(PRINTED_MODIFIER, ' ')).filter((value) => value !== '');
  if (values.length < 2) return null;
  return [values.map((value) => (typeof value === 'number' ? value : typeof value === 'string' ? cellValue(value) : null))];
}
