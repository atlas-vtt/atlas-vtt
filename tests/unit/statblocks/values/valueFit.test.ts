import { describe, expect, it } from 'vitest';
import type { FieldType, FieldValue, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { textProblem, valueMisfit } from '../../../../src/app/statblocks/values/valueFit';

const field = (type: FieldType, extra: Partial<TemplateField> = {}): TemplateField => ({ key: 'x', label: 'X', type, ...extra });
const label = (type: FieldType, value: FieldValue, extra?: Partial<TemplateField>): string | null => valueMisfit(field(type, extra), value)?.label ?? null;

const ENTRIES: FieldValue = [{ name: 'Bite', desc: 'It bites.' }];

describe('valueMisfit: a value after its field\'s type changed', () => {
  it('flags what a number field cannot read as a number, in plain words', () => {
    expect(valueMisfit(field('number'), 'fast')).toEqual({ label: 'Not a number', problem: '“fast” isn\'t a number.' });
    expect(valueMisfit(field('number'), [3, 4])).toEqual({ label: 'Not a number', problem: '“3, 4” isn\'t a number.' });
    expect(label('number', true)).toBe('Not a number');
    expect(label('number', 14)).toBeNull();
    expect(label('number', '14')).toBeNull();
  });

  it('reads a single value of a rating, dice or choice field as its text', () => {
    expect(label('rating', '1/4')).toBeNull();
    expect(label('rating', 'tough')).toBe('Not a rating');
    expect(label('dice', '2d6 + 3')).toBeNull();
    expect(valueMisfit(field('dice'), 7)?.problem).toBe('“7” rolls no dice, like 2d6 + 3.');
    expect(label('choice', 'Beast', { options: ['Beast', 'Spirit'] })).toBeNull();
    expect(label('choice', 3, { options: ['Beast', 'Spirit'] })).toBe('Not an option');
    expect(label('choice', 3, { options: ['Beast'], open: true })).toBeNull();
    expect(label('choice', ['Beast', 'Spirit'], { open: true })).toBe('Not an option');
  });

  it('takes lists and records by their shape', () => {
    expect(label('text', ['Common', 'Elvish'])).toBeNull();
    expect(label('text', ENTRIES)).toBe('Not text');
    expect(label('markdown', { walk: 30 })).toBe('Not text');
    expect(label('list', 'Common, Elvish')).toBeNull();
    expect(label('list', ENTRIES)).toBe('Not a list');
    expect(label('scores', [10, 12])).toBeNull();
    expect(label('scores', { str: 10 })).toBeNull();
    expect(valueMisfit(field('scores'), '10 12 14')).toEqual({ label: 'Not table values', problem: '“10 12 14” isn\'t a list of table values.' });
    expect(label('entries', ENTRIES)).toBeNull();
    expect(label('entries', 'It waits.')).toBeNull();
    expect(label('entries', 12)).toBe('Not entries');
    expect(label('pairs', 'Dex +5')).toBeNull();
    expect(label('pairs', 5)).toBe('Not pairs');
    expect(label('image', 'art/bog.png')).toBeNull();
    expect(label('image', ['a.png'])).toBe('Not an image');
    expect(label('spells', ['At will: fog'])).toBeNull();
    expect(label('spells', 3)).toBe('Not spells');
  });

  it('never flags an empty value, nor a type of a newer template', () => {
    expect(valueMisfit(field('number'), undefined)).toBeNull();
    expect(valueMisfit(field('number'), '  ')).toBeNull();
    expect(valueMisfit(field('number'), [])).toBeNull();
    expect(valueMisfit(field('number'), null)).toBeNull();
    expect(valueMisfit(field('future' as FieldType), { a: 1 })).toBeNull();
  });

  it('cuts a long value short in the sentence', () => {
    const long = Array.from({ length: 20 }, (_, index) => `item ${index}`);
    const problem = valueMisfit(field('number'), long)?.problem ?? '';
    expect(problem.length).toBeLessThan(60);
    expect(problem).toMatch(/…” isn't a number\.$/);
  });
});

describe('textProblem: typed text', () => {
  it('checks numbers, ratings, dice and choices, and keeps any other text', () => {
    expect(textProblem(field('number'), '1/4')).toBe('“1/4” isn\'t a number.');
    expect(textProblem(field('scores'), '10 12 14')).toBeNull();
    expect(textProblem(field('text'), 'anything')).toBeNull();
    expect(textProblem(field('number'), '')).toBeNull();
  });
});
