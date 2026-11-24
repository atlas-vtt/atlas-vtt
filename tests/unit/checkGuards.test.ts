import { describe, expect, it } from 'vitest';
import { budgetProblems, guardFileProblems, sides, sizeProblems, suppressedTotals, suppressionProblems, workBase } from '../../scripts/check-guards.mjs';

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

  it('holds the baseline of the tests to the same comparison, and names it', () => {
    const tests = 'eslint.tests.suppressions.json';
    const before = suppressed({ 'tests/unit/a.test.ts': { 'atlas/test-mock-count': 2 }, 'tests/unit/b.test.ts': { 'atlas/test-mock-count': 1 } });
    const moved = suppressed({ 'tests/unit/c.test.ts': { 'atlas/test-mock-count': 3 } });
    const raised = suppressed({ 'tests/unit/a.test.ts': { 'atlas/test-mock-count': 3 }, 'tests/unit/b.test.ts': { 'atlas/test-mock-count': 1 } });
    const added = suppressed({ 'tests/unit/a.test.ts': { 'atlas/test-mock-count': 2, 'atlas/test-asserts': 1 } });
    expect(suppressionProblems(before, moved, tests)).toEqual([]);
    expect(suppressionProblems(before, raised, tests)).toEqual([expect.stringMatching(/^eslint\.tests\.suppressions\.json: suppressed findings of atlas\/test-mock-count rose from 3 to 4/)]);
    expect(suppressionProblems(before, added, tests)).toEqual([expect.stringMatching(/^eslint\.tests\.suppressions\.json: atlas\/test-asserts is suppressed \(1\) and was not before/)]);
    expect(suppressionProblems(before, raised)).toEqual([expect.stringMatching(/^eslint\.suppressions\.json: /)]);
  });

  it('passes a base and a head that both have no such file, and lists every rule of a file the base lacks', () => {
    expect(suppressionProblems(null, null, 'eslint.tests.suppressions.json')).toEqual([]);
    expect(suppressionProblems(null, base, 'eslint.tests.suppressions.json')).toHaveLength(2);
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

  it('lets a renamed file keep its allowance, or a lower one', () => {
    expect(sizeProblems(base, { ...base, allowances: { 'src/moved.ts': 450, 'src/b.ts': 350 } })).toEqual([]);
    expect(sizeProblems(base, { ...base, allowances: { 'src/moved.ts': 400, 'src/b.ts': 350 } })).toEqual([]);
    expect(sizeProblems(base, { ...base, allowances: { 'src/x.ts': 350, 'src/y.ts': 450 } })).toEqual([]);
  });

  it('pairs each added entry with one entry that is gone', () => {
    expect(sizeProblems(base, { ...base, allowances: { 'src/moved.ts': 500, 'src/b.ts': 350 } })).toEqual([expect.stringMatching(/src\/moved\.ts was added with an allowance of 500/)]);
    expect(sizeProblems(base, { ...base, allowances: { 'src/x.ts': 350, 'src/y.ts': 350, 'src/b.ts': 350 } })).toEqual([expect.stringMatching(/src\/y\.ts was added/)]);
    expect(sizeProblems(base, { ...base, allowances: { 'src/x.ts': 400, 'src/y.ts': 400 } })).toEqual([expect.stringMatching(/src\/y\.ts was added/)]);
    expect(sizeProblems(base, { ...base, allowances: { 'src/x.ts': '300', 'src/b.ts': 350 } })).toEqual([expect.stringMatching(/src\/x\.ts was added/)]);
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
    const changed = ['src/app/a.ts', 'package.json', 'tests/unit/checkGuards.test.ts', 'src/app/scripts/run.ts', 'src/app/eslint.config.json', 'styles/main.scss'];
    expect(guardFileProblems(changed, { base: scripts, head: { ...scripts } })).toEqual([]);
  });

  it('passes the baselines, which their own comparisons hold and a change may lower', () => {
    const changed = ['eslint.suppressions.json', 'eslint.tests.suppressions.json', 'scripts/file-sizes.json', 'scripts/bundle-budget.json'];
    expect(guardFileProblems(changed, { base: scripts, head: scripts })).toEqual([]);
  });

  it('fails a changed script, config or workflow', () => {
    const changed = [
      'eslint.config.mjs', 'eslint.scanner.mjs', 'scripts/eslint/conventions.mjs', 'scripts/eslint/testConventions.mjs', 'scripts/eslint/testsConfig.mjs', 'scripts/check-guards.mjs', 'scripts/check.mjs',
      'scripts/check-old.js', 'scripts/preflight.js', 'scripts/lint-scan.js', 'scripts/boundaries.mjs', 'scripts/boundaries/graph.mjs', 'scripts/changelog.js',
      'scripts/new-baseline.json', 'tsconfig.json', 'tsconfig.shared.json', 'src/tsconfig.json', 'tests/tsconfig.json', 'vitest.config.mts',
      '.github/workflows/plugin-ci.yml', '.github/workflows/guards.yml',
    ];
    const problems = guardFileProblems(changed, { base: scripts, head: scripts });
    expect(problems).toHaveLength(changed.length);
    for (const problem of problems) expect(problem).toMatch(ENDING);
  });

  it('fails an ESLint config anywhere, since the nearest one to a file replaces the root one', () => {
    const changed = ['eslint.config.js', 'eslint.config.ts', 'eslint.config.cjs', 'eslint.config.mts', 'src/eslint.config.js', 'src/app/pixi/eslint.config.mjs'];
    expect(guardFileProblems(changed, { base: scripts, head: scripts })).toHaveLength(changed.length);
  });

  it('fails a changed scripts block', () => {
    expect(guardFileProblems([], { base: scripts, head: { lint: 'true' } })).toEqual([expect.stringMatching(/package\.json: the scripts block changed/)]);
  });
});

