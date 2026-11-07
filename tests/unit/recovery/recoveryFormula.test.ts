import { describe, expect, it } from 'vitest';
import { computeFormula, fillFormula, readableFormula, type FormulaFill } from '../../../src/app/recovery/recoveryFormula';
import { wholeNumber } from '../../../src/app/statblocks/values/references';
import { spendFormula } from '../../../src/app/recovery/spendFormula';

const NOTE: Record<string, unknown> = { level: 3, tier: '2', con: -1, big: 12000, many: 1200, half: 2.5, name: 'Mira', abilities: { con: 2 }, 'hit-dice': 4, 'con-mod': 1, stats: [{ 'max-hp': 9 }] };
const lookup = (path: string): unknown => path.split('.').reduce<unknown>((value, part) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined), NOTE);

function filled(formula: string): string {
  const result = fillFormula(formula, lookup);
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.problem)}`);
  return result.formula;
}

const problem = (result: FormulaFill): unknown => (result.ok ? null : result.problem);

describe('fillFormula', () => {
  it('puts numbers in parentheses, so negatives parse', () => {
    expect(filled('1d8+@con')).toBe('1d8+(-1)');
    expect(filled('1d4+@tier')).toBe('1d4+(2)');
    expect(filled('@abilities.con')).toBe('(2)');
  });

  it('writes a number bare where it stands as a dice count, with or without a space', () => {
    expect(filled('@level d6')).toBe('3d6');
    expect(filled('@leveld6')).toBe('3d6');
    expect(filled('@leveld6+@con')).toBe('3d6+(-1)');
    expect(filled('@level dF')).toBe('3dF');
    expect(filled('@leveld%')).toBe('3d%');
  });

  it('reads keys with dashes, as field keys may have them', () => {
    expect(filled('@hit-dice d8')).toBe('4d8');
    expect(filled('@hit-diced8')).toBe('4d8');
    expect(filled('1d4+@con-mod')).toBe('1d4+(1)');
    expect(filled('@stats.0.max-hp')).toBe('(9)');
  });

  it('reads a dash after a key as a minus where the note holds no key with it', () => {
    expect(filled('1d8+@con-1')).toBe('1d8+(-1)-1');
    expect(filled('@level-1d6')).toBe('(3)-1d6');
    expect(filled('@level - 1')).toBe('(3) - 1');
    expect(filled('(@level)-1')).toBe('((3))-1');
    // A key never ends in a dash
    expect(filled('@level-(1)')).toBe('(3)-(1)');
    expect(problem(fillFormula('1d8+@wis-1', lookup))).toEqual({ kind: 'missing', field: 'wis-1' });
  });

  it('takes the whole path for a lookup that holds every field, as the editor checks a formula', () => {
    const check = fillFormula('@hit-dice-1 d8+@con', () => 1);
    expect(check.ok && check.formula).toBe('1d8+(1)');
  });

  it('reads nothing inside a label', () => {
    expect(fillFormula('1d6[@level]', lookup).ok).toBe(false);
    expect(filled('1d6[fire]+@level')).toBe('1d6[fire]+(3)');
  });

  it('names a field the note does not hold, or holds no whole number in', () => {
    expect(problem(fillFormula('1d8+@wis', lookup))).toEqual({ kind: 'missing', field: 'wis' });
    expect(problem(fillFormula('1d8+@half', lookup))).toEqual({ kind: 'not-whole', field: 'half' });
    expect(problem(fillFormula('1d8+@name', lookup))).toEqual({ kind: 'not-whole', field: 'name' });
  });

  it('checks the limits again once the numbers are in, naming the field', () => {
    expect(problem(fillFormula('1d8+@big', lookup))).toEqual({ kind: 'limits', field: 'big' });
    expect(problem(fillFormula('@many d6', lookup))).toEqual({ kind: 'limits', field: 'many' });
    expect(problem(fillFormula('@con d6', lookup))).toEqual({ kind: 'limits', field: 'con' });
    expect(problem(fillFormula('@level d1000*@level d1000*@level d1000', lookup))).toEqual({ kind: 'limits', field: 'level' });
  });

  it('refuses a formula that does not read', () => {
    expect(problem(fillFormula('1d8++@level', lookup))).toEqual({ kind: 'syntax' });
  });

  it('tells a formula with dice from one without', () => {
    const rolled = fillFormula('1d4+@tier', lookup);
    const plain = fillFormula('@level*2', lookup);
    expect(rolled.ok && rolled.dice).toBe(true);
    expect(plain.ok && plain.dice).toBe(false);
  });
});

describe('computeFormula', () => {
  it('works a formula without dice out instead of rolling it', () => {
    const plain = fillFormula('@level', lookup);
    expect(plain.ok && computeFormula(plain.parsed)).toBe(3);
    const negative = fillFormula('@con-2', lookup);
    expect(negative.ok && computeFormula(negative.parsed)).toBe(-3);
    const divided = fillFormula('(@level+@tier)/2', lookup);
    expect(divided.ok && computeFormula(divided.parsed)).toBe(2);
  });
});

describe('wholeNumber', () => {
  it('reads whole numbers and texts that write one', () => {
    expect(wholeNumber(4)).toBe(4);
    expect(wholeNumber('+2')).toBe(2);
    expect(wholeNumber(' -1 ')).toBe(-1);
    expect(wholeNumber(2.5)).toBeUndefined();
    expect(wholeNumber('2d6')).toBeUndefined();
    expect(wholeNumber(true)).toBeUndefined();
  });
});

describe('spendFormula', () => {
  const unit = (formula: string) => {
    const result = fillFormula(formula, lookup);
    if (!result.ok) throw new Error('unit refused');
    return result;
  };
  const spent = (formula: string, units: number): string | null => {
    const result = spendFormula(unit(formula), units);
    return result.ok ? result.formula : null;
  };

  it('rolls several units as one formula', () => {
    expect(spent('1d8+@abilities.con', 3)).toBe('3d8+6');
    expect(spent('1d8+@con', 3)).toBe('3d8-3');
    expect(spent('d6x+1[rest]', 2)).toBe('2d6x+2[rest]');
    expect(spent('1d8+@con', 1)).toBe('1d8+(-1)');
  });

  it('writes a unit out once per unit where its dice cannot simply be multiplied', () => {
    expect(spent('4d6kh3', 2)).toBe('(4d6kh3)+(4d6kh3)');
    expect(spent('1d6*2', 2)).toBe('(1d6*2)+(1d6*2)');
  });

  it('multiplies a unit without dice', () => {
    expect(spent('@level', 4)).toBe('4*((3))');
  });

  it('refuses units that do not fit one roll', () => {
    expect(spendFormula(unit('1d8'), 101)).toEqual({ ok: false, problem: { kind: 'limits', field: null } });
    expect(spendFormula(unit('4d6kh3'), 30)).toEqual({ ok: false, problem: { kind: 'limits', field: null } });
  });
});

describe('readableFormula', () => {
  it('drops the parentheses a number was put in where its sign can stand alone', () => {
    expect(readableFormula('1d8+(-1)')).toBe('1d8-1');
    expect(readableFormula('1d8+(2)')).toBe('1d8+2');
    expect(readableFormula('1d8-(-2)')).toBe('1d8+2');
    expect(readableFormula('(3)')).toBe('3');
    expect(readableFormula('2*(3)')).toBe('2*(3)');
  });
});
