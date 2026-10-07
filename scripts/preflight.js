#!/usr/bin/env node
// Local approximation of the Obsidian community directory review.
// Errors mirror findings that block a listing, plus the build's own font licence checks;
// warnings mirror the scorecard.
// Run after a production build: `npm run build:ci && npm run preflight`.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { parseVersion } = require('./release-channel');
const { fontNoticeProblems, fontFaceCountProblems, scriptFontProblems } = require('./font-notices');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const errors = [];
const warnings = [];

// --- Manifest and versions -------------------------------------------------
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));
const allowedKeys = ['id', 'name', 'version', 'minAppVersion', 'description', 'author', 'authorUrl', 'fundingUrl', 'isDesktopOnly', 'helpUrl'];

for (const key of ['id', 'name', 'version', 'minAppVersion', 'description', 'author', 'isDesktopOnly']) {
  if (manifest[key] === undefined || manifest[key] === '') errors.push(`manifest.${key} is missing or empty`);
}
for (const key of Object.keys(manifest)) {
  if (!allowedKeys.includes(key)) errors.push(`manifest.${key} is not a manifest field`);
  if (manifest[key] === '') errors.push(`manifest.${key} is an empty string; remove it`);
}
if (/obsidian/i.test(manifest.id) || /plugin$/i.test(manifest.id)) errors.push('manifest.id must not contain "obsidian" or end with "plugin"');
if (/obsidian/i.test(manifest.name)) errors.push('manifest.name must not contain "Obsidian"');
let channel = null;
try {
  channel = parseVersion(manifest.version).channel;
} catch {
  errors.push('manifest.version must be x.y.z (stable) or x.y.z-beta.N (beta channel)');
}
const description = manifest.description || '';
if (/obsidian/i.test(description)) errors.push('manifest.description must not contain "Obsidian"');
if (description.length > 250) errors.push('manifest.description is longer than 250 characters');
if (!description.endsWith('.')) errors.push('manifest.description must end with a period');
if (/\p{Extended_Pictographic}/u.test(description)) errors.push('manifest.description must not contain emoji');
if (pkg.version !== manifest.version) errors.push(`package.json version ${pkg.version} != manifest version ${manifest.version}`);
if (exists('versions.json')) {
  const versions = JSON.parse(read('versions.json'));
  // Beta versions stay out of versions.json; only stable releases are installable from the directory.
  if (channel === 'stable' && versions[manifest.version] !== manifest.minAppVersion) errors.push('versions.json does not map the current version to minAppVersion');
  if (channel === 'beta' && manifest.version in versions) errors.push('versions.json must not list beta versions');
}
if (!pkg.scripts || !pkg.scripts.build) errors.push('package.json needs a "build" script for build verification');

// --- Required files --------------------------------------------------------
for (const file of ['README.md', 'LICENSE', 'package-lock.json']) {
  if (!exists(file)) errors.push(`${file} is missing`);
}
if (exists('README.md') && /\[Add .* information\]/i.test(read('README.md'))) errors.push('README.md still contains placeholder text');

// --- Files the scanner would treat as plugin source -------------------------
// The scanner ignores these patterns and nothing else; project ESLint ignores are not honoured.
const ignored = /(^|\/)(node_modules|dist|build|pkg|test-vault|\.obsidian|automation|tests?|__tests__|testUtils|e2e-tests|mocks|__mocks__|vite|scripts|docs|i18n|i18next|locales?|translations|l10n)\/|\.(test|tests|spec|specs)\.|\.(cjs|mjs|cts|mts)$/;
const tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
for (const file of tracked) {
  if (!/\.(ts|tsx|js|jsx)$/.test(file) || ignored.test(file)) continue;
  if (file !== 'main.ts' && !file.startsWith('src/')) warnings.push(`${file} will be scanned as plugin source; move it under scripts/ or use .mjs/.cjs/.mts`);
}

// --- Built bundle ------------------------------------------------------------
if (!exists('dist/main.js')) {
  errors.push('dist/main.js is missing; run the production build first');
} else {
  const bundle = read('dist/main.js');
  const blocking = {
    'shell execution (child_process)': /child_process/,
    'eval()': /[^.\w]eval\(/,
    'runtime script-element creation': /\.createElement\(\s*["']script["']/,
    'source map': /sourceMappingURL=/,
    'absolute local path': /\/Users\/|[A-Z]:\\\\Users\\\\/,
  };
  const scorecard = {
    'Function constructor': /new Function\(/,
    'Node fs access': /require\(["']fs["']\)/,
    'innerHTML': /\.innerHTML\s*=/,
    'WebSocket': /new WebSocket\(/,
    'XMLHttpRequest': /new XMLHttpRequest\(/,
    'clipboard access': /navigator\.clipboard/,
    'localStorage': /localStorage\./,
  };
  for (const [label, pattern] of Object.entries(blocking)) if (pattern.test(bundle)) errors.push(`dist/main.js contains ${label}`);
  for (const [label, pattern] of Object.entries(scorecard)) if (pattern.test(bundle)) warnings.push(`dist/main.js contains ${label}`);
  for (const problem of scriptFontProblems(bundle)) errors.push(`dist/main.js ${problem}`);
  const hosts = [...new Set((bundle.match(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) || []))]
    .filter((host) => !/w3\.org|reactjs\.org|react\.dev|github\.com|mozilla\.org|pixijs\.(com|download|io)|radix-ui\.com|lucide\.dev|fb\.me|feross\.org|howlerjs\.com|goldfirestudios\.com|motion\.dev|example\.com|bit\.ly|stuartk\.com|stuk\.github\.io/.test(host));
  if (hosts.length) warnings.push(`dist/main.js references hosts that must be disclosed in README: ${hosts.join(', ')}`);
  if (Buffer.byteLength(bundle) > 5 * 1024 * 1024) warnings.push('dist/main.js is larger than 5 MB');
}
if (exists('dist/styles.css')) {
  const css = read('dist/styles.css');
  const important = (css.match(/!important/g) || []).length;
  const has = (css.match(/:has\(/g) || []).length;
  if (important) warnings.push(`styles.css uses !important ${important} times`);
  if (has) warnings.push(`styles.css uses :has() ${has} times`);
  // styles.css is the only copy of the fonts users get, so it must carry their notice and hold only the fonts the list names.
  for (const problem of [...fontNoticeProblems(css), ...fontFaceCountProblems(css)]) errors.push(`styles.css: ${problem}`);
} else {
  errors.push('dist/styles.css is missing');
}

// --- Report ------------------------------------------------------------------
warnings.forEach((message) => console.warn(`warning  ${message}`));
errors.forEach((message) => console.error(`error    ${message}`));
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
