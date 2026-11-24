#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const LIMIT = 300;
const STEP = 50;
const RECORD = 'scripts/file-sizes.json';

/** What a file of this many lines is recorded with: the next multiple of STEP above it. */
export const allowanceFor = (lines) => (Math.floor(lines / STEP) + 1) * STEP;

export const lineCount = (text) => (text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0));

export const inScope = (file) => (file === 'main.ts' || /^src\/.+\.(tsx?|jsx?|mjs)$/.test(file)) && !/\.test\.|(^|\/)__tests__\/|\.d\.ts$/.test(file);

const globPattern = (glob) => new RegExp(`^${glob.split('**').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*')).join('.*')}$`);

export function isExempt(file, record) {
  return record.exempt.some((glob) => globPattern(glob).test(file));
}

const sorted = (entries) => Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** `sizes` maps every file in scope to its line count. */
export function sizeProblems(sizes, record) {
  return Object.entries(sizes).flatMap(([file, lines]) => {
    const recorded = record.allowances[file];
    const allowed = recorded ?? LIMIT;
    if (lines <= allowed || isExempt(file, record)) return [];
    const renamed = recorded === undefined ? ` If you renamed a recorded file, rename its entry in ${RECORD}.` : '';
    return [`${file}: ${lines} lines, allowed ${allowed}. Move a responsibility into its own module; do not raise the allowance.${renamed}`];
  });
}

/** The record with every allowance as low as its file now permits. Raises and adds nothing. */
export function lowered(sizes, record) {
  const kept = Object.entries(record.allowances).flatMap(([file, allowed]) => {
    const lines = sizes[file];
    if (lines === undefined || lines <= LIMIT || isExempt(file, record)) return [];
    return [[file, Math.min(allowed, allowanceFor(lines))]];
  });
  return { allowances: sorted(kept), exempt: [...record.exempt].sort() };
}

/** The record with `files` allowed their present size. */
export function recorded(sizes, record, files) {
  const added = files.flatMap((file) => {
    const lines = sizes[file];
    if (lines === undefined || lines <= LIMIT || isExempt(file, record)) return [];
    return [[file, Math.max(record.allowances[file] ?? 0, allowanceFor(lines))]];
  });
  return { allowances: sorted(Object.entries({ ...record.allowances, ...Object.fromEntries(added) })), exempt: [...record.exempt].sort() };
}

function main(args) {
  const root = path.resolve(import.meta.dirname, '..');
  // Without -z git quotes and escapes a name that holds other than ASCII characters.
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'main.ts', 'src'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const files = [...new Set(listed.split('\0'))].filter((file) => inScope(file) && fs.existsSync(path.join(root, file))).sort();
  const sizes = Object.fromEntries(files.map((file) => [file, lineCount(fs.readFileSync(path.join(root, file), 'utf8'))]));
  let current = JSON.parse(fs.readFileSync(path.join(root, RECORD), 'utf8'));
  const write = (next) => {
    for (const file of new Set([...Object.keys(current.allowances), ...Object.keys(next.allowances)])) {
      const [before, after] = [current.allowances[file], next.allowances[file]];
      if (before !== after) console.log(`${file}: ${before ?? 'not recorded'} -> ${after ?? 'not recorded'}`);
    }
    fs.writeFileSync(path.join(root, RECORD), `${JSON.stringify(next, null, 2)}\n`);
    current = next;
  };

  if (args.includes('--update')) write(lowered(sizes, current));
  if (args.includes('--record')) {
    const named = args.slice(args.indexOf('--record') + 1).filter((arg) => !arg.startsWith('--')).map((file) => path.relative(root, path.resolve(file)).split(path.sep).join('/'));
    for (const file of named) {
      if (sizes[file] === undefined) console.error(`${file} is no source file this check reads.`);
      else if (sizes[file] <= LIMIT) console.log(`${file}: ${sizes[file]} lines, needs no entry.`);
    }
    write(recorded(sizes, current, named));
  }

  const problems = sizeProblems(sizes, current);
  for (const message of problems) console.error(message);
  console.log(`${files.length} files, ${Object.keys(current.allowances).length} recorded above ${LIMIT} lines, ${files.filter((file) => isExempt(file, current)).length} exempt`);
  if (problems.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) main(process.argv.slice(2));
