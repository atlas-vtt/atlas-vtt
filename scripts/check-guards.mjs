#!/usr/bin/env node
// CI runs the base branch's copy of this file from a temporary directory against a pull
// request's tree, so it imports nothing from the repository and reads every path from the
// working directory.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SUPPRESSIONS = 'eslint.suppressions.json';
const SIZES = 'scripts/file-sizes.json';
const BUDGET = 'scripts/bundle-budget.json';
const ENDING = 'Fix the finding instead; only the maintainer changes a baseline or a check.';

const GUARD_FILES = [
  /^eslint\.(config|scanner)\.mjs$/,
  /^eslint\.suppressions\.json$/,
  /^scripts\/eslint\//,
  /^scripts\/check[^/]*\.m?js$/,
  /^scripts\/(preflight|lint-scan)\.js$/,
  /^scripts\/boundaries\.mjs$/,
  /^scripts\/(file-sizes|bundle-budget)\.json$/,
  /^tsconfig[^/]*\.json$/,
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

export function suppressionProblems(base, head) {
  const before = suppressedTotals(base);
  return [...suppressedTotals(head)].flatMap(([rule, total]) => {
    if (!before.has(rule)) return [failure(`${SUPPRESSIONS}: ${rule} is suppressed (${total}) and was not before.`)];
    if (total > before.get(rule)) return [failure(`${SUPPRESSIONS}: suppressed findings of ${rule} rose from ${before.get(rule)} to ${total}.`)];
    return [];
  });
}

/** `base` is null where the base has no record yet: the change that introduces it sets it. */
export function sizeProblems(base, head) {
  if (!base || !head) return [];
  const problems = [];
  for (const [file, allowed] of Object.entries(own(head, 'allowances') ?? {})) {
    const before = own(own(base, 'allowances'), file);
    if (before === undefined) problems.push(failure(`${SIZES}: ${file} was added with an allowance of ${allowed} lines.`));
    else if (raised(before, allowed)) problems.push(failure(`${SIZES}: the allowance of ${file} rose from ${before} to ${allowed} lines.`));
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

/** `scripts` are the `scripts` blocks of package.json at the base and now. */
export function guardFileProblems(changedFiles, scripts) {
  const problems = changedFiles.filter((file) => GUARD_FILES.some((pattern) => pattern.test(file))).map((file) => failure(`${file} changed, and it is one of the checks.`));
  if (JSON.stringify(scripts.base) !== JSON.stringify(scripts.head)) problems.push(failure('package.json: the scripts block changed, and it runs the checks.'));
  return problems;
}

function main(args) {
  const named = args.includes('--base') ? args[args.indexOf('--base') + 1] : undefined;
  if (!named) {
    console.error('Usage: node scripts/check-guards.mjs --base <git ref> [--strict]');
    return 2;
  }
  const git = (...command) => execFileSync('git', command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  let base;
  try {
    base = git('rev-parse', '--verify', '--quiet', '--end-of-options', `${named}^{commit}`).trim();
  } catch {
    console.error(`${named} names no commit here.`);
    return 2;
  }
  const atBase = (file) => {
    let text;
    try {
      text = git('show', `${base}:${file}`);
    } catch {
      return null;
    }
    return JSON.parse(text);
  };
  const now = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);

  const problems = [
    ...suppressionProblems(atBase(SUPPRESSIONS), now(SUPPRESSIONS)),
    ...sizeProblems(atBase(SIZES), now(SIZES)),
    ...budgetProblems(atBase(BUDGET), now(BUDGET)),
  ];
  if (args.includes('--strict')) {
    // Without --no-renames a check that was moved away shows under its new name alone.
    const changed = [...git('diff', '--name-only', '--no-renames', base).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean);
    problems.push(...guardFileProblems([...new Set(changed)].sort(), { base: own(atBase('package.json'), 'scripts'), head: own(now('package.json'), 'scripts') }));
  }

  const allowed = process.env.ATLAS_GUARDS_OK === '1';
  for (const message of problems) (allowed ? console.log : console.error)(allowed ? `note: ${message}` : message);
  console.log(problems.length ? `${problems.length} guard finding(s)${allowed ? ', let through by ATLAS_GUARDS_OK=1' : ''}` : 'Baselines and budgets are no higher than at the base.');
  return problems.length && !allowed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
