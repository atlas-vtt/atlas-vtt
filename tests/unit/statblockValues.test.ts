import { beforeEach, describe, expect, it } from 'vitest';
import {
  STATBLOCK_LIMITS,
  boundedFields,
  boundedStatblock,
  boundedText,
  boundedValue,
  readBudget,
  valueText,
} from '../../src/app/creatures/statblockValues';
import { HOSTILE_VALUES, counts, resetCounts } from '../mocks/hostileValues';

beforeEach(resetCounts);

/** The lists and maps of a value, and its texts' length, counted as a walk without limits would: only for bounded values. */
function sizeOf(value: unknown): { values: number; characters: number; depth: number } {
  if (typeof value === 'string') return { values: 1, characters: value.length, depth: 0 };
  if (value === null || typeof value !== 'object') return { values: 1, characters: 0, depth: 0 };
  const parts = Object.values(value).map(sizeOf);
  return {
    values: 1 + parts.reduce((sum, part) => sum + part.values, 0),
    characters: parts.reduce((sum, part) => sum + part.characters, 0),
    depth: 1 + Math.max(0, ...parts.map((part) => part.depth)),
  };
}

describe('a bounded copy of a statblock value', () => {
  it.each(Object.keys(HOSTILE_VALUES))('reads %s within one budget', (shape) => {
    const copy = boundedValue(HOSTILE_VALUES[shape]!());

    // What is read: every value costs the budget, and a map of any size is listed once.
    expect(counts.reads).toBeLessThanOrEqual(2 * STATBLOCK_LIMITS.values);
    expect(counts.listings).toBeLessThanOrEqual(STATBLOCK_LIMITS.values);
    // What is handed on: a tree any walk can afford.
    const size = sizeOf(copy);
    expect(size.values).toBeLessThanOrEqual(STATBLOCK_LIMITS.values);
    expect(size.characters).toBeLessThanOrEqual(STATBLOCK_LIMITS.characters);
    expect(size.depth).toBeLessThanOrEqual(STATBLOCK_LIMITS.depth);
  });

  it('lists a map that many values share once', () => {
    boundedValue(HOSTILE_VALUES['many entries sharing one wide map']!());
    expect(counts.listings).toBe(1);
  });

  it('shares its budget among everything read with it', () => {
    const budget = readBudget();
    const first = sizeOf(boundedValue(HOSTILE_VALUES['one list held a thousand times']!(), budget));
    const second = sizeOf(boundedValue(HOSTILE_VALUES['one list held a thousand times']!(), budget));
    expect(first.values + second.values).toBeLessThanOrEqual(STATBLOCK_LIMITS.values + 1);
    expect(budget.values).toBe(0);
  });

  it('copies an ordinary statblock as it is', () => {
    const statblock = {
      name: 'Goblin', ac: 15, hp: 7, flying: false, image: undefined, senses: null,
      stats: [8, 14, 10, 10, 8, 8],
      saves: [{ dexterity: 4 }],
      traits: [{ name: 'Nimble Escape', desc: 'Disengage or Hide as a bonus action.' }],
      spells: ['The goblin knows:', { cantrips: 'mage hand' }],
      resources: { mana: { current: 2, max: 5 } },
    };
    expect(boundedValue(statblock)).toEqual(statblock);
    expect(boundedValue(statblock)).not.toBe(statblock);
  });

  it('keeps the place of what it does not read, so the entries after it keep their number', () => {
    const loop: unknown[] = ['in'];
    loop.push(loop, 'after');
    expect(boundedValue(loop)).toEqual(['in', null, 'after']);
  });

  it('leaves out fields that would stand in for what every object can do', () => {
    const copy = boundedValue(JSON.parse('{"name":"Sly","toString":5,"valueOf":7,"__proto__":{"hp":1},"constructor":"x"}'));
    expect(copy).toEqual({ name: 'Sly' });
    expect(String(copy)).toBe('[object Object]');
    expect((copy as { hp?: number }).hp).toBeUndefined();
  });

  it('names a statblock by a text, whatever its name is', () => {
    expect(boundedStatblock({ name: { first: 'Grik', last: 'the Bold' } }).name).toBe('Grik the Bold');
    expect(boundedStatblock({ name: 7 }).name).toBe('7');
    expect(boundedStatblock({ name: null }).name).toBe('');
    expect(boundedStatblock({ hp: 3 })).toEqual({ hp: 3 });
  });

  it('cuts one text at the length of a text, and reads what comes after it', () => {
    const copy = boundedValue({ lore: 'x'.repeat(40_000), hp: 7, more: 'y'.repeat(40_000), ac: 15 });
    expect(copy).toEqual({ lore: 'x'.repeat(STATBLOCK_LIMITS.text), hp: 7, more: 'y'.repeat(STATBLOCK_LIMITS.text), ac: 15 });
  });

  it('has no fields for what is no map', () => {
    expect(boundedFields(['a', 'b'])).toEqual({});
    expect(boundedFields(undefined)).toEqual({});
    expect(boundedFields('text')).toEqual({});
  });
});

