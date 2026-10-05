import { describe, expect, it } from 'vitest';
import { MAX_EXPLOSIONS, explodes, rollExplosions, type Explosion } from '../diceExplosion';
import type { RolledDie } from '../diceFormula';
import { rollTestFormula as rollFormula } from './rollTestFormula';
import { getDiceCrit } from '../diceCrit';
import type { DiceRules, ExplodeRule } from '../../types/diceRulesTypes';

/** A random source that makes dice of `sides` show `faces`, one after the other. */
function showing(sides: number, ...faces: number[]): () => number {
  let i = 0;
  return (): number => (faces[i++ % faces.length]! - 0.5) / sides;
}

const d = (sides: number, value: number, more: Partial<RolledDie> = {}): RolledDie =>
  ({ die: `d${sides}`, value, max: sides, ...more });

const AGAIN_AND_AGAIN: Explosion = { highFaces: 1, lowFaces: 0, limit: MAX_EXPLOSIONS };
const ONCE_BOTH_WAYS: Explosion = { highFaces: 1, lowFaces: 1, limit: 1 };

describe('rollExplosions', () => {
  it('rolls nothing for a die that shows no exploding face', () => {
    expect(rollExplosions(d(6, 5), AGAIN_AND_AGAIN, showing(6, 6))).toEqual([]);
  });

  it('rolls again for as long as the highest face comes up', () => {
    expect(rollExplosions(d(6, 6), AGAIN_AND_AGAIN, showing(6, 6, 6, 2))).toEqual([
      d(6, 6, { exploded: true }), d(6, 6, { exploded: true }), d(6, 2, { exploded: true }),
    ]);
  });

  it('stops at its limit, and never rolls more than the cap', () => {
    expect(rollExplosions(d(10, 10), ONCE_BOTH_WAYS, showing(10, 10))).toHaveLength(1);
    expect(rollExplosions(d(4, 4), AGAIN_AND_AGAIN, showing(4, 4))).toHaveLength(MAX_EXPLOSIONS);
  });

  it('rolls again and subtracts on a low face', () => {
    expect(rollExplosions(d(10, 1), ONCE_BOTH_WAYS, showing(10, 7))).toEqual([d(10, 7, { exploded: true, negative: true })]);
  });

  it('keeps a chain going downwards on high faces only', () => {
    const repeating: Explosion = { highFaces: 1, lowFaces: 1, limit: MAX_EXPLOSIONS };
    expect(rollExplosions(d(10, 1), repeating, showing(10, 10, 1, 4)).map((die) => [die.value, die.negative])).toEqual([[10, true], [1, true]]);
  });

  it('turns the sign of a subtracted die around', () => {
    const subtracted = d(6, 6, { negative: true });
    expect(rollExplosions(subtracted, AGAIN_AND_AGAIN, showing(6, 3))).toEqual([d(6, 3, { exploded: true, negative: true })]);
    expect(rollExplosions(d(6, 1, { negative: true }), ONCE_BOTH_WAYS, showing(6, 3))).toEqual([d(6, 3, { exploded: true })]);
  });

  it('counts several high and low faces, but always leaves a face that does not explode', () => {
    expect(rollExplosions(d(10, 9), { highFaces: 2, lowFaces: 0, limit: 1 }, showing(10, 3))).toHaveLength(1);
    expect(rollExplosions(d(10, 8), { highFaces: 2, lowFaces: 0, limit: 1 }, showing(10, 3))).toHaveLength(0);
    // A d2 with "two high faces" explodes on its 2 only, and has no face left for a low explosion.
    expect(rollExplosions(d(2, 1), { highFaces: 2, lowFaces: 1, limit: 1 }, showing(2, 2))).toHaveLength(0);
    expect(rollExplosions(d(2, 2), { highFaces: 2, lowFaces: 1, limit: 1 }, showing(2, 1))).toHaveLength(1);
  });

  it('tells which dice of a roll exploded', () => {
    const rolls = [d(6, 6), d(6, 2, { exploded: true }), d(6, 4)];
    expect(rolls.map((_, i) => explodes(rolls, i))).toEqual([true, false, false]);
  });
});

