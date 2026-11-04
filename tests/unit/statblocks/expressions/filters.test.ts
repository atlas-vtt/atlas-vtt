import { applyFilter, lookupRow, parseFilter } from '../../../../src/app/statblocks/expressions/filters';

const XP = { 0: '10', '1/8': '25', '1/4': '50', '1/2': '100', 1: '200', Boss: '1000', empty: '' };

describe('parseFilter', () => {
  it('reads every filter', () => {
    expect(parseFilter('signed', 0)).toEqual({ name: 'signed' });
    expect(parseFilter(' Upper ', 0)).toEqual({ name: 'upper' });
    expect(parseFilter('lower', 0)).toEqual({ name: 'lower' });
    expect(parseFilter('count', 0)).toEqual({ name: 'count' });
    expect(parseFilter('avg', 0)).toEqual({ name: 'avg' });
    expect(parseFilter('lookup: xp ', 0)).toEqual({ name: 'lookup', table: 'xp' });
    expect(parseFilter('join:; ', 0)).toEqual({ name: 'join', text: '; ' });
    expect(parseFilter('join:', 0)).toEqual({ name: 'join', text: '' });
    expect(parseFilter('join:a:b', 0)).toEqual({ name: 'join', text: 'a:b' });
  });

  it('places its errors where the filter starts', () => {
    expect(parseFilter('nope', 12)).toMatchObject({ kind: 'syntax', at: 12 });
  });
});

describe('applyFilter', () => {
  it('signs numbers and text that is a number, and leaves other text alone', () => {
    expect(applyFilter([3, '+2', '−1', 0, -0.5, 'x'], { name: 'signed' }).items).toEqual(['+3', '+2', '-1', '+0', '-0.5', 'x']);
  });

  it('changes case', () => {
    expect(applyFilter(['Fire', 3, true], { name: 'upper' }).items).toEqual(['FIRE', '3', 'YES']);
    expect(applyFilter(['Fire'], { name: 'lower' }).items).toEqual(['fire']);
  });

  it('counts items', () => {
    expect(applyFilter(['a', 'b', 'c'], { name: 'count' }).items).toEqual([3]);
  });

  it('averages dice and drops what is not dice', () => {
    expect(applyFilter(['7d10 + 14', '2d6+2', 'd20', '1d4 − 1', '14', 'lots'], { name: 'avg' }).items).toEqual([52, 9, 10, 1, 14]);
  });

  it('looks rows up and drops values without one', () => {
    expect(applyFilter(['1/4', 'boss', 7, 'empty'], { name: 'lookup', table: 'xp' }, { xp: XP }).items).toEqual(['50', '1000']);
  });

  it('reports a missing table and gives nothing', () => {
    expect(applyFilter(['1'], { name: 'lookup', table: 'gold' }, { xp: XP })).toEqual({
      items: [], problem: { kind: 'unbound', ref: 'gold', message: 'There is no lookup table called “gold”.' },
    });
    expect(applyFilter(['1'], { name: 'lookup', table: 'toString' }, { xp: XP }).items).toEqual([]);
  });

  it('joins items by the text as written, skipping blank ones', () => {
    expect(applyFilter(['a', '', 'b', ['c', 'd']], { name: 'join', text: '; ' }).items).toEqual(['a; b; c, d']);
    expect(applyFilter([' ', ''], { name: 'join', text: '; ' }).items).toEqual([]);
  });
});

describe('lookupRow', () => {
  it('finds rows as written, in any case, and by the same rating', () => {
    expect(lookupRow(XP, '1/4')).toBe('50');
    expect(lookupRow(XP, ' 1/4 ')).toBe('50');
    expect(lookupRow(XP, 'BOSS')).toBe('1000');
    expect(lookupRow(XP, '½')).toBe('100');
    expect(lookupRow(XP, '0.125')).toBe('25');
    expect(lookupRow(XP, '1 / 2')).toBe('100');
  });

  it('finds nothing for other values or the prototype', () => {
    expect(lookupRow(XP, '2')).toBeUndefined();
    expect(lookupRow(XP, 'Creature 1')).toBeUndefined();
    expect(lookupRow(XP, 'constructor')).toBeUndefined();
  });
});