describe('the text of a statblock value', () => {
  it.each(Object.keys(HOSTILE_VALUES))('reads %s within one budget, and gives a text no longer than it', (shape) => {
    const text = valueText(HOSTILE_VALUES[shape]!());
    expect(counts.reads).toBeLessThanOrEqual(2 * STATBLOCK_LIMITS.values);
    expect(text.length).toBeLessThanOrEqual(STATBLOCK_LIMITS.text);
  });

  it('writes a value as Fantasy Statblocks shows it', () => {
    expect(valueText('Small humanoid')).toBe('Small humanoid');
    expect(valueText(15)).toBe('15');
    expect(valueText(null)).toBe('');
    expect(valueText(true)).toBe('');
    expect(valueText(['goblinoid', 'humanoid'])).toBe('(goblinoid humanoid)');
    expect(valueText(['fire', ['cold', 'acid']], { joiner: ', ', parens: false })).toBe('fire, (cold acid)');
    expect(valueText({ walk: 30, fly: [60, 'hover'] })).toBe('30 (60 hover)');
  });

  it('writes a value as Fantasy Statblocks stores a trait\'s text', () => {
    const stored = { joiner: ' ', parens: false, keyed: true };
    expect(valueText(['Advantage', 'near an ally.'], stored)).toBe('Advantage near an ally.');
    expect(valueText([['Up to', 'half speed.']], stored)).toBe('Up to half speed.');
    expect(valueText([3], stored)).toBe('3');
    expect(valueText([], stored)).toBe('');
    expect(valueText({ reach: '5 ft.' }, stored)).toBe('reach 5 ft.');
    expect(valueText([true, 'x', [], 'y'], stored)).toBe(' x  y');
  });

  it('is no longer than one text, however many parts it is joined of', () => {
    const parts = Array<string>(150).fill('word '.repeat(1000));
    expect(valueText(parts)).toHaveLength(STATBLOCK_LIMITS.text);
    expect(valueText({ a: parts, b: parts }, { joiner: ', ', parens: false })).toHaveLength(STATBLOCK_LIMITS.text);
    expect(boundedText('x'.repeat(1_000_000))).toHaveLength(STATBLOCK_LIMITS.text);
  });

  it('takes what it reads from the budget it is given', () => {
    const budget = readBudget();
    valueText(['one', 'two', ['three']], {}, budget);
    expect(budget.values).toBe(STATBLOCK_LIMITS.values - 5);
    expect(budget.characters).toBe(STATBLOCK_LIMITS.characters - 11);
  });

  it('reads no deeper than Fantasy Statblocks does', () => {
    expect(valueText([[[[['five deep']]]]])).toBe('(((((five deep)))))'.replace('five deep', ''));
    expect(valueText([[[['four deep']]]])).toBe('((((four deep))))');
  });
});
