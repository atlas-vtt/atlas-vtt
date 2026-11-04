import { isExpressionError, type ExpressionError } from '../../../../src/app/statblocks/expressions/errors';
import { evaluateFormula, type FormulaContext, type FormulaResult } from '../../../../src/app/statblocks/expressions/evaluate';
import { formulaText } from '../../../../src/app/statblocks/expressions/formulaText';
import type { FormulaNode } from '../../../../src/app/statblocks/expressions/formulaTypes';
import { parseFormula } from '../../../../src/app/statblocks/expressions/parse';
import { tokenizeFormula } from '../../../../src/app/statblocks/expressions/tokenize';
import type { FieldValue } from '../../../../src/app/statblocks/model/templateTypes';
import type { ValueReader } from '../../../../src/app/statblocks/values/fieldValues';
import { pick, randomInt, randomString, seededRandom } from './seededRandom';

const VALUES: Record<string, FieldValue> = {
  hp: 22,
  initiative: '+3',
  minus: '−2',
  speed: '30 ft.',
  blank: '',
  nothing: null,
  stats: [10, 14, 12, 8, 13, 9],
  flag: true,
};

const reader: ValueReader = (ref) => {
  if (ref === 'stats.1') return 14;
  return VALUES[ref];
};

const LABELS: Record<string, string> = { speed: 'Speed', blank: 'Languages', 'stats.1': 'Dex' };
const labelOf = (ref: string): string | undefined => LABELS[ref];

function parsed(source: string): FormulaNode {
  const node = parseFormula(source);
  if (isExpressionError(node)) throw new Error(`${source}: ${node.message}`);
  return node;
}

function run(source: string, context?: FormulaContext): FormulaResult {
  return evaluateFormula(parsed(source), reader, context);
}

function valueOf(source: string, context?: FormulaContext): number {
  const result = run(source, context);
  if (!result.ok) throw new Error(`${source}: ${result.error.message}`);
  return result.value;
}

function errorOf(source: string, context?: FormulaContext): ExpressionError {
  const result = run(source, context);
  if (result.ok) throw new Error(`${source} has a value: ${result.value}`);
  return result.error;
}

function syntaxOf(source: string, offset?: number): ExpressionError {
  const result = parseFormula(source, offset);
  if (!isExpressionError(result)) throw new Error(`${source} parsed`);
  return result;
}

describe('tokenizeFormula', () => {
  it('reads numbers, dotted refs, operators and brackets with their offsets', () => {
    const tokens = tokenizeFormula('floor((stats.1 - 10) / 2)');
    expect(Array.isArray(tokens) && tokens.map((token) => token.type)).toEqual([
      'name', 'open', 'open', 'name', 'op', 'number', 'close', 'op', 'number', 'close', 'end',
    ]);
    expect(Array.isArray(tokens) && tokens[3]).toEqual({ type: 'name', name: 'stats.1', at: 7 });
  });

  it('reads the typographic minus, times and division signs', () => {
    expect(valueOf('7 − 2 × 3 ÷ 2')).toBe(4);
  });

  it('refuses characters that are no part of the language, at their offset', () => {
    expect(tokenizeFormula('hp # 2', 10)).toEqual({ kind: 'syntax', message: '“#” can\'t be used in a formula.', at: 13 });
  });
});

describe('formula precedence and grouping', () => {
  it.each([
    ['2 + 3 * 4', 14],
    ['(2 + 3) * 4', 20],
    ['8 - 2 - 1', 5],
    ['8 / 2 / 2', 2],
    ['2 * 3 / 4', 1.5],
    ['-2 * 3', -6],
    ['2 * -3', -6],
    ['--3', 3],
    ['-(2 + 3)', -5],
    ['+3', 3],
    ['10 - -2', 12],
    ['2.5 * 2', 5],
    ['.5 + 3.', 3.5],
    ['((((1))))', 1],
  ])('%s is %d', (source, expected) => {
    expect(valueOf(source)).toBe(expected);
  });
});

describe('formula functions', () => {
  it.each([
    ['floor(-0.5)', -1],
    ['floor((14 - 10) / 2)', 2],
    ['floor((7 - 10) / 2)', -2],
    ['ceil(1.2)', 2],
    ['round(2.5)', 3],
    ['round(2.4)', 2],
    ['abs(-4)', 4],
    ['min(3, 1, 2)', 1],
    ['max(1)', 1],
    ['max(1, min(5, 7), -2)', 5],
    ['FLOOR(1.5)', 1],
  ])('%s is %d', (source, expected) => {
    expect(valueOf(source)).toBe(expected);
  });

  it('writes zero without a sign', () => {
    expect(Object.is(valueOf('-0 * 5'), 0)).toBe(true);
    expect(Object.is(valueOf('ceil(-0.5)'), 0)).toBe(true);
  });
});

