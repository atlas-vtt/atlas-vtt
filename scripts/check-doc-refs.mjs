// Every file and directory that AGENTS.md names must exist.
// Run by `npm run check` and `npm run verify`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCUMENTS = ['AGENTS.md'];

const SOURCE_EXTENSIONS = ['ts', 'tsx', 'mts', 'mjs', 'js', 'cjs', 'scss', 'json', 'md', 'yml'];

/** Where a path written without its root may start. */
const ROOTS = ['', 'src/app/', 'src/'];

/** A path in a vault or a build's output, never in the repository. Each entry says what it is. */
const NOT_IN_REPOSITORY = new Map([
  ['data.json', "the plugin's settings file in a vault"],
  ['library.json', "a vault's library file"],
  ['collection.json', "a collection's record in its vault folder"],
  ['install.json', "a collection's install record in its vault folder"],
  ['campaign.json', "a campaign's file in its vault folder"],
  ['characters.json', "a campaign's character values in its vault folder"],
  ['main.js', 'build output'],
  ['loot-history/', "a collection's vault folder"],
]);

/** Vault folders Atlas writes into: paths below them are vault paths. */
const VAULT_ROOTS = ['atlas-vtt/', '.atlas-data/'];

/** Packages, whose modules are named like paths (`vitest/browser`, `pixi.js`). */
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const PACKAGES = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]);

const PLACEHOLDER = /[<>*{}…]/u;
const PATH_CHARACTERS = /^[\w@.\-/]+$/u;
const OUTSIDE_REPOSITORY = /^(~|\/(Users|home)\/)/u;

function listed(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);
}

const files = listed(['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
const fileSet = new Set(files);
const directories = new Set();
const baseNames = new Set();
for (const file of files) {
  baseNames.add(posix.basename(file));
  for (let dir = posix.dirname(file); dir !== '.'; dir = posix.dirname(dir)) directories.add(dir);
}
const directoryList = [...directories];

function isFile(path) {
  if (ROOTS.some((root) => fileSet.has(root + path))) return true;
  if (!path.includes('/')) return baseNames.has(path);
  return files.some((file) => file.endsWith(`/${path}`));
}

function isDirectory(path) {
  if (ROOTS.some((root) => directories.has(root + path))) return true;
  return directoryList.some((dir) => dir.endsWith(`/${path}`));
}

function exists(token) {
  const path = token.replace(/^\.\//u, '');
  if (path.endsWith('/')) return isDirectory(path.slice(0, -1));
  return isFile(path) || isDirectory(path);
}

/** Whether a backticked token reads as a path of this repository. */
function isRepositoryPath(token) {
  if (/\s/u.test(token) || PLACEHOLDER.test(token) || token.includes('://')) return false;
  if (!PATH_CHARACTERS.test(token) || !/[a-z]/iu.test(token)) return false;
  if (VAULT_ROOTS.some((root) => token.startsWith(root))) return false;
  if (NOT_IN_REPOSITORY.has(token)) return false;
  if (PACKAGES.has(token.split('/').slice(0, token.startsWith('@') ? 2 : 1).join('/'))) return false;
  const extension = /\.([a-z]+)$/u.exec(token)?.[1];
  return token.includes('/') || (extension !== undefined && SOURCE_EXTENSIONS.includes(extension));
}

const problems = [];

function checkDocument(document) {
  const lines = readFileSync(join(ROOT, document), 'utf8').split('\n');
  let fenced = false;
  lines.forEach((line, index) => {
    if (line.trimStart().startsWith('```')) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const at = `${document}:${index + 1}`;
    for (const [, token] of line.matchAll(/`([^`]+)`/gu)) {
      if (OUTSIDE_REPOSITORY.test(token)) {
        problems.push(`${at}: \`${token}\` is a path outside the repository`);
      } else if (isRepositoryPath(token) && !exists(token)) {
        problems.push(`${at}: \`${token}\` names nothing in the repository`);
      }
    }
    for (const [, target] of line.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/gu)) {
      if (target.includes('://') || target.startsWith('mailto:')) continue;
      const resolved = posix.normalize(posix.join(posix.dirname(document), target));
      if (!fileSet.has(resolved) && !directories.has(resolved.replace(/\/$/u, ''))) {
        problems.push(`${at}: \`${target}\` names nothing in the repository`);
      }
    }
  });
}

for (const document of DOCUMENTS) checkDocument(document);

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} reference${problems.length === 1 ? '' : 's'} to fix in ${DOCUMENTS.join(', ')}.`);
  process.exit(1);
}
console.log(`${DOCUMENTS.join(', ')}: every path it names exists.`);
