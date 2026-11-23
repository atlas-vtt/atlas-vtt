import { describe, expect, it } from 'vitest';
import { allowanceFor, inScope, lineCount, lowered, recorded, sizeProblems } from '../../scripts/check-file-sizes.mjs';

const record = { allowances: { 'src/big.ts': 450, 'src/gone.ts': 400, 'src/small.ts': 350 }, exempt: ['src/data/**'] };
const sizes = { 'src/big.ts': 362, 'src/small.ts': 300, 'src/new.ts': 301, 'src/data/en/table.ts': 900, 'src/fits.ts': 300 };

describe('the file size check', () => {
  it('reads source files and no tests or declarations', () => {
    expect(['main.ts', 'src/app/a.ts', 'src/app/b.tsx'].every(inScope)).toBe(true);
    expect(['src/app/a.test.ts', 'src/app/__tests__/helper.ts', 'src/assets.d.ts', 'scripts/a.ts', 'src/app/a.js'].some(inScope)).toBe(false);
  });

  it('counts lines with or without a final newline', () => {
    expect([lineCount(''), lineCount('a\n'), lineCount('a\nb'), lineCount('a\n\n')]).toEqual([0, 1, 2, 2]);
  });

  it('leaves a recorded file room for a fix and no more than a screen', () => {
    expect([301, 349, 350, 351].map(allowanceFor)).toEqual([350, 350, 400, 400]);
  });

  it('holds a file to its allowance, or to 300 lines without one', () => {
    expect(sizeProblems(sizes, record)).toEqual(['src/new.ts: 301 lines, allowed 300. Move a responsibility into its own module; do not raise the allowance.']);
    expect(sizeProblems({ 'src/big.ts': 451 }, record)).toEqual([expect.stringContaining('src/big.ts: 451 lines, allowed 450.')]);
  });

  it('lowers allowances and drops the ones no longer needed, and adds none', () => {
    expect(lowered(sizes, record)).toEqual({ allowances: { 'src/big.ts': 400 }, exempt: ['src/data/**'] });
    expect(lowered({ 'src/big.ts': 480 }, record).allowances).toEqual({ 'src/big.ts': 450 });
  });

  it('records only the files it is given', () => {
    expect(recorded(sizes, record, ['src/new.ts', 'src/fits.ts', 'src/data/en/table.ts']).allowances).toEqual({ ...record.allowances, 'src/new.ts': 350 });
    expect(recorded({ 'src/big.ts': 480 }, record, ['src/big.ts']).allowances['src/big.ts']).toBe(500);
  });
});
