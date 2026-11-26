#!/usr/bin/env node
// The `guards` workflow runs the base branch's copy of this file without installing anything and
// hands it a pull request's merge commit as data (`--head`), so it imports nothing but Node's own
// modules and never runs or imports a file of the side it reads.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SUPPRESSIONS = 'eslint.suppressions.json';
const TEST_SUPPRESSIONS = 'eslint.tests.suppressions.json';
const SIZES = 'scripts/file-sizes.json';
const BUDGET = 'scripts/bundle-budget.json';
const ENDING = 'Fix the finding instead; only the maintainer changes a baseline or a check.';
const USAGE = 'Usage: node scripts/check-guards.mjs [--base <git ref>] [--head <git ref>] [--strict]';
const NO_BASE = 'Neither beta nor origin/beta exists here: set ATLAS_BASE to the branch your work started from, as in `ATLAS_BASE=origin/main npm run check`.';

/** Their own comparisons catch every rise and addition, and a change must be able to lower them. */
const BASELINES = new Set([SUPPRESSIONS, TEST_SUPPRESSIONS, SIZES, BUDGET]);
const GUARD_FILES = [
  /(^|\/)eslint\.config\.[cm]?[jt]s$/,
  /^eslint\.scanner\.mjs$/,
  /^scripts\//,
  /(^|\/)tsconfig[^/]*\.json$/,
  /^vitest\.config\.mts$/,
  /^\.github\/workflows\//,
];

const failure = (text) => `${text} ${ENDING}`;
const own = (object, key) => (object !== null && typeof object === 'object' && Object.hasOwn(object, key) ? object[key] : undefined);
const raised = (before, after) => typeof after !== 'number' || after > before;

/** How often each rule is suppressed, over all files. */
export function suppressedTotals(suppressions) {
  const totals = new Map();
  for (const rules of Object.values(suppressions ?? {})) {
    for (const [rule, entry] of Object.entries(rules ?? {})) totals.set(rule, (totals.get(rule) ?? 0) + (Number(own(entry, 'count')) || 0));
  }
  return totals;
}

/** `file` names the baseline in the findings: the code's, or the tests' (`npm run lint:tests`). */
export function suppressionProblems(base, head, file = SUPPRESSIONS) {
  const before = suppressedTotals(base);
  return [...suppressedTotals(head)].flatMap(([rule, total]) => {
    if (!before.has(rule)) return [failure(`${file}: ${rule} is suppressed (${total}) and was not before.`)];
    if (total > before.get(rule)) return [failure(`${file}: suppressed findings of ${rule} rose from ${before.get(rule)} to ${total}.`)];
    return [];
  });
}

/**
 * The added entries no entry that is gone stands for. A renamed file keeps its allowance under its
 * new name: each added entry takes one entry that is gone and allowed at least as much.
 */
function unpairedAdditions(before, after) {
  const lines = (allowed) => (typeof allowed === 'number' ? allowed : Infinity);
  const gone = Object.keys(before).filter((file) => own(after, file) === undefined).map((file) => before[file]).sort((a, b) => b - a);
  const added = Object.entries(after).filter(([file]) => own(before, file) === undefined).sort(([, a], [, b]) => lines(b) - lines(a));
  // Largest first: an added entry the largest one left does not cover is covered by none.
  const unpaired = new Set();
  for (const [file, allowed] of added) {
    if (gone[0] >= lines(allowed)) gone.shift();
    else unpaired.add(file);
  }
  return unpaired;
}

/** `base` is null where the base has no record yet: the change that introduces it sets it. */
export function sizeProblems(base, head) {
  if (!base || !head) return [];
  const [before, after] = [own(base, 'allowances') ?? {}, own(head, 'allowances') ?? {}];
  const unpaired = unpairedAdditions(before, after);
  const problems = [];
  for (const [file, allowed] of Object.entries(after)) {
    const was = own(before, file);
    if (unpaired.has(file)) problems.push(failure(`${SIZES}: ${file} was added with an allowance of ${allowed} lines.`));
    else if (was !== undefined && raised(was, allowed)) problems.push(failure(`${SIZES}: the allowance of ${file} rose from ${was} to ${allowed} lines.`));
  }
  const exempt = new Set(own(base, 'exempt') ?? []);
  for (const glob of own(head, 'exempt') ?? []) {
    if (!exempt.has(glob)) problems.push(failure(`${SIZES}: the exemption ${glob} was added.`));
  }
  return problems;
}

