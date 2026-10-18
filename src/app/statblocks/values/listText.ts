import type { FieldValue } from '../model/templateTypes';
import { isEmptyValue } from './emptyValue';
import { valueText } from './valueText';

/** Brackets whose commas belong to one item: "resistant (fire, cold)", "[[Note, part]]". */
const OPENERS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };

/**
 * Pasted list text as items: one per line, and one per comma outside brackets,
 * so "Common, Elvish (can't speak, reads)" is two languages. Items are trimmed
 * and blank ones dropped.
 */
export function splitListText(text: string): string[] {
  const items: string[] = [];
  const closers: string[] = [];
  let current = '';
  for (const char of text) {
    const opened = OPENERS[char];
    if (opened !== undefined) closers.push(opened);
    else if (char === closers[closers.length - 1]) closers.pop();
    // A bracket never reaches past its line.
    if (char === '\n') closers.length = 0;
    const separates = char === '\n' || (char === ',' && closers.length === 0);
    if (separates) {
      items.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  items.push(current);
  return items.map((item) => item.trim()).filter((item) => item !== '');
}

/** A list field's items as text; a list written as one line of text is split at its commas. */
export function listItems(value: FieldValue | undefined): string[] {
  if (value === undefined || isEmptyValue(value)) return [];
  if (Array.isArray(value)) return value.map(valueText).filter((text) => text.trim() !== '');
  return splitListText(valueText(value));
}
