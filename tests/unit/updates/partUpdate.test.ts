import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILT_VERSION, isPartUpdate } from '../../../src/app/updates/partUpdate';

describe('isPartUpdate', () => {
  it.each([
    ['a release', '0.19.0'],
    ['a beta', '0.19.1-beta.0'],
  ])('finds nothing when the manifest names %s the code was built from', (_name, version) => {
    expect(isPartUpdate(version, version)).toBe(false);
  });

  it.each([
    ['a newer release', '0.19.0', '0.18.0'],
    ['an older release', '0.18.0', '0.19.0'],
    ['the release of the running beta', '0.19.1', '0.19.1-beta.0'],
    ['another beta', '0.19.1-beta.1', '0.19.1-beta.0'],
  ])('finds a part update when the manifest names %s', (_name, installed, built) => {
    expect(isPartUpdate(installed, built)).toBe(true);
  });

  it('knows the version the code is built from: the manifest\'s', () => {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as { version: string };
    expect(BUILT_VERSION).toBe(manifest.version);
  });
});
