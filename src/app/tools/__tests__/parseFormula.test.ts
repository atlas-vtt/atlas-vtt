import { describe, expect, it } from 'vitest';
import { FORMULA_LIMITS, parseFormula, type DiceTerm, type ParsedFormula } from '../parseFormula';
import { MAX_EXPLOSIONS } from '../diceExplosion';

function parsed(formula: string): ParsedFormula {
  const result = parseFormula(formula);
  if (!result.ok) throw new Error(`${formula}: ${result.code}`);
  return result;
}

/** The first dice term of `formula`. */
function dice(formula: string): DiceTerm {
  const term = parsed(formula).terms.find((entry): entry is DiceTerm => entry.kind === 'dice');
  if (!term) throw new Error(`${formula} rolls no dice`);
  return term;
}

describe('parseFormula', () => {
  it.each([
    'd20', '+3', '-2D6 + 9999', '0d2', '100d1000', '50d6+50d8', 'd6!!i', 'd6!99', 'd6!0', ' \td20\t ', Array(20).fill('1').join('+'),
    `d20${' '.repeat(97)}`, 'd20*2', '(d20)', 'd%', '4dF', 'dF', '2d6*(1d4+2)/3', '((((((((1d6))))))))', '-(1d6+2)',
    '4d6kh3', '4d6k', '4d6kl1', '4d6d1', '4d6dl', '4d6dh2', '2d20kh1+5', '4d6r1kh3', '4d6ro<2', '4d6rr1', '2d10r>=9',
    '8d10x>=10cs>=8', '3d6x', '3d6xo', '3d6x>5', '5d10>=8', '5d10<=2', '5d10cf<3', '6d6cs=6', '2d6[fire]', '3[bonus]', "1d8[Sneak Attack]+1d6[it's cold]",
  ])('accepts bounded formula %j', (formula) => {
    expect(parseFormula(formula).ok).toBe(true);
  });

  it.each([
    '', ' ', 'hello d20', 'd20 hello', 'd20+garbage+d6', 'd20 d6', 'd20++2', 'd20-', 'd20\n', 'd20\r', 'd20 ', '1.5d6', 'd6!!!', 'd6!100',
    'd6!I', '10000', '00001', '0001d6', 'd00006', 'Infinity', '()', '(d20', 'd20)', '2*-3', 'd20*', '4d6 kh3', '2d6 [fire]', '4d6>3', '4d6<3',
    '4d6=3', '4d6cs', '4d6kh3r1', '4d6kh1kh1', '4d6!x', '4d6x6', '2d6[]', '2d6[fire!]', `2d6[${'a'.repeat(25)}]`, '1d6/0', '1d6/(0)', '4d6KH3',
    '(1d6)[fire]', 'd20 / 0',
  ])('rejects malformed formula %j', (formula) => {
    expect(parseFormula(formula)).toEqual({ ok: false, code: 'syntax' });
  });

  it.each([
    [`d20${' '.repeat(98)}`, 'length'],
    [Array(21).fill('1').join('+'), 'terms'],
    ['101d6', 'dice'],
    ['50d6-51d8', 'dice'],
    ['d1001', 'faces'],
    ['d1+2', 'faces'],
    ['d0', 'faces'],
    ['(((((((((1d6)))))))))', 'depth'],
    ['2d6kh3', 'modifier'],
    ['2d6d3', 'modifier'],
    ['2d6kh0', 'modifier'],
    ['0d6kh1', 'modifier'],
    ['d6x>=1', 'modifier'],
    ['d6x>0', 'modifier'],
    ['d6r<7', 'modifier'],
    ['d6rr>=1', 'modifier'],
    ['4dF!', 'modifier'],
    ['4dFr1', 'modifier'],
    ['100d1000*9999', 'total'],
    ['1d6/(1/9999)*9999*9999', 'total'],
  ])('rejects %j with %s', (formula, code) => {
    expect(parseFormula(formula)).toEqual({ ok: false, code });
  });

  it('reads d% as a d100 and dF as Fate dice', () => {
    expect(dice('d%')).toMatchObject({ count: 1, faces: 100 });
    expect(dice('4dF')).toMatchObject({ count: 4, faces: 1, fate: true });
  });

  it('reads keep and drop with their defaults', () => {
    expect(dice('4d6k').keep).toEqual({ mode: 'keep', end: 'highest', count: 1 });
    expect(dice('4d6kh3').keep).toEqual({ mode: 'keep', end: 'highest', count: 3 });
    expect(dice('4d6kl2').keep).toEqual({ mode: 'keep', end: 'lowest', count: 2 });
    expect(dice('4d6d').keep).toEqual({ mode: 'drop', end: 'lowest', count: 1 });
    expect(dice('4d6dh2').keep).toEqual({ mode: 'drop', end: 'highest', count: 2 });
  });

  it('reads rerolls: once, or again and again', () => {
    expect(dice('2d6r').reroll).toEqual({ when: { operator: '=', value: 1 }, limit: 1 });
    expect(dice('2d6r2').reroll).toEqual({ when: { operator: '=', value: 2 }, limit: 1 });
    expect(dice('2d6ro<=2').reroll).toEqual({ when: { operator: '<=', value: 2 }, limit: 1 });
    expect(dice('2d6rr<3').reroll).toEqual({ when: { operator: '<', value: 3 }, limit: MAX_EXPLOSIONS });
  });

  it("reads Foundry's explosions next to Dice Roller's", () => {
    expect(dice('3d6!').explode).toEqual({ highFaces: 1, lowFaces: 0, limit: 1 });
    expect(dice('3d6x').explode).toEqual({ highFaces: 1, lowFaces: 0, limit: MAX_EXPLOSIONS });
    expect(dice('3d6xo').explode).toEqual({ highFaces: 1, lowFaces: 0, limit: 1 });
    expect(dice('3d10x>=9').explode).toEqual({ highFaces: 2, lowFaces: 0, limit: MAX_EXPLOSIONS });
    expect(dice('3d10xo>8').explode).toEqual({ highFaces: 2, lowFaces: 0, limit: 1 });
  });

  it('reads counting: bare >= counts successes, bare <= failures', () => {
    expect(dice('5d10cs>=8').tally).toEqual({ counts: 'successes', when: { operator: '>=', value: 8 } });
    expect(dice('5d10>=8').tally).toEqual({ counts: 'successes', when: { operator: '>=', value: 8 } });
    expect(dice('5d10cf<2').tally).toEqual({ counts: 'failures', when: { operator: '<', value: 2 } });
    expect(dice('5d10<=2').tally).toEqual({ counts: 'failures', when: { operator: '<=', value: 2 } });
  });

  it('reads labels on dice and constants', () => {
    expect(dice('2d6x[fire]')).toMatchObject({ label: 'fire' });
    expect(parsed('1d20+3[bonus]').terms[1]).toEqual({ kind: 'constant', value: 3, negative: false, label: 'bonus' });
  });

  it('marks every term an odd number of minus signs leads to', () => {
    const negatives = (formula: string): boolean[] => parsed(formula).terms.map((term) => term.negative);
    expect(negatives('-2D6 + 9999')).toEqual([true, false]);
    expect(negatives('2d6-1d4-(1d8-3)')).toEqual([false, true, true, false]);
    expect(negatives('2*(1d6-1d4)')).toEqual([false, false, true]);
  });

  it('tells a plain sum from a formula that multiplies, divides or counts', () => {
    expect(parsed('2d20kh1+5-1d4').linear).toBe(true);
    expect(parsed('-(1d6+2)').linear).toBe(true);
    expect(parsed('2d6*2').linear).toBe(false);
    expect(parsed('2d6/2').linear).toBe(false);
    expect(parsed('5d10>=8+1').linear).toBe(false);
  });

  it('keeps the limits it promises', () => {
    expect(FORMULA_LIMITS).toMatchObject({ characters: 100, terms: 20, dice: 100, faces: 1000, depth: 8 });
  });
});
