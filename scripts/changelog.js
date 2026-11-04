const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { parseVersion } = require('./release-channel');

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PENDING_FILE = 'changelog/Unreleased.md';
const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const compare = (a, b) => a.localeCompare(b, 'en', { numeric: true });

/** Notes hold bullets under `#` group and `##` category headings of any name, nothing deeper. */
function validateNotes(markdown, label) {
  if (!markdown || !/^- \S/m.test(markdown)) throw new Error(`${label}: empty release notes`);
  for (const heading of markdown.matchAll(/^(#+) (.*)$/gm)) {
    if (heading[1].length > 2 || !heading[2].trim()) throw new Error(`${label}: unsupported heading ${heading[0]}`);
  }
}

/** The notes with their headings moved so the highest stands at `level`, under a heading of the level above. */
function nestHeadings(markdown, level) {
  const levels = [...markdown.matchAll(/^(#+) /gm)].map(heading => heading[1].length);
  if (!levels.length) return markdown;
  const shift = level - Math.min(...levels);
  return markdown.replace(/^(#+) /gm, (_, hashes) => `${'#'.repeat(hashes.length + shift)} `);
}

function readReleases(root, currentVersion) {
  const { base, channel } = parseVersion(currentVersion);
  const releases = fs.readdirSync(path.join(root, 'changelog'))
    .filter(file => file.endsWith('.md') && file !== 'Unreleased.md')
    .map(file => {
      const source = read(root, `changelog/${file}`).replace(/\r\n/g, '\n');
      const frontmatter = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!frontmatter) throw new Error(`${file}: expected version, date and title frontmatter`);
      const fields = {};
      for (const line of frontmatter[1].split('\n')) {
        const match = line.match(/^(version|date|title): (.+)$/);
        if (!match || fields[match[1]]) throw new Error(`${file}: invalid or duplicate metadata`);
        fields[match[1]] = match[2].trim();
      }
      const { version, date, title } = fields;
      if (!VERSION.test(version) || file !== `${version}.md`) throw new Error(`${file}: invalid version or filename`);
      const parsedDate = new Date(`${date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
        throw new Error(`${file}: invalid release date`);
      }
      if (!title) throw new Error(`${file}: missing title`);
      const markdown = frontmatter[2].trim();
      validateNotes(markdown, file);
      return { version, date, title, markdown };
    })
    .sort((a, b) => compare(b.version, a.version));
  for (let index = 1; index < releases.length; index++) {
    if (releases[index].date > releases[index - 1].date) throw new Error('Release dates are out of version order');
  }
  if (channel === 'stable' && !releases.some(release => release.version === base)) {
    throw new Error(`Missing changelog for ${base}`);
  }
  return releases.filter(release => compare(release.version, base) <= 0);
}

/** Notes collected for the next stable release; beta builds ship these as their release notes. */
function readPendingNotes(root) {
  const file = path.join(root, PENDING_FILE);
  const markdown = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim() : '';
  if (markdown) validateNotes(markdown, PENDING_FILE);
  return markdown;
}

/** Beta builds carry the pending notes as their own entry so testers can read what changed. */
function pendingRelease(root, version) {
  const { base, channel } = parseVersion(version);
  const markdown = channel === 'beta' ? readPendingNotes(root) : '';
  return markdown ? { version, title: `Coming in ${base}`, markdown } : null;
}

function formatRelease(release) {
  return `# Atlas VTT ${release.version} — ${release.title}\n\n${release.date}\n\n${nestHeadings(release.markdown, 2)}\n`;
}

function formatPrerelease(version, pendingNotes) {
  const { base } = parseVersion(version);
  const notes = pendingNotes ? nestHeadings(pendingNotes, 2) : '- No player-facing changes recorded yet.';
  return `# Atlas VTT ${version} — Beta build\n\nPre-release build for testing ahead of ${base}. Install it through BRAT; it is not published to the Obsidian community directory.\n\n${notes}\n`;
}

function generateChangelog(root, { check = false } = {}) {
  const manifest = JSON.parse(read(root, 'manifest.json'));
  const pkg = JSON.parse(read(root, 'package.json'));
  if (manifest.version !== pkg.version) throw new Error('Manifest/package version mismatch');
  const releases = readReleases(root, manifest.version);
  const pending = pendingRelease(root, manifest.version);
  const bundle = { version: manifest.version, releases: pending ? [pending, ...releases] : releases };
  const outputs = {
    'src/app/changelog/releases.json': `${JSON.stringify(bundle, null, 2)}\n`,
    'CHANGELOG.md': '# Atlas VTT changelog\n\n<!-- Generated from changelog/*.md. Run npm run changelog:generate. -->\n\n' +
      releases.map(release => `## ${release.version} — ${release.title}\n\n${release.date}\n\n${nestHeadings(release.markdown, 3)}\n`).join('\n'),
  };
  for (const [file, content] of Object.entries(outputs)) {
    const destination = path.join(root, file);
    const existing = fs.existsSync(destination) ? read(root, file) : null;
    if (existing === content) continue;
    if (check) throw new Error(`Stale generated changelog: ${file}. Run npm run changelog:generate.`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
  return bundle;
}

function buildFingerprint(root) {
  return {
    manifest: hash(read(root, 'manifest.json')),
    notes: hash(read(root, 'src/app/changelog/releases.json')),
    main: hash(read(root, 'dist/main.js')),
    styles: hash(read(root, 'dist/styles.css')),
  };
}

function stampBuild(root) {
  fs.writeFileSync(path.join(root, 'dist/atlas-build.json'), JSON.stringify(buildFingerprint(root), null, 2) + '\n');
}

function validateBuild(root) {
  generateChangelog(root, { check: true });
  const stamp = path.join(root, 'dist/atlas-build.json');
  if (!fs.existsSync(stamp)) throw new Error('Missing build metadata. Run npm run build:ci.');
  const expected = JSON.parse(fs.readFileSync(stamp, 'utf8'));
  const actual = buildFingerprint(root);
  if (Object.keys(actual).some(key => actual[key] !== expected[key])) {
    throw new Error('Stale build: manifest, notes or assets changed. Run npm run build:ci.');
  }
}

module.exports = { readReleases, readPendingNotes, pendingRelease, generateChangelog, formatRelease, formatPrerelease, stampBuild, validateBuild };

if (require.main === module) {
  try {
    generateChangelog(path.resolve(__dirname, '..'), { check: process.argv.includes('--check') });
    console.log('Changelog validated' + (process.argv.includes('--check') ? '' : ' and generated'));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
