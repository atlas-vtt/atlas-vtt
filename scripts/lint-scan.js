#!/usr/bin/env node
/**
 * Runs ESLint the way Obsidian's community directory does (see
 * eslint.scanner.mjs) and fails on fatal messages, i.e. files ESLint could not
 * parse or place in a TypeScript project. Rule findings are reported as a
 * count only; they surface as scorecard warnings, not review errors.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

// ESLint auto-loads this file from the working directory. The directory review
// runs a different rule set, so a suppression it does not use would make its
// run exit 2 ("There are suppressions left that do not occur anymore").
if (require('fs').existsSync(path.join(root, 'eslint-suppressions.json'))) {
  console.error('eslint-suppressions.json must not exist at the repository root; use eslint.suppressions.json with --suppressions-location.');
  process.exit(1);
}
const eslint = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
const result = spawnSync(eslint, ['--no-config-lookup', '--config', 'eslint.scanner.mjs', '--format', 'json', '.'], {
  cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32',
  // Type-aware linting of the whole repository outgrew Node's default 4 GB heap (about 6 GB at 5,500 files).
  env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=8192`.trim() },
});
if (result.error || !result.stdout.trim().startsWith('[')) {
  console.error(result.stderr || result.error?.message || 'ESLint produced no report');
  process.exit(2);
}

const files = JSON.parse(result.stdout);
const fatal = files.flatMap(file => file.messages.filter(m => m.fatal).map(m => `${path.relative(root, file.filePath)}: ${m.message}`));
const findings = files.reduce((sum, file) => sum + file.messages.filter(m => !m.fatal).length, 0);
console.log(`Scanner-style lint: ${files.length} files, ${findings} finding(s), ${fatal.length} fatal`);
for (const line of fatal) console.error(`  ${line}`);
process.exit(fatal.length ? 1 : 0);
