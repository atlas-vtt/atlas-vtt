import type { NotePin } from '../types';

/** Pin kinds that show an auto-assigned label instead of an icon. */
export type PinLabelKind = 'number' | 'letter';

export function isPinLabelKind(icon: string | undefined): icon is PinLabelKind {
  return icon === 'number' || icon === 'letter';
}

/** The number a label ends with ("12", "A12" of a keyed floor), or null for one that ends with none. */
function trailingNumber(label: string): number | null {
  const digits = /(\d+)$/.exec(label)?.[1];
  return digits === undefined ? null : Number(digits);
}

/**
 * Next label of a sequence: one past the highest label in use, so a deleted
 * pin's label is never reissued and keyed notes ("Room 3") stay valid. Number
 * pins continue from the highest number a label ends with, so after a
 * generated dungeon's "A1" … "B7" the next is "8"; letter pins count only
 * labels of letters alone.
 */
export function nextPinLabel(pins: Record<string, NotePin>, kind: PinLabelKind): string {
  const used = Object.values(pins).flatMap((pin) => (pin.icon === kind && pin.label ? [pin.label] : []));

  if (kind === 'number') {
    return String(Math.max(0, ...used.flatMap((label) => trailingNumber(label) ?? [])) + 1);
  }
  return nextLetterLabel(used.filter((label) => /^[A-Z]+$/.test(label)));
}

/**
 * Spreadsheet-style sequence (A…Z, AA, AB…): bijective base 26, where A = 1 and
 * there is no zero digit. Labels are compared by index because 'AA' sorts before 'Z'.
 */
function nextLetterLabel(used: string[]): string {
  const toIndex = (label: string): number =>
    [...label].reduce((n, char) => n * 26 + (char.charCodeAt(0) - 64), 0);

  let n = Math.max(0, ...used.map(toIndex)) + 1;
  let label = '';
  while (n > 0) {
    n--;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}
