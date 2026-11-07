import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const { releaseGateProblem } = createRequire(import.meta.url)('../../scripts/release-gate.js');

const published = { draft: false, prerelease: false, commit: 'abc', assets: ['main.js', 'manifest.json', 'styles.css'] };
const problemWith = (release: unknown): string | null => releaseGateProblem({ mainVersion: '0.12.0', version: '0.12.1', commit: 'abc', release });

describe('the release gate', () => {
  it('lets a new version on main once its release is published from that commit', () => {
    expect(problemWith(published)).toBeNull();
  });

  it('holds a new version whose release does not exist or is a draft', () => {
    expect(problemWith(null)).toMatch(/not published/);
    expect(problemWith({ ...published, draft: true })).toMatch(/not published/);
  });

  it('holds a pull request that moved on from what was released', () => {
    expect(problemWith({ ...published, commit: 'def' })).toMatch(/published from def/);
  });

  it('holds a release Obsidian could not install', () => {
    expect(problemWith({ ...published, prerelease: true })).toMatch(/pre-release/);
    expect(problemWith({ ...published, assets: ['manifest.json'] })).toMatch(/lacks main\.js, styles\.css/);
  });

  it('asks nothing of a pull request that does not change the version', () => {
    expect(releaseGateProblem({ mainVersion: '0.12.0', version: '0.12.0', commit: 'abc', release: null })).toBeNull();
  });
});
