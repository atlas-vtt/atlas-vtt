import { describe, expect, it } from 'vitest';
import {
  parseQuantity, quantityRange, readDiceQuantity, refQuantity, refsRange, rollQuantity, rolledRefs, stepQuantity,
} from '../../src/app/encounters/encounterQuantity';

describe('encounter quantities', () => {
  it('reads whole numbers and plain dice sums, and nothing else', () => {
    expect(parseQuantity(' 3 ')).toBe(3);
    expect(parseQuantity('500')).toBe(99);
    expect(parseQuantity('2d4')).toBe('2d4');
    expect(parseQuantity('1d6+2')).toBe('1d6+2');
    expect(parseQuantity('d%')).toBeNull(); // up to 100, past the most one encounter takes
    for (const text of ['', 'two', '-1', '2.5', '4d6kh3', '2d6!', '3dF', '1d4*10', '1d4-4']) {
      expect(parseQuantity(text), text).toBeNull();
    }
    expect(readDiceQuantity('12')).toBeNull();
  });

  it('spans and rolls dice, never below none', () => {
    expect(quantityRange('2d4+1')).toEqual({ min: 3, max: 9 });
    expect(quantityRange('1d6-2')).toEqual({ min: 0, max: 4 });
    expect(quantityRange(4)).toEqual({ min: 4, max: 4 });
    expect(rollQuantity('2d4', () => 0)).toBe(2);
    expect(rollQuantity('2d4', () => 0.999)).toBe(8);
    expect(rollQuantity('1d6-2', () => 0)).toBe(0);
  });

  it('steps a number by one and dice by one die', () => {
    expect(stepQuantity(3, 1)).toBe(4);
    expect(stepQuantity(0, -1)).toBe(0);
    expect(stepQuantity(99, 1)).toBe(99);
    expect(stepQuantity('2d4+1', 1)).toBe('3d4+1');
    expect(stepQuantity('d6', 1)).toBe('2d6');
    expect(stepQuantity('1d4[pack d6]', 1)).toBe('2d4[pack d6]');
    expect(stepQuantity('1d8', -1)).toBe(0);
    expect(stepQuantity('12d8', 1)).toBe('12d8'); // 13d8 could bring more than 99
  });

  it('reads stored references, a hand-edited number as one copy, and rolls them per spawn', () => {
    expect(refQuantity({ quantity: '1d4' })).toBe('1d4');
    expect(refQuantity({ quantity: 1e9 })).toBe(1);
    expect(refQuantity({})).toBe(1);
    expect(refsRange([{}, { quantity: '1d4' }])).toEqual({ min: 2, max: 5 });
    const refs: { id: string; quantity?: string }[] = [{ id: 'goblin', quantity: '1d4+1' }, { id: 'ogre' }];
    expect(rolledRefs(refs, () => 0.999).map((ref) => ref.id)).toEqual(['goblin', 'goblin', 'goblin', 'goblin', 'goblin', 'ogre']);
  });
});
