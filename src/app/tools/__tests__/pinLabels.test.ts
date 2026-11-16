import { describe, it, expect } from 'vitest';
import { nextPinLabel, isPinLabelKind } from '../pinLabels';
import type { NotePin } from '../../types';

function pins(...entries: Array<[icon: string, label?: string]>): Record<string, NotePin> {
  return Object.fromEntries(
    entries.map(([icon, label], i): [string, NotePin] => [
      `p${i}`,
      { id: `p${i}`, kind: 'pin', x: 0, y: 0, notePath: '', icon, ...(label ? { label } : {}) },
    ]),
  );
}

describe('isPinLabelKind', () => {
  it('accepts only the enumerated pin kinds', () => {
    expect(isPinLabelKind('number')).toBe(true);
    expect(isPinLabelKind('letter')).toBe(true);
    expect(isPinLabelKind('skull')).toBe(false);
    expect(isPinLabelKind(undefined)).toBe(false);
  });
});

describe('nextPinLabel', () => {
  it('starts each sequence at its first label', () => {
    expect(nextPinLabel({}, 'number')).toBe('1');
    expect(nextPinLabel({}, 'letter')).toBe('A');
  });

  it('continues one past the highest label, never reissuing a deleted one', () => {
    expect(nextPinLabel(pins(['number', '1'], ['number', '3']), 'number')).toBe('4');
    expect(nextPinLabel(pins(['letter', 'A'], ['letter', 'C']), 'letter')).toBe('D');
  });

  it('keeps the number and letter sequences independent', () => {
    const mixed = pins(['number', '7'], ['letter', 'B'], ['skull']);
    expect(nextPinLabel(mixed, 'number')).toBe('8');
    expect(nextPinLabel(mixed, 'letter')).toBe('C');
  });

  it('compares numbers numerically, not as strings', () => {
    expect(nextPinLabel(pins(['number', '9'], ['number', '10']), 'number')).toBe('11');
  });

  it('continues past Z spreadsheet-style', () => {
    expect(nextPinLabel(pins(['letter', 'Z']), 'letter')).toBe('AA');
    expect(nextPinLabel(pins(['letter', 'AZ']), 'letter')).toBe('BA');
    expect(nextPinLabel(pins(['letter', 'ZZ']), 'letter')).toBe('AAA');
  });

  it('ranks multi-letter labels above single letters', () => {
    expect(nextPinLabel(pins(['letter', 'AA'], ['letter', 'Z']), 'letter')).toBe('AB');
  });

  it('continues number pins from the highest number a label ends with, as after a keyed dungeon', () => {
    expect(nextPinLabel(pins(['number', 'A1'], ['number', 'A12'], ['number', 'B3']), 'number')).toBe('13');
    expect(nextPinLabel(pins(['number', 'A2'], ['number', '5']), 'number')).toBe('6');
  });

  it('passes over labels that end with no number instead of answering NaN', () => {
    expect(nextPinLabel(pins(['number', 'Hall'], ['number', 'B']), 'number')).toBe('1');
    expect(nextPinLabel(pins(['number', 'Hall'], ['number', '2']), 'number')).toBe('3');
  });

  it('counts only labels of letters alone in the letter sequence', () => {
    expect(nextPinLabel(pins(['letter', 'A1'], ['letter', 'b'], ['letter', 'C']), 'letter')).toBe('D');
  });
});