export function budgetProblems(base, head) {
  if (!base) return [];
  return Object.entries(base).flatMap(([file, before]) => {
    const budget = own(head, file);
    if (budget === undefined) return [failure(`${BUDGET}: the budget of ${file} was removed.`)];
    if (raised(before, budget)) return [failure(`${BUDGET}: the budget of ${file} rose from ${before} to ${budget} bytes.`)];
    return [];
  });
}

/** `scripts` are the `scripts` blocks of package.json at the base and at the head. */
export function guardFileProblems(changedFiles, scripts) {
  const problems = changedFiles
    .filter((file) => !BASELINES.has(file) && GUARD_FILES.some((pattern) => pattern.test(file)))
    .map((file) => failure(`${file} changed, and it is one of the checks.`));
  if (JSON.stringify(scripts.base) !== JSON.stringify(scripts.head)) problems.push(failure('package.json: the scripts block changed, and it runs the checks.'));
  return problems;
}

/**
 * Where the two sides are read from. The base is always a commit. The head is the commit `head`,
 * read through git alone, or without one the working tree with what is uncommitted and untracked.
 * @param {(...command: string[]) => string} git Runs git and returns what it printed; throws where git fails.
 */
export function sides(git, base, head) {
  const shown = (ref) => (file) => {
    try {
      return git('show', `${ref}:${file}`);
    } catch {
      return null;
    }
  };
  const onDisk = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
  const json = (read) => (file) => {
    const text = read(file);
    return text === null ? null : JSON.parse(text);
  };
  const names = (...command) => git(...command).split('\0').filter(Boolean);
  // Without --no-renames a check that was moved away shows under its new name alone.
  const diff = ['diff', '--name-only', '--no-renames', '-z', base];
  return {
    atBase: json(shown(base)),
    atHead: json(head ? shown(head) : onDisk),
    changed: () => [...new Set(head ? names(...diff, head) : [...names(...diff), ...names('ls-files', '-z', '--others', '--exclude-standard')])].sort(),
  };
}

/**
 * Where the work left its base branch: ATLAS_BASE, else `beta`, else `origin/beta`.
 * @param {(...command: string[]) => string} git As for `sides`.
 * @returns {{ name: string, commit: string } | { problem: string }}
 */
export function workBase(git, named = process.env.ATLAS_BASE) {
  const attempt = (...command) => {
    try {
      return git(...command).trim();
    } catch {
      return null;
    }
  };
  const known = (ref) => attempt('rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`) !== null;
  const name = named || ['beta', 'origin/beta'].find(known);
  if (!name) return { problem: NO_BASE };
  const commit = known(name) ? attempt('merge-base', 'HEAD', name) : null;
  return commit ? { name, commit } : { problem: `${name} names no commit this work started from.` };
}

function main(args) {
  const git = (...command) => execFileSync('git', command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  const refs = {};
  for (const flag of ['--base', '--head']) {
    if (!args.includes(flag)) continue;
    const named = args[args.indexOf(flag) + 1];
    if (!named || named.startsWith('--')) {
      console.error(USAGE);
      return 2;
    }
    try {
      refs[flag] = git('rev-parse', '--verify', '--quiet', '--end-of-options', `${named}^{commit}`).trim();
    } catch {
      console.error(`${named} names no commit here.`);
      return 2;
    }
  }
  if (!refs['--base']) {
    const base = workBase(git);
    if (base.problem) {
      console.error(base.problem);
      return 2;
    }
    refs['--base'] = base.commit;
  }
  const { atBase, atHead, changed } = sides(git, refs['--base'], refs['--head']);

  const problems = [
    ...suppressionProblems(atBase(SUPPRESSIONS), atHead(SUPPRESSIONS)),
    ...suppressionProblems(atBase(TEST_SUPPRESSIONS), atHead(TEST_SUPPRESSIONS), TEST_SUPPRESSIONS),
    ...sizeProblems(atBase(SIZES), atHead(SIZES)),
    ...budgetProblems(atBase(BUDGET), atHead(BUDGET)),
  ];
  if (args.includes('--strict')) {
    problems.push(...guardFileProblems(changed(), { base: own(atBase('package.json'), 'scripts'), head: own(atHead('package.json'), 'scripts') }));
  }

  const allowed = process.env.ATLAS_GUARDS_OK === '1';
  for (const message of problems) (allowed ? console.log : console.error)(allowed ? `note: ${message}` : message);
  console.log(problems.length ? `${problems.length} guard finding(s)${allowed ? ', let through by ATLAS_GUARDS_OK=1' : ''}` : 'Baselines and budgets are no higher than at the base.');
  return problems.length && !allowed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
