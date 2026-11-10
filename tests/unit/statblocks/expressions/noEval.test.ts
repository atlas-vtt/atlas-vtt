import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const EXPRESSIONS = join(__dirname, '../../../../src/app/statblocks/expressions');

/** Code that runs text as code: `eval(`, `window.eval(`, `Function(`, `new Function(`. */
const FORBIDDEN = [/\beval\s*\(/, /\bFunction\s*\(/];

describe('the expression language', () => {
  it('never runs text as code', () => {
    const files = readdirSync(EXPRESSIONS, { recursive: true, encoding: 'utf8' }).filter((file) => /\.[cm]?[jt]sx?$/.test(file));
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.flatMap((file) => {
      const source = readFileSync(join(EXPRESSIONS, file), 'utf8');
      return FORBIDDEN.filter((pattern) => pattern.test(source)).map((pattern) => `${file}: ${pattern.source}`);
    });
    expect(offenders).toEqual([]);
  });

  it('would notice code that does', () => {
    expect(FORBIDDEN.some((pattern) => pattern.test('return new Function("a", body)'))).toBe(true);
    expect(FORBIDDEN.some((pattern) => pattern.test('globalThis.eval (text)'))).toBe(true);
    expect(FORBIDDEN.some((pattern) => pattern.test('isFormulaFunction(name)'))).toBe(false);
  });
});