describe('rollFormula with exploding dice', () => {
  const rule = (explode: Partial<ExplodeRule>, defaultRoll = '1d20'): Pick<DiceRules, 'defaultRoll' | 'explode'> =>
    ({ defaultRoll, explode: { dice: 'all', repeats: true, highFaces: 1, lowFaces: 0, ...explode } });

  it('does not explode without a rule or notation', () => {
    expect(rollFormula('2d6', showing(6, 6)).rolls).toHaveLength(2);
  });

  it('explodes every die under an all-dice rule and adds the extra dice', () => {
    const result = rollFormula('1d8+1d6+2', showing(8, 8, 3, 6, 6), rule({}));
    // d8: 8, then 3. d6: 6 (the random source above is read per die size), then more.
    expect(result.rolls[0]).toEqual(d(8, 8));
    expect(result.rolls[1]).toEqual(d(8, 3, { exploded: true }));
    expect(result.total).toBe(result.rolls.reduce((sum, die) => sum + die.value, 0) + 2);
  });

  it('explodes only the default dice under a default-dice rule', () => {
    const result = rollFormula('1d10+2d6+4', showing(10, 10, 7, 10, 10), rule({ dice: 'default', repeats: false, lowFaces: 1 }, '1d10'));
    expect(result.rolls.map((die) => [die.die, die.exploded ?? false])).toEqual([
      ['d10', false], ['d10', true], ['d6', false], ['d6', false],
    ]);
  });

  it('subtracts the extra die of a low explosion', () => {
    const result = rollFormula('1d10+4', showing(10, 1, 7), rule({ dice: 'default', repeats: false, lowFaces: 1 }, '1d10'));
    expect(result.rolls).toEqual([d(10, 1), d(10, 7, { exploded: true, negative: true })]);
    expect(result.total).toBe(1 - 7 + 4);
  });

  it('reads the exploding notation of a term: once, a number of times, again and again', () => {
    expect(rollFormula('1d6!', showing(6, 6)).rolls).toHaveLength(2);
    expect(rollFormula('1d6!!', showing(6, 6)).rolls).toHaveLength(2);
    expect(rollFormula('1d6!3', showing(6, 6)).rolls).toHaveLength(4);
    expect(rollFormula('1d6!i', showing(6, 6)).rolls).toHaveLength(1 + MAX_EXPLOSIONS);
    expect(rollFormula('2d6! + 1d4', showing(6, 6, 2, 3, 4)).rolls.map((die) => die.exploded ?? false)).toEqual([false, true, false, false]);
  });

  it('bounds numeric explosions even at the maximum dice count', () => {
    const result = rollFormula('100d6!99', () => 0.999);
    expect(result.rolls).toHaveLength(100 * (1 + MAX_EXPLOSIONS));
    expect(rollFormula('d6!0', () => 0.999).rolls).toHaveLength(1);
  });

  it('lets the notation of a term win over the rule', () => {
    const result = rollFormula('1d6!', showing(6, 6), rule({}));
    expect(result.rolls).toHaveLength(2);
  });
});

describe('criticals of exploded rolls', () => {
  it('judges the original dice only', () => {
    const rules: DiceRules = { defaultRoll: '1d10', crit: 'natural' };
    expect(getDiceCrit([d(10, 10), d(10, 1, { exploded: true })], rules)).toBe('high');
    expect(getDiceCrit([d(10, 5), d(10, 10, { exploded: true })], rules)).toBeNull();
    // Two default dice: the second original die counts, not the extra die between them.
    expect(getDiceCrit([d(12, 12), d(12, 3, { exploded: true }), d(12, 12)], { defaultRoll: '2d12', crit: 'doubles' })).toBe('high');
  });
});
