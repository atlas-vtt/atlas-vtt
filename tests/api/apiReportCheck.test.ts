import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve('scripts/api-report-check.js');

function write(dir: string, file: string, text: string): void {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
}

/** A repository on `main` with Atlas sources, a committed report of them, and a branch `change` checked out. */
function repo(): { dir: string; git: (...args: string[]) => void; commit: (file: string, text: string) => void } {
  const dir = mkdtempSync(join(tmpdir(), 'api-report-check-'));
  const git = (...args: string[]): void => { execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, stdio: 'ignore' }); };
  git('init', '-q', '-b', 'main');
  for (const [file, text] of [
    ['src/api/public.ts', 'export {};\n'], ['src/app/types.ts', 'export type Token = { id: string };\n'], ['src/app/other.ts', 'export {};\n'],
    ['api-report/src/api/public.d.ts', 'export {};\n'], ['api-report/src/app/types.d.ts', 'export type Token = { id: string };\n'],
  ] as const) write(dir, file, text);
  git('add', '.');
  git('commit', '-qm', 'base');
  git('checkout', '-qb', 'change');
  const commit = (file: string, text: string): void => { write(dir, file, text); git('add', file); git('commit', '-qm', file); };
  return { dir, git, commit };
}

/** What `npm run api:report` would leave: the report regenerated in the working tree. */
const regenerate = (dir: string): void => { write(dir, 'api-report/src/app/types.d.ts', 'export type Token = { id: string; name: string };\n'); };

function run(dir: string, env: Record<string, string> = {}): { status: number | null; out: string } {
  const clean = { ...process.env, ...env };
  if (!('API_CHANGES_BASE' in env)) delete clean.API_CHANGES_BASE;
  const result = spawnSync('node', [script], { cwd: dir, env: clean, encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe('api-report-check', () => {
  it('passes when the regenerated report is the committed one', () => {
    const { dir } = repo();
    expect(run(dir, { API_CHANGES_BASE: 'main' }).status).toBe(0);
    expect(run(dir).status).toBe(0);
  });

  it('only informs when the change touches nothing of the API', () => {
    const { dir, commit } = repo();
    commit('src/app/other.ts', 'export const x = 1;\n');
    regenerate(dir);
    const result = run(dir, { API_CHANGES_BASE: 'main' });
    expect(result.status).toBe(0);
    expect(result.out).toContain('informational');
    expect(result.out).toContain('api-report/src/app/types.d.ts');
  });

  it('fails when the change touches src/api', () => {
    const { dir, commit } = repo();
    commit('src/api/public.ts', 'export const y = 1;\n');
    regenerate(dir);
    const result = run(dir, { API_CHANGES_BASE: 'main' });
    expect(result.status).toBe(1);
    expect(result.out).toContain('touches the API');
  });

  it('fails when the change touches a source file the report includes', () => {
    const { dir, commit } = repo();
    commit('src/app/types.ts', 'export type Token = { id: string; name: string };\n');
    regenerate(dir);
    expect(run(dir, { API_CHANGES_BASE: 'main' }).status).toBe(1);
  });

  it('counts a new file in the regenerated tree as out of date', () => {
    const { dir, commit } = repo();
    commit('src/api/public.ts', 'export const y = 1;\n');
    write(dir, 'api-report/src/app/added.d.ts', 'export {};\n');
    const result = run(dir, { API_CHANGES_BASE: 'main' });
    expect(result.status).toBe(1);
    expect(result.out).toContain('added.d.ts');
  });

  it('fails without a base to compare with, as locally, and when the base cannot be read', () => {
    const { dir, commit } = repo();
    commit('src/app/other.ts', 'export const x = 1;\n');
    regenerate(dir);
    expect(run(dir).status).toBe(1);
    const unknown = run(dir, { API_CHANGES_BASE: 'origin/nowhere' });
    expect(unknown.status).toBe(1);
    expect(unknown.out).toContain('cannot compare with origin/nowhere');
  });
});
