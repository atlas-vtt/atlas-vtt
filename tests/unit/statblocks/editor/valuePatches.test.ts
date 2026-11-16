import { describe, expect, it } from 'vitest';
import type { TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import {
  addItemPatches, fieldPatches, listItems, removeItemPatches, textOfValue, valueForText, valuePlaceholder, valueProblem,
} from '../../../../src/app/statblocks/editor/statblock-pane/valuePatches';
import { readField } from '../../../../src/app/statblocks/values/fieldValues';

const hp: TemplateField = { key: 'hp', label: 'Hit Points', type: 'number', formerKeys: ['hit_points'] };
const cr: TemplateField = { key: 'cr', label: 'Challenge', type: 'rating' };
const size: TemplateField = { key: 'size', label: 'Size', type: 'choice', options: ['Small', 'Large'] };
const tags: TemplateField = { key: 'tags', label: 'Tags', type: 'list' };

describe('valueForText', () => {
  it('stores what the declared type reads, and keeps what it cannot as typed', () => {
    expect(valueForText(hp, '18')).toBe(18);
    expect(valueForText(hp, ' 2.5 ')).toBe(2.5);
    expect(valueForText(hp, '1/4')).toBe('1/4');
    expect(valueForText(cr, '1/4')).toBe('1/4');
    expect(valueForText(cr, '3')).toBe(3);
    expect(valueForText(size, 'large')).toBe('Large');
    expect(valueForText(hp, '   ')).toBeUndefined();
  });

  it('flags a stored value that does not fit its type', () => {
    expect(valueProblem(hp, '1/4')).toContain('isn\'t a number');
    expect(valueProblem(hp, 14)).toBeNull();
    expect(valueProblem(size, 'Gigantic')).toContain('isn\'t one of');
    expect(valueProblem(cr, '½')).toBeNull();
  });
});

describe('fieldPatches', () => {
  it('sets a value on the value the edit started from', () => {
    expect(fieldPatches('hp', readField({ hp: 14 }, hp), 18)).toEqual([{ op: 'set', path: ['hp'], base: 14, next: 18 }]);
    expect(fieldPatches('hp', readField({}, hp), 18)).toEqual([{ op: 'set', path: ['hp'], base: undefined, next: 18 }]);
  });

  it('writes nothing for an unchanged value', () => {
    expect(fieldPatches('hp', readField({ hp: 14 }, hp), 14)).toEqual([]);
    expect(fieldPatches('hp', readField({}, hp), undefined)).toEqual([]);
  });

  it('removes a cleared key', () => {
    expect(fieldPatches('hp', readField({ hp: 14 }, hp), undefined)).toEqual([{ op: 'delete', path: ['hp'], base: 14 }]);
  });

  it('moves a value kept under a former key to the current key as it changes', () => {
    expect(fieldPatches('hp', readField({ hit_points: 14 }, hp), 20)).toEqual([
      { op: 'renameKey', from: 'hit_points', to: 'hp' },
      { op: 'set', path: ['hp'], base: 14, next: 20 },
    ]);
    expect(fieldPatches('hp', readField({ hit_points: 14 }, hp), undefined)).toEqual([{ op: 'delete', path: ['hit_points'], base: 14 }]);
  });
});

describe('chips', () => {
  it('adds and removes one item of a stored list at a time', () => {
    const read = readField({ tags: ['marsh', 'plant'] }, tags);
    expect(addItemPatches(read, 'tags', 'bog')).toEqual([{ op: 'insert', list: 'tags', after: 'plant', item: 'bog' }]);
    expect(removeItemPatches(read, 'tags', 0)).toEqual([{ op: 'remove', list: 'tags', item: 'marsh' }]);
  });

  it('starts a list where there is none, and writes a comma list as a list', () => {
    expect(addItemPatches(readField({}, tags), 'tags', 'bog')).toEqual([{ op: 'set', path: ['tags'], base: undefined, next: ['bog'] }]);
    expect(removeItemPatches(readField({ tags: 'marsh, plant' }, tags), 'tags', 1)).toEqual([
      { op: 'set', path: ['tags'], base: 'marsh, plant', next: ['marsh'] },
    ]);
  });
});

describe('valuePlaceholder', () => {
  it('asks for a value by its prompt, else its label; a table is typed cell by cell and asks for nothing whole', () => {
    const stats: TemplateField = { key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR', 'DEX', 'CON'] };
    expect(valuePlaceholder(stats)).toBe('Abilities');
    expect(valueForText(stats, '19 8 16')).toEqual([19, 8, 16]);
    expect(valueForText(stats, '19\t8\t16')).toEqual([19, 8, 16]);
    expect(valuePlaceholder({ ...stats, prompt: 'Six scores' })).toBe('Six scores');
    expect(valuePlaceholder(hp)).toBe('Hit Points');
  });

  it('starts a typed list or pairs value with its commas escaped, so that committing it unchanged gives it back', () => {
    const pairs: TemplateField = { key: 'res', label: 'Resist', type: 'pairs' };
    const stored = [{ 'Fire, cold': 3 }, { Dex: 2 }];
    expect(textOfValue(pairs, stored)).toBe('Fire\\, cold 3, Dex 2');
    expect(valueForText(pairs, textOfValue(pairs, stored))).toEqual(stored);
    expect(textOfValue({ type: 'text' }, 'Fire, cold')).toBe('Fire, cold');
  });

  it('reads the chips of a line stored as text like the card does', () => {
    expect(listItems('Fire\\, cold, Ice (a, b)')).toEqual(['Fire, cold', 'Ice (a, b)']);
  });
});
