import type { FieldValue } from '../model/templateTypes';
import { formatNumber } from './numberText';

const LIST_SEPARATOR = ', ';

/**
 * A value as one line of text: numbers as statblocks write them, yes/no for
 * switches, list items joined by commas, records as "key value" parts. Empty
 * parts are left out, so nothing reads ", ,".
 */
export function valueText(value: FieldValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isNaN(value) ? '' : formatNumber(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return joinTexts(value.map(valueText));
  return joinTexts(Object.entries(value).map(([key, item]) => {
    const text = valueText(item);
    return text.trim() === '' ? key : `${key} ${text}`;
  }));
}

function joinTexts(texts: string[]): string {
  return texts.filter((text) => text.trim() !== '').join(LIST_SEPARATOR);
}

/** A piece of text quoted for a message: “30 ft.” */
export function quoted(text: string): string {
  return `\u201c${text}\u201d`;
}
