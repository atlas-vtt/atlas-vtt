import { isEmptyValue } from '../../../../src/app/statblocks/values/emptyValue';
import { isPlainRecord, toFieldValue } from '../../../../src/app/statblocks/values/fieldValueOf';
import { escapeListCommas, listItems, splitEscapedList, splitListText, typedListText, unescapeCommas } from '../../../../src/app/statblocks/values/listText';
import {
  formatNumber, formatSigned, isWholeNumberText, numericValue, parseNumberText, parseRatingText, roundForDisplay,
} from '../../../../src/app/statblocks/values/numberText';
import { valueText } from '../../../../src/app/statblocks/values/valueText';

describe('isEmptyValue', () => {
  it.each([
    [undefined], [null], [''], ['   '], [[]], [{}], [['', null, []]], [{ name: '', desc: null }], [Number.NaN], [[[''], { a: [] }]],
  ])('%j is empty', (value) => {
    expect(isEmptyValue(value)).toBe(true);
  });

  it.each([[0], [false], ['0'], [' x '], [[0]], [{ a: false }], [new Date(0)]])('%j is a value', (value) => {
    expect(isEmptyValue(value)).toBe(false);
  });

  it('survives a cycle', () => {
    const cycle: unknown[] = [];
    cycle.push(cycle);
    expect(isEmptyValue(cycle)).toBe(false);
  });
});

describe('number text', () => {
  it.each([
    ['14', 14], ['+3', 3], ['-3', -3], ['−1', -1], ['–2', -2], ['2.5', 2.5], [' .5 ', 0.5], ['3.', 3], ['007', 7],
  ])('%j is %d', (text, expected) => {
    expect(parseNumberText(text)).toBe(expected);
  });

  it.each([['30 ft.'], ['1/4'], ['½'], [''], ['+'], ['1e3'], ['2,5'], ['1 000'], ['Infinity'], ['0x10'], ['--1']])('%j is not a number', (text) => {
    expect(parseNumberText(text)).toBeNull();
  });

  it('tells whole numbers', () => {
    expect(['3', '+2', '−1', ' 0 '].map(isWholeNumberText)).toEqual([true, true, true, true]);
    expect(['2.5', '1/4', 'x', ''].map(isWholeNumberText)).toEqual([false, false, false, false]);
  });

  it('reads numbers out of field values', () => {
    expect(numericValue(4)).toBe(4);
    expect(numericValue('+4')).toBe(4);
    expect(numericValue(Number.POSITIVE_INFINITY)).toBeNull();
    expect(numericValue(true)).toBeNull();
    expect(numericValue([4])).toBeNull();
    expect(numericValue(undefined)).toBeNull();
  });

  it('reads ratings only where the text is nothing else', () => {
    expect(parseRatingText('1/4')).toBe(0.25);
    expect(parseRatingText('½')).toBe(0.5);
    expect(parseRatingText('−1')).toBe(-1);
    expect(parseRatingText('1 / 2')).toBe(0.5);
    expect(parseRatingText('Creature 3')).toBeNull();
    expect(parseRatingText('3+1*')).toBeNull();
  });

  it('writes numbers as statblocks do', () => {
    expect(formatNumber(3)).toBe('3');
    expect(formatNumber(-0)).toBe('0');
    expect(formatNumber(0.125)).toBe('0.125');
    expect(formatSigned(3)).toBe('+3');
    expect(formatSigned(0)).toBe('+0');
    expect(formatSigned(-0)).toBe('+0');
    expect(formatSigned(-1)).toBe('-1');
    expect(formatSigned(-0.25)).toBe('-0.25');
    expect(formatSigned(1.5)).toBe('+1.5');
  });

  it('rounds computed numbers to two decimals', () => {
    expect(roundForDisplay(10 / 3)).toBe(3.33);
    expect(roundForDisplay(0.1 + 0.2)).toBe(0.3);
    expect(Object.is(roundForDisplay(-0.001), 0)).toBe(true);
    expect(Object.is(roundForDisplay(-0), 0)).toBe(true);
    expect(roundForDisplay(-7)).toBe(-7);
  });
});

describe('valueText', () => {
  it('writes values as one line', () => {
    expect(valueText(undefined)).toBe('');
    expect(valueText(null)).toBe('');
    expect(valueText('Large')).toBe('Large');
    expect(valueText(12)).toBe('12');
    expect(valueText(true)).toBe('Yes');
    expect(valueText(false)).toBe('No');
    expect(valueText(['Common', '', null, 'Elvish'])).toBe('Common, Elvish');
    expect(valueText({ dex: 5, con: null })).toBe('dex 5, con');
    expect(valueText([{ dex: 5 }, { wis: 2 }])).toBe('dex 5, wis 2');
  });
});

