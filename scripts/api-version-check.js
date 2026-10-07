// Fails when the API report (the `api-report/` tree, as committed or staged) changed against the base but API_VERSION
// did not. The base is API_BASE_REF when it is set, else the latest Atlas release tag (x.y.z, no betas) reachable from
// HEAD: the API version then moves once per Atlas release, so every change merged before the next release shares one
// version (docs/extension-api.md, Semver rules). A base that holds no report is the first API change: nothing to compare.
const { execFileSync } = require('child_process');

const REPORT_DIR = 'api-report';
const VERSION_LINE = /^export declare const API_VERSION = "([^"]+)";$/m;
const RELEASE_TAG = /^\d+\.\d+\.\d+$/;

if (process.env.API_CHECK_SKIP === '1') {
  console.warn('API_CHECK_SKIP=1: the API version check is skipped. Meant for local use only; CI must not set it.');
  process.exit(0);
}
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
}
function fail(message) {
  console.error(`api-version-check: ${message} (set API_CHECK_SKIP=1 to skip locally.)`);
  process.exit(1);
}
/** The newest x.y.z tag reachable from HEAD, betas left out; null for none. */
function latestRelease() {
  try {
    return git(['tag', '--merged', 'HEAD', '--sort=-v:refname']).split('\n').map((tag) => tag.trim()).find((tag) => RELEASE_TAG.test(tag)) ?? null;
  } catch {
    return null;
  }
}
const base = process.env.API_BASE_REF || latestRelease();
if (!base) fail('no Atlas release tag is reachable from HEAD and API_BASE_REF is not set. Fetch the tags (actions/checkout needs fetch-depth: 0), or name the ref to compare against, for example API_BASE_REF=origin/beta.');
try {
  git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
} catch {
  fail(`cannot resolve ${base}. Fetch it, and check the clone is not shallow (actions/checkout needs fetch-depth: 0).`);
}

const lines = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean);
/** The report's files at `ref` (or staged, for ':'), path to text with `\n` line ends. */
function reportAt(ref) {
  const paths = ref === ':' ? lines(git(['ls-files', '--', REPORT_DIR])) : lines(git(['ls-tree', '-r', '--name-only', ref, '--', REPORT_DIR]));
  return new Map(paths.sort().map((path) => [path, git(['show', `${ref === ':' ? '' : ref}:${path}`]).replace(/\r\n/g, '\n')]));
}
const versionOf = (report) => [...report.values()].map((text) => text.match(VERSION_LINE)?.[1]).find(Boolean);
const withoutVersion = (report) => [...report].map(([path, text]) => `${path}\n${text.replace(VERSION_LINE, '')}`).join('\n\0\n');

const head = reportAt(':');
const before = reportAt(base);
if (before.size === 0) process.exit(0);
if (head.size === 0) fail('api-report/ is not committed. Run npm run api:report and commit it.');
const headVersion = versionOf(head);
const baseVersion = versionOf(before);
if (withoutVersion(head) !== withoutVersion(before) && headVersion === baseVersion) {
  console.error(`The extension API changed against ${base} but API_VERSION is still ${headVersion}. Bump src/api/version.ts (docs/extension-api.md).`);
  process.exit(1);
}
