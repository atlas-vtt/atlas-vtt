#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { workBase } from './check-guards.mjs';

const root = path.resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
const names = (...args) => git(...args).split('\0').filter(Boolean);

const base = workBase(git);
if (base.problem) {
  console.error(base.problem);
  process.exit(2);
}
const changed = [...new Set([
  ...names('diff', '--name-only', '--no-renames', '-z', base.commit),
  ...names('ls-files', '-z', '--others', '--exclude-standard'),
])].filter((file) => fs.existsSync(path.join(root, file)));
// Every script file by its ending: the ESLint config decides which of them it reads, not this list.
const lintable = changed.filter((file) => file === 'package.json' || /\.[cm]?[jt]sx?$/.test(file));
// A command line holds about 32,000 characters on Windows.
const LINT_CHUNK = 100;
const lintRuns = Array.from({ length: Math.ceil(lintable.length / LINT_CHUNK) }, (_, index) => lintable.slice(index * LINT_CHUNK, (index + 1) * LINT_CHUNK));

// Each tool by its own entry script, run by this Node: no shell reads a file name, and none is needed to find `npx` on Windows.
const TSC = 'node_modules/typescript/bin/tsc';
const eslint = (config, baseline) => ['node_modules/eslint/bin/eslint.js', '--config', config, '--max-warnings', '0', '--suppressions-location', baseline, '--pass-on-unpruned-suppressions', '--no-warn-ignored'];
const ESLINT = eslint('eslint.config.mjs', 'eslint.suppressions.json');
// The tests' lint, with their own conventions and baseline: of the changed files it reads the tests, as the first reads the code.
const ESLINT_TESTS = eslint('scripts/eslint/testsConfig.mjs', 'eslint.tests.suppressions.json');
const steps = [
  [TSC, '--noEmit'],
  ...lintRuns.map((files) => [...ESLINT, ...files]),
  ...lintRuns.map((files) => [...ESLINT_TESTS, ...files]),
  !process.argv.includes('--no-tests') && ['node_modules/vitest/vitest.mjs', 'run', '--project', 'unit', '--changed', base.commit],
  ['scripts/check-boundaries.mjs'],
  [TSC, '-p', 'tsconfig.shared.json'],
  ['scripts/check-file-sizes.mjs'],
  ['scripts/check-doc-refs.mjs'],
  ['scripts/check-guards.mjs', '--base', base.commit],
].filter(Boolean);

console.log(`Checking against ${base.name} (${base.commit.slice(0, 9)}): ${changed.length} changed file(s), ${lintable.length} to lint`);
for (const step of steps) {
  console.log(`\n$ node ${step.join(' ')}`);
  const { status } = spawnSync(process.execPath, step, { cwd: root, stdio: 'inherit' });
  if (status !== 0) process.exit(status ?? 1);
}
