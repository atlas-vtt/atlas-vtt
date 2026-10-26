import { describe, expect, it } from 'vitest';
import { BookPasses, type PassScope } from '../../../../src/app/online/gm/book/bookPasses.ts';

const scopes = (runs: PassScope[]): (string | string[])[] => runs.map((scope) => (scope === 'all' ? 'all' : [...scope].sort()));

describe('passes over the players\' books', () => {
  it('makes one pass of everything asked for in a burst', async () => {
    const runs: PassScope[] = [];
    const passes = new BookPasses((scope) => void runs.push(scope));
    passes.of(['ana']);
    passes.of(['ben', 'ana']);
    expect(runs).toEqual([]);
    await Promise.resolve();
    expect(scopes(runs)).toEqual([['ana', 'ben']]);
    passes.of(['ana']);
    passes.all();
    passes.of(['ben']);
    await Promise.resolve();
    expect(scopes(runs)).toEqual([['ana', 'ben'], 'all']);
  });

  it('makes a pass at once where something must follow it, with what waited', async () => {
    const runs: PassScope[] = [];
    const passes = new BookPasses((scope) => void runs.push(scope));
    passes.of(['ben']);
    passes.now(['ana']);
    expect(scopes(runs)).toEqual([['ana', 'ben']]);
    await Promise.resolve();
    expect(runs).toHaveLength(1);
  });
});
