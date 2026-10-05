import { describe, expect, it } from 'vitest';
import { parseFormula } from '../parseFormula';

describe('parseFormula', () => {
  it.each(['d20', '+3', '-2D6 + 9999', '0d2', '100d1000', '50d6+50d8', 'd6!!i', 'd6!99', 'd6!0', ' \td20\t ', Array(10).fill('1').join('+'), `d20${' '.repeat(61)}`])('accepts bounded formula %j', (formula) => {
    expect(parseFormula(formula).ok).toBe(true);
  });

  it.each(['', ' ', 'hello d20', 'd20 hello', 'd20+garbage+d6', 'd20 d6', 'd20++2', 'd20-', 'd20\n', 'd20\r', 'd20\u00a0', '1.5d6', 'd6!!!', 'd6!100', 'd6!I', '10000', '00001', '0001d6', 'd00006', 'd20*2', '(d20)', 'Infinity'])('rejects malformed formula %j', (formula) => {
    expect(parseFormula(formula)).toEqual({ ok: false, code: 'syntax' });
  });

  it.each([
    [`d20${' '.repeat(62)}`, 'length'],
    [Array(11).fill('1').join('+'), 'terms'],
    ['101d6', 'dice'],
    ['50d6-51d8', 'dice'],
    ['d1001', 'faces'],
    ['d1+2', 'faces'],
    ['d0', 'faces'],
  ])('rejects cap violation %j', (formula, code) => {
    expect(parseFormula(formula)).toEqual({ ok: false, code });
  });
});
