import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const { readReleases, readPendingNotes, pendingRelease, generateChangelog, validateBuild, stampBuild, formatRelease, formatPrerelease } = createRequire(import.meta.url)('../../scripts/changelog.js');
const roots: string[] = [];
function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-changelog-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'changelog'));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ version: '0.1.10', minAppVersion: '1.8.7' }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.1.10' }));
  return root;
}
function note(root: string, version: string, date = '2026-09-20', body = '## Fixed\n\n- Saved scenes keep their changes.'): void {
  fs.writeFileSync(path.join(root, 'changelog', `${version}.md`), `---\nversion: ${version}\ndate: ${date}\ntitle: Scene updates\n---\n\n${body}\n`);
}
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

describe('bundled changelog', () => {
  it('sorts versions numerically and excludes future and unreleased notes', () => {
    const root = fixture();
    note(root, '0.1.9'); note(root, '0.1.10'); note(root, '0.2.0');
    fs.writeFileSync(path.join(root, 'changelog', 'Unreleased.md'), '## New\n\n- Future feature.');
    expect(readReleases(root, '0.1.10').map((entry: { version: string }) => entry.version)).toEqual(['0.1.10', '0.1.9']);
  });
  it('rejects a missing installed-version entry', () => {
    const root = fixture(); note(root, '0.1.9');
    expect(() => readReleases(root, '0.1.10')).toThrow(/0.1.10/);
  });
  it('bundles the notes up to the targeted release for beta builds without requiring its file', () => {
    const root = fixture(); note(root, '0.1.9'); note(root, '0.1.10'); note(root, '0.2.0');
    const versions = (entries: Array<{ version: string }>) => entries.map(entry => entry.version);
    expect(versions(readReleases(root, '0.1.11-beta.1'))).toEqual(['0.1.10', '0.1.9']);
    expect(versions(readReleases(root, '0.2.0-beta.2'))).toEqual(['0.2.0', '0.1.10', '0.1.9']);
    expect(() => readReleases(root, '0.2.0-rc.1')).toThrow(/invalid version/i);
  });
  it('turns pending notes into beta release notes and validates their headings', () => {
    const root = fixture();
    const pending = path.join(root, 'changelog', 'Unreleased.md');
    expect(readPendingNotes(root)).toBe('');
    expect(formatPrerelease('0.2.0-beta.1', '')).toContain('No player-facing changes');
    fs.writeFileSync(pending, '## New\n\n- Future feature.\n');
    expect(readPendingNotes(root)).toBe('## New\n\n- Future feature.');
    const notes = formatPrerelease('0.2.0-beta.1', readPendingNotes(root));
    expect(notes).toContain('# Atlas VTT 0.2.0-beta.1');
    expect(notes).toContain('ahead of 0.2.0');
    expect(notes).toContain('- Future feature.');
    fs.writeFileSync(pending, '### Validation\n\n- 500 tests passed.');
    expect(() => readPendingNotes(root)).toThrow(/heading/i);
  });
  it('bundles pending notes as the beta build itself and keeps them out of the published history', () => {
    const root = fixture(); note(root, '0.1.10');
    fs.writeFileSync(path.join(root, 'changelog', 'Unreleased.md'), '## New\n\n- Preview feature.\n');
    expect(pendingRelease(root, '0.1.10')).toBeNull();
    expect(pendingRelease(root, '0.1.11-beta.1')).toEqual({ version: '0.1.11-beta.1', title: 'Coming in 0.1.11', markdown: '## New\n\n- Preview feature.' });
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ version: '0.1.11-beta.1', minAppVersion: '1.8.7' }));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.1.11-beta.1' }));
    const bundle = generateChangelog(root);
    expect(bundle.releases.map((entry: { version: string }) => entry.version)).toEqual(['0.1.11-beta.1', '0.1.10']);
    expect(bundle.releases[0].date).toBeUndefined();
    expect(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')).not.toContain('Preview feature');
    fs.writeFileSync(path.join(root, 'changelog', 'Unreleased.md'), '');
    expect(generateChangelog(root).releases.map((entry: { version: string }) => entry.version)).toEqual(['0.1.10']);
  });
  it.each(['2026-02-30', 'yesterday'])('rejects invalid dates: %s', date => {
    const root = fixture(); note(root, '0.1.10', date);
    expect(() => readReleases(root, '0.1.10')).toThrow(/date/i);
  });
  it('rejects duplicate/misnamed release files', () => {
    const root = fixture(); note(root, '0.1.10');
    fs.copyFileSync(path.join(root, 'changelog/0.1.10.md'), path.join(root, 'changelog/copy.md'));
    expect(() => readReleases(root, '0.1.10')).toThrow(/filename|duplicate/i);
  });
  it('rejects headings deeper than categories, empty headings and empty release bodies', () => {
    const root = fixture(); note(root, '0.1.10', undefined, '### Validation\n\n- 500 tests passed.');
    expect(() => readReleases(root, '0.1.10')).toThrow(/heading/i);
    note(root, '0.1.10', undefined, '## \n\n- 500 tests passed.');
    expect(() => readReleases(root, '0.1.10')).toThrow(/heading/i);
    note(root, '0.1.10', undefined, '');
    expect(() => readReleases(root, '0.1.10')).toThrow(/empty/i);
  });
  it('rejects dates that go backwards with increasing versions', () => {
    const root = fixture(); note(root, '0.1.9', '2026-09-21'); note(root, '0.1.10');
    expect(() => readReleases(root, '0.1.10')).toThrow(/order/i);
  });
  it('generates matching offline/history content and detects stale checked-in output', () => {
    const root = fixture(); note(root, '0.1.10');
    generateChangelog(root);
    const bundle = JSON.parse(fs.readFileSync(path.join(root, 'src/app/changelog/releases.json'), 'utf8'));
    expect(bundle.version).toBe('0.1.10');
    expect(bundle.releases[0].markdown).toContain('Saved scenes');
    expect(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')).toContain('0.1.10');
    expect(() => generateChangelog(root, { check: true })).not.toThrow();
    note(root, '0.1.10', undefined, '## New\n\n- New feature.');
    expect(() => generateChangelog(root, { check: true })).toThrow(/stale/i);
  });
  it('refuses release assets without matching build provenance', () => {
    const root = fixture(); note(root, '0.1.10'); generateChangelog(root);
    fs.mkdirSync(path.join(root, 'dist'));
    fs.writeFileSync(path.join(root, 'dist/main.js'), 'old plugin');
    fs.writeFileSync(path.join(root, 'dist/styles.css'), '');
    expect(() => validateBuild(root)).toThrow(/build/i);
  });
  it('validates the built assets and rejects edits to bundled notes or assets after building', () => {
    const root = fixture(); note(root, '0.1.10');
    const bundle = generateChangelog(root);
    fs.mkdirSync(path.join(root, 'dist'));
    fs.writeFileSync(path.join(root, 'dist/main.js'), 'plugin build');
    fs.writeFileSync(path.join(root, 'dist/styles.css'), 'plugin styles');
    stampBuild(root);
    expect(() => validateBuild(root)).not.toThrow();
    expect(formatRelease(bundle.releases[0])).toContain(bundle.releases[0].markdown);
    fs.appendFileSync(path.join(root, 'dist/main.js'), 'changed');
    expect(() => validateBuild(root)).toThrow(/stale build/i);
    stampBuild(root);
    note(root, '0.1.10', undefined, '## New\n\n- A new capability.');
    generateChangelog(root);
    expect(() => validateBuild(root)).toThrow(/stale build/i);
  });
  it('nests group and category headings under each release in the history and the release body', () => {
    const root = fixture();
    note(root, '0.1.9', '2026-09-19');
    note(root, '0.1.10', undefined, "# What's New\n## New Feature: Online Play\n- Tables.\n# What's Fixed / Improved\n\n- Fog.");
    const bundle = generateChangelog(root);
    const history = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    expect(history).toContain("### What's New\n#### New Feature: Online Play\n- Tables.\n### What's Fixed / Improved");
    expect(history).toContain('### Fixed\n\n- Saved scenes keep their changes.');
    expect(formatRelease(bundle.releases[0])).toContain("\n## What's New\n### New Feature: Online Play\n");
    expect(formatRelease(bundle.releases[1])).toContain('\n## Fixed\n');
    expect(formatPrerelease('0.2.0-beta.1', "# What's New\n\n- Tables.")).toContain("\n## What's New\n");
  });
});
