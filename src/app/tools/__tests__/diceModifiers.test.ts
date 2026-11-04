import { describe, expect, it } from 'vitest';
import { getDiceCrit } from '../diceCrit';
import { MAX_EXPLOSIONS } from '../diceExplosion';
import type { RolledDie } from '../diceFormula';
import type { DiceRules } from '../../types/diceRulesTypes';
import { rollTestFormula as rollFormula } from './rollTestFormula';

/** A random source that makes dice of `sides` show `faces`, one after the other. */
function showing(sides: number, ...faces: number[]): () => number {
  let i = 0;
  return (): number => (faces[i++ % faces.length]! - 0.5) / sides;
}

/** A random source that makes Fate dice show `faces` (−1, 0 or +1), one after the other. */
const fate = (...faces: number[]): (() => number) => showing(3, ...faces.map((face) => face + 2));

/** Each die as its value with its marks, for short expectations. */
const shown = (rolls: readonly RolledDie[]): string[] => rolls.map((die) =>
  `${die.value}${die.rerolled ? 'r' : ''}${die.dropped ? 'd' : ''}${die.exploded ? '!' : ''}${die.success ? 's' : ''}${die.failure ? 'f' : ''}`);

const D20: DiceRules = { defaultRoll: '1d20', crit: 'natural' };

describe('keep and drop', () => {
  it('keeps the highest dice and leaves the others out of the total', () => {
    const result = rollFormula('4d6kh3', showing(6, 3, 1, 6, 4));
    expect(shown(result.rolls)).toEqual(['3', '1d', '6', '4']);
    expect(result.total).toBe(13);
    expect(result).toMatchObject({ modifiers: 0, linear: true });
  });

  it('drops the lowest by default, and keeps or drops either end', () => {
    expect(rollFormula('4d6d', showing(6, 3, 1, 6, 4)).total).toBe(13);
    expect(rollFormula('4d6dh1', showing(6, 3, 1, 6, 4)).total).toBe(8);
    expect(rollFormula('4d6kl2', showing(6, 3, 1, 6, 4)).total).toBe(4);
    expect(rollFormula('2d20kh1+5', showing(20, 7, 15)).total).toBe(20);
  });

  it('keeps the earlier of equal dice', () => {
    expect(shown(rollFormula('2d20kh1', showing(20, 15, 15)).rolls)).toEqual(['15', '15d']);
    expect(shown(rollFormula('3d6dl1', showing(6, 2, 2, 5)).rolls)).toEqual(['2d', '2', '5']);
  });

  it('ranks the dice an explosion added like any other', () => {
    const result = rollFormula('2d6xkh1', showing(6, 6, 5, 3));
    expect(shown(result.rolls)).toEqual(['6', '5d!', '3d']);
    expect(result.total).toBe(6);
  });

  it('lets only kept default dice decide a critical', () => {
    expect(getDiceCrit(rollFormula('2d20kh1', showing(20, 3, 20)).rolls, D20)).toBe('high');
    expect(getDiceCrit(rollFormula('2d20kh1', showing(20, 20, 3)).rolls, D20)).toBe('high');
    expect(getDiceCrit(rollFormula('2d20kl1', showing(20, 20, 3)).rolls, D20)).toBeNull();
    expect(getDiceCrit(rollFormula('2d20kl1', showing(20, 1, 20)).rolls, D20)).toBe('low');
  });
});

describe('rerolls', () => {
  it('rolls a die again once, and the new die stands even when it matches', () => {
    const result = rollFormula('2d6r1', showing(6, 1, 1, 5));
    expect(shown(result.rolls)).toEqual(['1r', '1', '5']);
    expect(result.total).toBe(6);
  });

  it('reads ro as r, and rolls again with rr until the die no longer matches', () => {
    expect(shown(rollFormula('1d6ro<3', showing(6, 2, 1)).rolls)).toEqual(['2r', '1']);
    expect(shown(rollFormula('1d6rr<3', showing(6, 2, 1, 4)).rolls)).toEqual(['2r', '1r', '4']);
  });

  it('rolls again at most MAX_EXPLOSIONS times', () => {
    const result = rollFormula('1d6rr1', showing(6, 1));
    expect(result.rolls).toHaveLength(MAX_EXPLOSIONS + 1);
    expect(result.rolls.filter((die) => die.rerolled)).toHaveLength(MAX_EXPLOSIONS);
    expect(result.total).toBe(1);
  });

  it('rolls again before keeping, and a rerolled die never counts for a critical', () => {
    const result = rollFormula('4d6r1kh3', showing(6, 1, 2, 3, 4, 5));
    expect(shown(result.rolls)).toEqual(['1r', '2d', '3', '4', '5']);
    expect(result.total).toBe(12);
    expect(getDiceCrit(rollFormula('1d20r1', showing(20, 1, 12)).rolls, D20)).toBeNull();
  });
});

describe("Foundry's explosions", () => {
  it('explodes again and again with x, once with xo', () => {
    expect(rollFormula('1d6x', showing(6, 6, 6, 2)).total).toBe(14);
    expect(shown(rollFormula('1d6xo', showing(6, 6, 6)).rolls)).toEqual(['6', '6!']);
  });

  it('explodes from a face up with x>= and x>', () => {
    expect(shown(rollFormula('1d6x>=5', showing(6, 5, 6, 1)).rolls)).toEqual(['5', '6!', '1!']);
    expect(shown(rollFormula('1d6x>4', showing(6, 5, 2)).rolls)).toEqual(['5', '2!']);
  });

  it('keeps Dice Roller notation as it was', () => {
    expect(rollFormula('1d6!', showing(6, 6, 6)).rolls).toHaveLength(2);
    expect(rollFormula('1d6!i', showing(6, 6)).rolls).toHaveLength(1 + MAX_EXPLOSIONS);
  });
});