describe('formula references', () => {
  it('reads numbers and text that is a number', () => {
    expect(valueOf('hp + 1')).toBe(23);
    expect(valueOf('initiative + 10')).toBe(13);
    expect(valueOf('minus * 2')).toBe(-4);
    expect(valueOf('floor((stats.1 - 10) / 2)')).toBe(2);
  });

  it('reads the current Scores slot as `value`', () => {
    expect(valueOf('floor((value - 10) / 2)', { value: 15 })).toBe(2);
    expect(valueOf('value + 1', { value: '+3' })).toBe(4);
  });

  it('says in plain words which field is empty or not a number', () => {
    expect(errorOf('speed + 5', { labelOf })).toEqual({ kind: 'not-a-number', ref: 'speed', message: "Speed isn't a number." });
    expect(errorOf('blank * 2', { labelOf })).toEqual({ kind: 'unbound', ref: 'blank', message: 'Languages is empty.' });
    expect(errorOf('nothing + missing')).toEqual({ kind: 'unbound', ref: 'nothing', message: 'nothing is empty.' });
    expect(errorOf('stats + 1').kind).toBe('not-a-number');
    expect(errorOf('flag + 1').kind).toBe('not-a-number');
  });

  it('reports the first failing part, left to right', () => {
    expect(errorOf('missing + speed').ref).toBe('missing');
    expect(errorOf('max(1, speed, missing)').ref).toBe('speed');
  });

  it('says when `value` has no score', () => {
    expect(errorOf('value + 1')).toMatchObject({ kind: 'unbound', ref: 'value' });
    expect(errorOf('value + 1', { value: '—', slotLabel: 'Str' })).toEqual({ kind: 'not-a-number', ref: 'value', message: "Str isn't a number." });
    expect(errorOf('value + 1', { value: undefined, slotLabel: 'Str' }).message).toBe('Str is empty.');
  });

  it('refuses division by zero and results too large to show', () => {
    expect(errorOf('hp / (stats.1 - 14)')).toEqual({ kind: 'not-a-number', message: "Can't divide by zero." });
    expect(errorOf(`${'9'.repeat(300)} * ${'9'.repeat(300)}`)).toEqual({ kind: 'not-a-number', message: 'The result is too large to show.' });
  });
});

describe('formula syntax errors', () => {
  it.each([
    ['', 'The formula is empty.', 0],
    ['   ', 'The formula is empty.', 0],
    ['2 +', 'The formula ends too early.', 3],
    ['(2 + 3', 'A “(” is never closed.', 0],
    ['2 + 3)', 'There is a “)” without a “(”.', 5],
    ['2 3', '“3” doesn\'t belong here.', 2],
    ['* 2', '“*” needs a number before it.', 0],
    ['1, 2', '“,” only separates the numbers of min and max.', 1],
    ['floor(1, 2)', 'floor takes one number.', 0],
    ['min()', 'min needs at least one number.', 0],
    ['flor(1)', '“flor” isn\'t a function. There are floor, ceil, round, abs, min and max.', 0],
    ['value(1)', '“value” isn\'t a function. There are floor, ceil, round, abs, min and max.', 0],
    ['max(1 2)', '“2” doesn\'t belong here.', 6],
    ['max(1,', 'The formula ends too early.', 6],
    ['2d6 + 1', '“d6” doesn\'t belong here.', 1],
  ])('%j: %s', (source, message, at) => {
    expect(syntaxOf(source)).toEqual({ kind: 'syntax', message, at });
  });

  it('places errors in the text the formula came from', () => {
    expect(syntaxOf('2 +', 7).at).toBe(10);
  });

  it('refuses nesting and lengths no statblock needs, without exhausting the stack', () => {
    expect(syntaxOf(`${'('.repeat(200)}1${')'.repeat(200)}`).message).toBe('The formula is nested too deeply.');
    expect(syntaxOf(`${'-'.repeat(200)}1`).message).toBe('The formula is nested too deeply.');
    expect(syntaxOf(`${'abs('.repeat(200)}1${')'.repeat(200)}`).message).toBe('The formula is nested too deeply.');
    expect(syntaxOf(`${'('.repeat(5000)}1${')'.repeat(5000)}`).message).toBe('The formula is too long.');
    expect(syntaxOf(Array.from({ length: 3000 }, () => '1').join(' + ')).message).toBe('The formula is too long.');
  });
});

