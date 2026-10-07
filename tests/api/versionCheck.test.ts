import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve('scripts/api-version-check.js');
const VERSION_FILE = 'api-report/src/api/version.d.ts';
const TYPES_FILE = 'api-report/src/api/types/api.d.ts';

function gitIn(dir: string): (...args: string[]) => void {
  return (...args) => { execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, stdio: 'ignore' }); };
}

/** Writes the report tree: the version file and one types file; staged, as the check reads the index. */
function writeReport(dir: string, version: string, body: string): void {
  for (const [file, text] of [[VERSION_FILE, `export declare const API_VERSION = "${version}";\n`], [TYPES_FILE, `${body}\n`]] as const) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  gitIn(dir)('add', 'api-report');
}

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'api-check-'));
  const git = gitIn(dir);
  git('init', '-q');
  writeReport(dir, '1.0.0', 'a');
  git('commit', '-qm', 'base');
  git('tag', 'base');
  return dir;
}

function run(dir: string, env: Record<string, string>): { status: number | null; stderr: string } {
  const clean = { ...process.env, ...env };
  if (!('API_BASE_REF' in env)) delete clean.API_BASE_REF;
  if (!('API_CHECK_SKIP' in env)) delete clean.API_CHECK_SKIP;
  const result = spawnSync('node', [script], { cwd: dir, env: clean, encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
}

describe('api-version-check', () => {
  it('fails closed when API_BASE_REF is missing and no release tag is reachable', () => {
    const result = run(repo(), {});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no Atlas release tag is reachable');
  });

  it('compares against the latest release tag when API_BASE_REF is missing, so changes before a release share one version', () => {
    const dir = repo();
    const git = gitIn(dir);
    git('tag', '0.6.0');
    // A first change after the release bumps the version; a second one before the next release keeps it.
    writeReport(dir, '1.1.0', 'b');
    git('commit', '-qm', 'first change');
    expect(run(dir, {}).status).toBe(0);
    writeReport(dir, '1.1.0', 'c');
    git('commit', '-qm', 'second change');
    expect(run(dir, {}).status).toBe(0);
    // An unbumped change against the release fails.
    writeReport(dir, '1.0.0', 'd');
    const failed = run(dir, {});
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain('against 0.6.0');
  });

  it('takes release tags only, never a beta tag', () => {
    const dir = repo();
    const git = gitIn(dir);
    git('tag', '0.6.0');
    writeReport(dir, '1.1.0', 'b');
    git('commit', '-qm', 'change');
    git('tag', '0.6.1-beta.0');
    writeReport(dir, '1.1.0', 'c');
    // Against the beta this would be an unbumped change; against 0.6.0 it is the same 1.1.0.
    expect(run(dir, {}).status).toBe(0);
  });

  it('fails closed when the base ref cannot be resolved', () => {
    const result = run(repo(), { API_BASE_REF: 'origin/nowhere' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cannot resolve origin/nowhere');
  });

  it('skips only with an explicit API_CHECK_SKIP=1', () => {
    expect(run(repo(), { API_CHECK_SKIP: '1' }).status).toBe(0);
  });

  it('passes when nothing changed, and fails when any file of the tree changed without a version bump', () => {
    const dir = repo();
    expect(run(dir, { API_BASE_REF: 'base' }).status).toBe(0);
    writeReport(dir, '1.0.0', 'b');
    expect(run(dir, { API_BASE_REF: 'base' }).status).toBe(1);
    writeReport(dir, '1.1.0', 'b');
    expect(run(dir, { API_BASE_REF: 'base' }).status).toBe(0);
  });

  it('counts a file added to or removed from the tree as a change', () => {
    const dir = repo();
    mkdirSync(join(dir, 'api-report/src/app'), { recursive: true });
    writeFileSync(join(dir, 'api-report/src/app/types.d.ts'), 'export type X = 1;\n');
    gitIn(dir)('add', 'api-report');
    expect(run(dir, { API_BASE_REF: 'base' }).status).toBe(1);
    gitIn(dir)('rm', '-q', '--cached', 'api-report/src/app/types.d.ts');
    expect(run(dir, { API_BASE_REF: 'base' }).status).toBe(0);
    gitIn(dir)('rm', '-q', '--cached', TYPES_FILE);
    rmSync(join(dir, TYPES_FILE));
    expect(run(dir, { API_BASE_REF: 'base' }).status).toBe(1);
  });

  it('reads the report as staged, not a regenerated copy in the working tree', () => {
    const dir = repo();
    writeFileSync(join(dir, TYPES_FILE), 'regenerated\n');
    expect(run(dir, { API_BASE_REF: 'base' }).status).toBe(0);
  });

  it('passes when the base commit holds no report yet (the first API PR)', () => {
    const dir = repo();
    const git = gitIn(dir);
    git('checkout', '-q', '--orphan', 'other');
    git('rm', '-rqf', '.');
    writeFileSync(join(dir, 'x'), 'x');
    git('add', 'x');
    git('commit', '-qm', 'noreport');
    git('tag', 'noreport');
    writeReport(dir, '1.0.0', 'a');
    expect(run(dir, { API_BASE_REF: 'noreport' }).status).toBe(0);
  });

  it('compares with a base that still holds the single-file report: a change unless the version moved', () => {
    const dir = repo();
    const git = gitIn(dir);
    git('checkout', '-q', '--orphan', 'legacy');
    git('rm', '-rqf', '.');
    mkdirSync(join(dir, 'api-report'), { recursive: true });
    writeFileSync(join(dir, 'api-report/atlas-vtt-api.d.ts'), 'export declare const API_VERSION = "1.0.0";\na\n');
    git('add', 'api-report');
    git('commit', '-qm', 'legacy');
    git('tag', 'legacy-base');
    git('rm', '-rqf', 'api-report');
    writeReport(dir, '1.0.0', 'a');
    expect(run(dir, { API_BASE_REF: 'legacy-base' }).status).toBe(1);
    writeReport(dir, '1.1.0', 'a');
    expect(run(dir, { API_BASE_REF: 'legacy-base' }).status).toBe(0);
  });
});
