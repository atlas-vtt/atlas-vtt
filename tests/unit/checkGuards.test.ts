import { describe, expect, it } from 'vitest';
import { budgetProblems, guardFileProblems, sizeProblems, suppressedTotals, suppressionProblems } from '../../scripts/check-guards.mjs';

const ENDING = /Fix the finding instead; only the maintainer changes a baseline or a check\.$/;
const suppressed = (files: Record<string, Record<string, number>>): unknown =>
  Object.fromEntries(Object.entries(files).map(([file, rules]) => [file, Object.fromEntries(Object.entries(rules).map(([rule, count]) => [rule, { count }]))]));

describe('the suppression baseline', () => {
  const base = suppressed({ 'src/a.ts': { 'atlas/one': 2, 'atlas/two': 1 }, 'src/b.ts': { 'atlas/one': 3 } });

  it('totals each rule over all files', () => {
    expect(Object.fromEntries(suppressedTotals(base))).toEqual({ 'atlas/one': 5, 'atlas/two': 1 });
    expect(suppressedTotals(null).size).toBe(0);
  });

  it('lets an entry move to another file', () => {
    const moved = suppressed({ 'src/a.ts': { 'atlas/two': 1 }, 'src/c.ts': { 'atlas/one': 5 } });
    expect(suppressionProblems(base, moved)).toEqual([]);
  });

  it('lets a count fall', () => {
    expect(suppressionProblems(base, suppressed({ 'src/b.ts': { 'atlas/one': 3 } }))).toEqual([]);
  });

  it('fails a raised count', () => {
    const problems = suppressionProblems(base, suppressed({ 'src/a.ts': { 'atlas/one': 3, 'atlas/two': 1 }, 'src/b.ts': { 'atlas/one': 3 } }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/atlas\/one rose from 5 to 6/);
    expect(problems[0]).toMatch(ENDING);
  });

  it('fails a rule the base did not suppress, also where the base has no file', () => {
    const added = suppressed({ 'src/a.ts': { 'atlas/one': 2, 'atlas/three': 1 } });
    expect(suppressionProblems(base, added)).toEqual([expect.stringMatching(/atlas\/three is suppressed \(1\) and was not before/)]);
    expect(suppressionProblems(null, added)).toHaveLength(2);
  });
});

describe('the file size record', () => {
  const base = { allowances: { 'src/a.ts': 450, 'src/b.ts': 350 }, exempt: ['src/data/**'] };

  it('lets an allowance fall or go', () => {
    expect(sizeProblems(base, { allowances: { 'src/a.ts': 400 }, exempt: ['src/data/**'] })).toEqual([]);
    expect(sizeProblems(base, { allowances: {}, exempt: [] })).toEqual([]);
  });

  it('fails a raised allowance', () => {
    const problems = sizeProblems(base, { ...base, allowances: { 'src/a.ts': 500, 'src/b.ts': 350 } });
    expect(problems).toEqual([expect.stringMatching(/allowance of src\/a\.ts rose from 450 to 500/)]);
    expect(problems[0]).toMatch(ENDING);
  });

  it('fails an added entry and an added exemption', () => {
    expect(sizeProblems(base, { ...base, allowances: { ...base.allowances, 'src/c.ts': 350 } })).toEqual([expect.stringMatching(/src\/c\.ts was added/)]);
    expect(sizeProblems(base, { ...base, exempt: ['src/data/**', 'src/**'] })).toEqual([expect.stringMatching(/exemption src\/\*\* was added/)]);
  });

  it('passes the change that introduces the record', () => {
    expect(sizeProblems(null, base)).toEqual([]);
  });
});

describe('the bundle budget', () => {
  const base = { 'dist/main.js': 1000, 'dist/styles.css': 200 };

  it('lets a budget fall and passes the change that introduces it', () => {
    expect(budgetProblems(base, { 'dist/main.js': 900, 'dist/styles.css': 200 })).toEqual([]);
    expect(budgetProblems(null, base)).toEqual([]);
  });

  it('fails a raised and a removed budget', () => {
    expect(budgetProblems(base, { 'dist/main.js': 1001, 'dist/styles.css': 200 })).toEqual([expect.stringMatching(/dist\/main\.js rose from 1000 to 1001/)]);
    expect(budgetProblems(base, { 'dist/main.js': 1000 })).toEqual([expect.stringMatching(/dist\/styles\.css was removed/)]);
    expect(budgetProblems(base, null)).toHaveLength(2);
  });
});

describe('the checks themselves, for pull requests from forks', () => {
  const scripts = { lint: 'eslint .' };

  it('passes changes to anything else', () => {
    const changed = ['src/app/a.ts', 'package.json', 'scripts/changelog.js', 'scripts/boundaries/graph.mjs', 'src/tsconfig.json', 'tests/unit/checkGuards.test.ts'];
    expect(guardFileProblems(changed, { base: scripts, head: { ...scripts } })).toEqual([]);
  });

  it('fails a changed check, baseline, config or workflow', () => {
    const changed = [
      'eslint.config.mjs', 'eslint.scanner.mjs', 'eslint.suppressions.json', 'scripts/eslint/conventions.mjs', 'scripts/check-guards.mjs', 'scripts/check.mjs',
      'scripts/check-old.js', 'scripts/preflight.js', 'scripts/lint-scan.js', 'scripts/boundaries.mjs', 'scripts/file-sizes.json', 'scripts/bundle-budget.json',
      'tsconfig.json', 'tsconfig.shared.json', 'vitest.config.mts', '.github/workflows/plugin-ci.yml',
    ];
    const problems = guardFileProblems(changed, { base: scripts, head: scripts });
    expect(problems).toHaveLength(changed.length);
    for (const problem of problems) expect(problem).toMatch(ENDING);
  });

  it('fails a changed scripts block', () => {
    expect(guardFileProblems([], { base: scripts, head: { lint: 'true' } })).toEqual([expect.stringMatching(/package\.json: the scripts block changed/)]);
  });
});
