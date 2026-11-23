#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const known = (ref) => spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: root }).status === 0;

const base = process.env.ATLAS_BASE || (known('refs/heads/beta') ? 'beta' : 'origin/beta');
const mergeBase = git('merge-base', 'HEAD', base);
const changed = [...new Set([
  ...git('diff', '--name-only', '--no-renames', mergeBase).split('\n'),
  ...git('ls-files', '--others', '--exclude-standard').split('\n'),
])].filter((file) => file && fs.existsSync(path.join(root, file)));
// ESLint warns about a file it is handed and ignores, which --max-warnings 0 fails.
const lintable = changed.filter((file) => file === 'package.json' || ((file === 'main.ts' || /^src\/.+\.tsx?$/.test(file)) && !/\.test\.[^/]*$/.test(file)));

const steps = [
  ['npx', 'tsc', '--noEmit'],
  lintable.length > 0 && ['npx', 'eslint', '--max-warnings', '0', '--suppressions-location', 'eslint.suppressions.json', '--pass-on-unpruned-suppressions', ...lintable],
  !process.argv.includes('--no-tests') && ['npx', 'vitest', 'run', '--project', 'unit', '--changed', mergeBase],
  ['npm', 'run', 'check:boundaries'],
  ['npm', 'run', 'check:sizes'],
  ['npm', 'run', 'check:docs'],
  ['node', 'scripts/check-guards.mjs', '--base', mergeBase],
].filter(Boolean);

console.log(`Checking against ${base} (${mergeBase.slice(0, 9)}): ${changed.length} changed file(s), ${lintable.length} to lint`);
for (const [command, ...args] of steps) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const { status } = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (status !== 0) process.exit(status ?? 1);
}