describe('formulaText', () => {
  it('writes a formula with the brackets its grouping needs', () => {
    expect(formulaText(parsed('((stats.1 - 10)) / 2'))).toBe('(stats.1 - 10) / 2');
    expect(formulaText(parsed('8 - (2 - 1)'))).toBe('8 - (2 - 1)');
    expect(formulaText(parsed('(8 - 2) - 1'))).toBe('8 - 2 - 1');
    expect(formulaText(parsed('-(value + 1) * max(1, 2)'))).toBe('-(value + 1) * max(1, 2)');
  });

  it('names fields by their labels for tooltips', () => {
    expect(formulaText(parsed('floor((stats.1 - 10) / 2)'), labelOf)).toBe('floor((Dex - 10) / 2)');
  });
});

/** A reference evaluation, independent of the evaluator, for generated trees. */
function reference(node: FormulaNode, refs: Record<string, number>, value: number): number {
  switch (node.kind) {
    case 'number': return node.value;
    case 'ref': return refs[node.ref] ?? Number.NaN;
    case 'slot': return value;
    case 'negate': return -reference(node.operand, refs, value);
    case 'call': {
      const args = node.args.map((arg) => reference(arg, refs, value));
      const first = args[0] ?? Number.NaN;
      switch (node.fn) {
        case 'min': return Math.min(...args);
        case 'max': return Math.max(...args);
        case 'floor': return Math.floor(first);
        case 'ceil': return Math.ceil(first);
        case 'round': return Math.round(first);
        case 'abs': return Math.abs(first);
      }
    }
    case 'binary': {
      const left = reference(node.left, refs, value);
      const right = reference(node.right, refs, value);
      if (node.op === '+') return left + right;
      if (node.op === '-') return left - right;
      if (node.op === '*') return left * right;
      return right === 0 ? Number.NaN : left / right;
    }
  }
}

function randomTree(random: () => number, depth: number): FormulaNode {
  if (depth <= 0 || random() < 0.25) {
    const leaf = randomInt(random, 0, 3);
    if (leaf === 0) return { kind: 'number', value: randomInt(random, 0, 40) / pick(random, [1, 2, 4]) };
    if (leaf === 1) return { kind: 'slot' };
    return { kind: 'ref', ref: pick(random, ['hp', 'ac', 'stats.1', 'level_2']) };
  }
  const shape = randomInt(random, 0, 3);
  if (shape === 0) return { kind: 'negate', operand: randomTree(random, depth - 1) };
  if (shape === 1) {
    const fn = pick(random, ['floor', 'ceil', 'round', 'abs', 'min', 'max'] as const);
    const count = fn === 'min' || fn === 'max' ? randomInt(random, 1, 3) : 1;
    return { kind: 'call', fn, args: Array.from({ length: count }, () => randomTree(random, depth - 1)) };
  }
  const op = pick(random, ['+', '-', '*', '/'] as const);
  return { kind: 'binary', op, left: randomTree(random, depth - 1), right: randomTree(random, depth - 1) };
}

describe('formula properties', () => {
  const refs = { hp: 22, ac: 13, 'stats.1': 14, level_2: 3 };
  const numbers: ValueReader = (ref) => (ref in refs ? refs[ref as keyof typeof refs] : undefined);

  it('parses what formulaText writes back to the same tree, and evaluates it like the reference', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const random = seededRandom(seed);
      const tree = randomTree(random, 6);
      const text = formulaText(tree);
      const reparsed = parseFormula(text);
      expect(reparsed, `seed ${seed}: ${text}`).toEqual(tree);

      const expected = reference(tree, refs, 15);
      const result = evaluateFormula(tree, numbers, { value: 15 });
      if (Number.isFinite(expected) && result.ok) expect(result.value, `seed ${seed}: ${text}`).toBeCloseTo(expected, 9);
      else expect(result.ok, `seed ${seed}: ${text} = ${expected}`).toBe(Number.isFinite(expected));
    }
  });

  it('never throws on random text, and answers the same twice', () => {
    const alphabet = '0123456789.+-*/(),− abcdefloorceilminmaxvaluestats_ä#';
    for (let seed = 1; seed <= 2000; seed++) {
      const source = randomString(seededRandom(seed), alphabet, 40);
      const first = parseFormula(source);
      expect(parseFormula(source), `seed ${seed}`).toEqual(first);
      if (!isExpressionError(first)) {
        const result = evaluateFormula(first, numbers, { value: 10 });
        expect(typeof result.ok).toBe('boolean');
      } else {
        expect(first.kind).toBe('syntax');
        expect(first.at).toBeGreaterThanOrEqual(0);
        expect(first.at).toBeLessThanOrEqual(source.length);
      }
    }
  });
});