describe('counting dice', () => {
  it('counts successes, each die an explosion added included', () => {
    const result = rollFormula('4d10x>=10cs>=8', showing(10, 10, 9, 3, 8, 1));
    expect(shown(result.rolls)).toEqual(['10s', '9!s', '3', '8s', '1']);
    expect(result.total).toBe(3);
    expect(result).toMatchObject({ modifiers: 0, linear: false });
  });

  it('counts with bare >= and every comparison', () => {
    expect(rollFormula('5d10>=8', showing(10, 8, 7, 10, 1, 9)).total).toBe(3);
    expect(rollFormula('5d10cs>7', showing(10, 8, 7, 10, 1, 9)).total).toBe(3);
    expect(rollFormula('5d10cs=10', showing(10, 8, 7, 10, 1, 9)).total).toBe(1);
    expect(rollFormula('5d10cs<2', showing(10, 8, 7, 10, 1, 9)).total).toBe(1);
  });

  it('counts failures with cf and bare <=', () => {
    const result = rollFormula('4d6<=2', showing(6, 1, 2, 5, 6));
    expect(shown(result.rolls)).toEqual(['1f', '2f', '5', '6']);
    expect(result.total).toBe(2);
    expect(rollFormula('4d6cf<2', showing(6, 1, 2, 5, 6)).total).toBe(1);
  });

  it('counts only the dice that were kept, and adds counts like numbers', () => {
    expect(rollFormula('4d6kh2>=5', showing(6, 6, 5, 5, 1)).total).toBe(2);
    expect(rollFormula('3d6>=5+1', showing(6, 6, 5, 1)).total).toBe(3);
    expect(rollFormula('-3d6>=5', showing(6, 6, 5, 1)).total).toBe(-2);
  });
});

describe('arithmetic', () => {
  it('multiplies and divides before it adds, and follows parentheses', () => {
    expect(rollFormula('2+3*4').total).toBe(14);
    expect(rollFormula('(2+3)*4').total).toBe(20);
    expect(rollFormula('20-2*3-4').total).toBe(10);
    expect(rollFormula('-(2+3)*2').total).toBe(-10);
    expect(rollFormula('2*(1d6+1)', showing(6, 4)).total).toBe(10);
  });

  it('keeps fractions until the end and cuts the total towards zero', () => {
    expect(rollFormula('7/2').total).toBe(3);
    expect(rollFormula('-7/2').total).toBe(-3);
    expect(rollFormula('7/3*3').total).toBe(7);
    expect(rollFormula('1d6/2', showing(6, 5)).total).toBe(2);
    expect(rollFormula('1/3+1/3+1/3').total).toBe(1);
  });

  it('makes a quotient 0 when its divisor comes out 0', () => {
    expect(rollFormula('10/(1d4-1d4)', showing(4, 3, 3)).total).toBe(0);
  });

  it('keeps the modifier of a plain sum, and none for a formula that is no sum', () => {
    expect(rollFormula('1d20+5-2', showing(20, 10))).toMatchObject({ modifiers: 3, total: 13, linear: true });
    expect(rollFormula('-(1d6+2)', showing(6, 4))).toMatchObject({ modifiers: -2, total: -6, linear: true });
    expect(rollFormula('1d6*2+3', showing(6, 4))).toMatchObject({ modifiers: 0, total: 11, linear: false });
  });
});

describe('dice kinds and labels', () => {
  it('rolls Fate dice with faces −1, 0 and +1', () => {
    const result = rollFormula('4dF', fate(-1, 0, 1, 1));
    expect(result.rolls[0]).toEqual({ die: 'dF', value: -1, max: 1, min: -1 });
    expect(result.rolls.map((die) => die.value)).toEqual([-1, 0, 1, 1]);
    expect(result.total).toBe(1);
    expect(rollFormula('2-2dF', fate(1, 1)).total).toBe(0);
  });

  it('keeps and counts Fate dice', () => {
    expect(rollFormula('4dFkh2', fate(-1, 1, 0, 1)).total).toBe(2);
    expect(rollFormula('4dF>=1', fate(-1, 1, 0, 1)).total).toBe(2);
  });

  it('rolls d% as a d100', () => {
    expect(rollFormula('d%', showing(100, 42)).rolls).toEqual([{ die: 'd100', value: 42, max: 100 }]);
  });

  it('labels every die of a labelled term, explosions included', () => {
    const result = rollFormula('1d6x[fire]+1d4+2[bonus]', showing(6, 6, 2, 3));
    expect(result.rolls.map((die) => die.label)).toEqual(['fire', 'fire', undefined]);
    expect(result.modifiers).toBe(2);
  });

  it('still lets the collection rule count a default die that explodes by its own notation', () => {
    const rules = { defaultRoll: '1d10', explode: { dice: 'default' as const, repeats: false, highFaces: 1, lowFaces: 0 } };
    expect(rollFormula('1d10!0+1d10', showing(10, 10, 10, 10), rules).rolls).toHaveLength(2);
  });
});
