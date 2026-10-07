// Checks that the regenerated API report (`npm run api:report`) matches the committed `api-report/` tree.
//
// The report includes some of Atlas's own record types (tokens, widgets, walls, lights, initiative), so a change to
// those records changes it too. A stale report fails only a change that touches the API: `src/api/`, the report
// itself, or a source file the report includes (its `.d.ts` is in the tree). Any other change only prints the
// difference, so a pull request that never touches the API never fails here; the next API change brings it up to date.
//
// API_CHANGES_BASE names what the change is compared with (CI: the pull request's base branch, or the commit before a
// push). Without it, as locally, a stale report always fails. A base that cannot be compared with fails too.
const { execFileSync } = require('child_process');

const REPORT_DIR = 'api-report';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}
const lines = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean);

/** The report's files that differ from the index, including new and removed ones. */
function staleFiles() {
  const changed = lines(git(['diff', '--name-only', '--', REPORT_DIR]));
  const added = lines(git(['ls-files', '--others', '--exclude-standard', '--', REPORT_DIR]));
  return [...new Set([...changed, ...added])].sort();
}

/** The source files the report is made of: `src/api/` and the source behind each declaration in the tree. */
function touchesTheApi(file, reportFiles) {
  if (file.startsWith('src/api/') || file.startsWith(`${REPORT_DIR}/`)) return true;
  const source = file.replace(/\.(tsx?|mts|d\.ts)$/, '');
  return reportFiles.has(`${REPORT_DIR}/${source}.d.ts`);
}

/** The files the change touches against `base`, or null when they cannot be told. */
function changedFiles(base) {
  try {
    return lines(git(['diff', '--name-only', `${base}...HEAD`]));
  } catch {
    return null;
  }
}

const stale = staleFiles();
if (stale.length === 0) process.exit(0);

const reportFiles = new Set([...lines(git(['ls-files', '--', REPORT_DIR])), ...stale]);
const base = process.env.API_CHANGES_BASE;
const changed = base ? changedFiles(base) : null;
const strict = !base || changed === null || changed.some((file) => touchesTheApi(file, reportFiles));
const diff = git(['diff', '--stat', '--', REPORT_DIR]);
const listing = `${diff}${stale.filter((file) => !diff.includes(file)).map((file) => ` ${file} (new)\n`).join('')}`;

if (strict) {
  const why = !base ? '' : changed === null ? ` (cannot compare with ${base})` : ' and this change touches the API';
  console.error(`api-report-check: api-report/ is out of date${why}. Run npm run api:report and commit the result.\n${listing}`);
  process.exit(1);
}
console.warn(`api-report-check: api-report/ is out of date, but this change does not touch the API, so this is informational. The next API change regenerates it.\n${listing}`);
