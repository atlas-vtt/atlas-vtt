import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const { parseVersion, channelForBranch, assertChannel } = createRequire(import.meta.url)('../../scripts/release-channel.js');
const roots: string[] = [];
function project(manifestVersion: string, packageVersion = manifestVersion): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-channel-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ version: manifestVersion }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: packageVersion }));
  return root;
}
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

describe('release channels', () => {
  it('classifies stable and beta versions', () => {
    expect(parseVersion('0.2.0')).toEqual({ version: '0.2.0', base: '0.2.0', channel: 'stable', iteration: null });
    expect(parseVersion('0.2.0-beta.3')).toEqual({ version: '0.2.0-beta.3', base: '0.2.0', channel: 'beta', iteration: 3 });
    expect(parseVersion('0.2.0-beta.0').iteration).toBe(0);
  });
  it.each(['v0.2.0', '0.2', '0.2.0-beta.01', '0.2.0-rc.1', '0.2.0-beta', '01.2.0', undefined])('rejects %s', version => {
    expect(() => parseVersion(version)).toThrow(/invalid version/i);
  });
  it('maps release branches to channels and leaves other branches unchecked', () => {
    expect(channelForBranch('main')).toBe('stable');
    expect(channelForBranch('beta')).toBe('beta');
    expect(channelForBranch('feature/fog')).toBeNull();
  });
  it('refuses beta versions on the stable channel and vice versa', () => {
    expect(assertChannel(project('0.2.0-beta.1'), 'beta').base).toBe('0.2.0');
    expect(() => assertChannel(project('0.2.0-beta.1'), 'stable')).toThrow(/beta channel/);
    expect(() => assertChannel(project('0.2.0'), 'beta')).toThrow(/stable channel/);
  });
  it('refuses manifest and package versions that drift apart', () => {
    expect(() => assertChannel(project('0.2.0', '0.2.1'), 'stable')).toThrow(/differ/);
  });
});