describe('commas escaped in a typed list', () => {
  it('splits at commas that are not escaped, and takes the backslash off the others', () => {
    expect(splitEscapedList('Fire\\, cold, Ice')).toEqual(['Fire, cold', 'Ice']);
    expect(splitEscapedList('Common (a, b), Elvish\nDeep')).toEqual(['Common (a, b)', 'Elvish', 'Deep']);
    expect(splitEscapedList('C:\\temp, x')).toEqual(['C:\\temp', 'x']);
    expect(unescapeCommas('Fire\\, cold')).toBe('Fire, cold');
  });

  it('leaves the plain split alone, for what writes its text back as a line', () => {
    expect(splitListText('Fire\\, cold')).toEqual(['Fire\\', 'cold']);
  });

  it('escapes only the commas that would split', () => {
    expect(escapeListCommas('Fire, cold')).toBe('Fire\\, cold');
    expect(escapeListCommas('Common (a, b)')).toBe('Common (a, b)');
    expect(escapeListCommas('Fire')).toBe('Fire');
  });

  it('writes a stored list or map so that it reads back the same, and a stored line as it is', () => {
    expect(typedListText(['Fire, cold', 'Ice'])).toBe('Fire\\, cold, Ice');
    expect(splitEscapedList(typedListText(['Fire, cold', 'a\\,b', 'x (y, z)']))).toEqual(['Fire, cold', 'a\\,b', 'x (y, z)']);
    expect(typedListText([{ 'Fire, cold': 3 }, { Dex: 2 }])).toBe('Fire\\, cold 3, Dex 2');
    expect(typedListText({ 'Fire, cold': 3, Dex: 2 })).toBe('Fire\\, cold 3, Dex 2');
    expect(typedListText({ 'Fire, cold': null })).toBe('Fire\\, cold');
    expect(typedListText('Fire\\, cold, Ice')).toBe('Fire\\, cold, Ice');
    expect(typedListText(undefined)).toBe('');
  });

  it('reads a line stored as text at its unescaped commas, and a stored list item by item', () => {
    expect(listItems('Fire\\, cold, Ice')).toEqual(['Fire, cold', 'Ice']);
    expect(listItems(['Fire\\, cold'])).toEqual(['Fire\\, cold']);
  });
});

describe('splitListText', () => {
  it('splits pasted lists by lines and commas outside brackets', () => {
    expect(splitListText('Common, Elvish')).toEqual(['Common', 'Elvish']);
    expect(splitListText('Common\nElvish, Dwarvish\n\n')).toEqual(['Common', 'Elvish', 'Dwarvish']);
    expect(splitListText("Common (can't speak, reads), [[Deep, Speech]]")).toEqual(["Common (can't speak, reads)", '[[Deep, Speech]]']);
    expect(splitListText('a (b\nc, d')).toEqual(['a (b', 'c', 'd']);
    expect(splitListText(' , ,')).toEqual([]);
  });
});

describe('toFieldValue', () => {
  it('returns values that are already field values unchanged', () => {
    const value = { stats: [10, 12], saves: [{ dex: 5 }], flag: true, none: null };
    expect(toFieldValue(value)).toBe(value);
    expect(toFieldValue('x')).toBe('x');
    expect(toFieldValue(undefined)).toBeUndefined();
  });

  it('converts what YAML or code may leave in frontmatter', () => {
    expect(toFieldValue(new Date('2024-01-02T00:00:00Z'))).toBe('2024-01-02T00:00:00.000Z');
    expect(toFieldValue({ a: undefined, b: (): number => 1, c: [undefined, 2] })).toEqual({ c: [null, 2] });
    expect(toFieldValue(new Map())).toBeUndefined();
  });

  it('accepts records without a prototype and refuses lists and dates as records', () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.a = 1;
    expect(isPlainRecord(bare)).toBe(true);
    expect(toFieldValue(bare)).toBe(bare);
    expect(isPlainRecord([])).toBe(false);
    expect(isPlainRecord(new Date())).toBe(false);
    expect(isPlainRecord(null)).toBe(false);
  });

  it('stops at a cycle', () => {
    const cycle: Record<string, unknown> = { name: 'loop' };
    cycle.self = cycle;
    const converted = toFieldValue(cycle);
    expect(converted).toMatchObject({ name: 'loop' });
  });
});
