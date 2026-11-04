import type { FieldValue } from '../model/templateTypes';
import { isEmptyValue } from './emptyValue';
import { valueText } from './valueText';

/** Brackets whose commas belong to one item: "resistant (fire, cold)", "[[Note, part]]". */
const OPENERS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };

/** Follows one character through the brackets open at it; `closers` holds what would close them. */
function followBrackets(char: string, closers: string[]): void {
  const opened = OPENERS[char];
  if (opened !== undefined) closers.push(opened);
  else if (char === closers[closers.length - 1]) closers.pop();
  // A bracket never reaches past its line.
  if (char === '\n') closers.length = 0;
}

function splitLines(text: string, escapes: boolean): string[] {
  const items: string[] = [];
  const closers: string[] = [];
  let current = '';
  for (let at = 0; at < text.length; at++) {
    const char = text.charAt(at);
    if (escapes && char === '\\' && text.charAt(at + 1) === ',') {
      current += ',';
      at++;
      continue;
    }
    followBrackets(char, closers);
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

/**
 * Pasted list text as items: one per line, and one per comma outside brackets,
 * so "Common, Elvish (can't speak, reads)" is two languages. Items are trimmed
 * and blank ones dropped.
 */
export function splitListText(text: string): string[] {
  return splitLines(text, false);
}

/**
 * A typed line of words or labels as items, as `splitListText` parts it except that `\,` is a comma of its item:
 * "Fire\, cold, Ice" is two. Only for what stores its items apart (or shows them), since `typedListText` then
 * gives the backslash back; a value kept as a line keeps its text as typed.
 */
export function splitEscapedList(text: string): string[] {
  return splitLines(text, true);
}

/** The text with its escaped commas as plain commas. */
export function unescapeCommas(text: string): string {
  return text.replace(/\\,/g, ',');
}

/** An item as a typed line must write it: a backslash before every comma that would part it. */
export function escapeListCommas(item: string): string {
  const closers: string[] = [];
  let escaped = '';
  for (const char of item) {
    followBrackets(char, closers);
    escaped += char === ',' && closers.length === 0 ? '\\,' : char;
  }
  return escaped;
}

function typedParts(value: FieldValue | undefined): string[] {
  if (Array.isArray(value)) return value.flatMap(typedParts);
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).map(([key, item]) => {
      const text = valueText(item);
      return escapeListCommas(text.trim() === '' ? key : `${key} ${text}`);
    });
  }
  const text = valueText(value);
  return text.trim() === '' ? [] : [escapeListCommas(text)];
}

/** A value as a line `splitEscapedList` reads back: items with their commas escaped; a value that is a line already, as it is written. */
export function typedListText(value: FieldValue | undefined): string {
  return typeof value === 'string' ? value : typedParts(value).join(', ');
}

/** A list field's items as text; a list written as one line of text is split at its unescaped commas. */
export function listItems(value: FieldValue | undefined): string[] {
  if (value === undefined || isEmptyValue(value)) return [];
  if (Array.isArray(value)) return value.map(valueText).filter((text) => text.trim() !== '');
  return splitEscapedList(valueText(value));
}