describe('the two sides', () => {
  const answers: Record<string, string> = {
    'show base1:scripts/file-sizes.json': '{"allowances":{"src/a.ts":350},"exempt":[]}',
    'show head1:scripts/file-sizes.json': '{"allowances":{"src/a.ts":400},"exempt":[]}',
    'diff --name-only --no-renames -z base1 head1': 'src/b.ts\0scripts/check.mjs\0src/a b.ts\0',
  };
  const calls: string[] = [];
  const git = (...command: string[]): string => {
    const call = command.join(' ');
    calls.push(call);
    if (!(call in answers)) throw new Error(`git ${call}`);
    return answers[call];
  };

  it('reads a named head through git alone, and a file it lacks as none', () => {
    const { atBase, atHead, changed } = sides(git, 'base1', 'head1');
    expect(sizeProblems(atBase('scripts/file-sizes.json'), atHead('scripts/file-sizes.json'))).toEqual([expect.stringMatching(/rose from 350 to 400/)]);
    expect(atHead('scripts/bundle-budget.json')).toBeNull();
    expect(changed()).toEqual(['scripts/check.mjs', 'src/a b.ts', 'src/b.ts']);
    expect(calls.every((call) => call.startsWith('show base1:') || call.startsWith('show head1:') || call.startsWith('diff '))).toBe(true);
  });
});

describe('the base a branch is compared with', () => {
  const repository = (refs: string[]) => (...command: string[]): string => {
    const [verb, ...rest] = command;
    const ref = rest.at(-1)?.replace('^{commit}', '') ?? '';
    if (!refs.includes(ref)) throw new Error(`git ${command.join(' ')}`);
    return verb === 'merge-base' ? `fork-of-${ref}\n` : `${ref}\n`;
  };

  it('is where HEAD left beta, else origin/beta, else what ATLAS_BASE names', () => {
    expect(workBase(repository(['beta', 'origin/beta']), '')).toEqual({ name: 'beta', commit: 'fork-of-beta' });
    expect(workBase(repository(['origin/beta']), '')).toEqual({ name: 'origin/beta', commit: 'fork-of-origin/beta' });
    expect(workBase(repository(['beta', 'origin/main']), 'origin/main')).toEqual({ name: 'origin/main', commit: 'fork-of-origin/main' });
  });

  it('says how to name one where there is none', () => {
    expect(workBase(repository([]), '')).toEqual({ problem: expect.stringMatching(/set ATLAS_BASE/) });
    expect(workBase(repository(['beta']), 'nowhere')).toEqual({ problem: expect.stringMatching(/^nowhere names no commit/) });
  });
});
