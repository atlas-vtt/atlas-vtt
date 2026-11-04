import { describe, expect, it } from 'vitest';
import { BUNDLE_FORMAT, bundleFormatFor, isLegacySnapshotFile, isSafeBundlePath, manifestProblem } from '../../src/app/services/collectionBundle/bundleFormat';

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: BUNDLE_FORMAT,
    exportedAt: 1,
    collection: { id: 'source', uid: '726e53fb-59c3-49d4-9019-947bb901c037', name: 'Source', version: 2, tags: {}, settings: { conditions: [] } },
    assets: [{ id: 'token-1', type: 'token', name: 'Goblin', tags: [] }],
    files: [{ vaultPath: 'atlas-vtt/assets/goblin.webp', role: 'token-image', sha256: 'a'.repeat(64), owners: ['token-1'] }],
    ...overrides,
  };
}

describe('bundle paths', () => {
  it.each([
    ['atlas-vtt/assets/goblin.webp', true],
    ['Bestiary/Goblin.md', true],
    ['atlas-vtt/../.obsidian/plugins/x/main.js', false],
    ['atlas-vtt/./assets/goblin.webp', false],
    ['.obsidian/plugins/x/main.js', false],
    ['atlas-vtt/.atlas-data/installs/x.json', false],
    ['/etc/passwd', false],
    ['atlas-vtt\\assets\\goblin.webp', false],
    ['atlas-vtt//assets/goblin.webp', false],
    ['atlas-vtt/assets/go\nblin.webp', false],
  ] as const)('%s is safe: %s', (path, safe) => {
    expect(isSafeBundlePath(path)).toBe(safe);
  });
});

describe('manifest checks', () => {
  it('accepts sound format 3 and format 2 manifests', () => {
    expect(manifestProblem(manifest())).toBeNull();
    expect(manifestProblem(manifest({ format: 2, files: [{ vaultPath: 'atlas-vtt/a.json', role: 'asset-file' }] }))).toBeNull();
  });

  it('asks for an Atlas update for newer formats and rejects older ones', () => {
    expect(manifestProblem(manifest({ format: BUNDLE_FORMAT + 1 }))).toMatch(/newer version of Atlas/);
    expect(manifestProblem(manifest({ format: 1 }))).toMatch(/too old/);
    expect(manifestProblem({ hello: 'world' })).toMatch(/not an Atlas collection/);
  });

  it.each([
    ['a missing export date', { exportedAt: undefined }],
    ['a uid that could name another file', { collection: { id: 'source', uid: '../../x', name: 'Source', version: 1 } }],
    ['a fractional version', { collection: { id: 'source', uid: '726e53fb-59c3-49d4-9019-947bb901c037', name: 'Source', version: 1.5, tags: {}, settings: {} } }],
    ['an empty name', { collection: { id: 'source', uid: '726e53fb-59c3-49d4-9019-947bb901c037', name: ' ', version: 1, tags: {}, settings: {} } }],
    ['collection tags that are not a record', { collection: { id: 'source', uid: '726e53fb-59c3-49d4-9019-947bb901c037', name: 'Source', version: 1, tags: 'x', settings: {} } }],
    ['an asset id with a folder', { assets: [{ id: '../evil', type: 'map', name: 'Evil', tags: [] }] }],
    ['an asset id that is a prototype key', { assets: [{ id: '__proto__', type: 'map', name: 'Evil', tags: [] }] }],
    ['a statblock artwork key other than image fields', { files: [{ vaultPath: 'Bestiary/G.md', role: 'statblock-note', statblockImage: { key: 'x|y', path: 'a.png' } }] }],
    ['an unknown file role', { files: [{ vaultPath: 'atlas-vtt/a', role: 'script' }] }],
    ['a malformed checksum', { files: [{ vaultPath: 'atlas-vtt/a', role: 'asset-file', sha256: 'abc' }] }],
    ['linking notes that are not paths', { files: [{ vaultPath: 'Lore/Sun.md', role: 'linked-note', linkedFrom: [7] }] }],
    ['an unknown release kind', { release: { kind: 'patch' } }],
  ])('rejects %s', (_name, overrides) => {
    expect(manifestProblem(manifest(overrides))).toMatch(/damaged/);
  });

  it('names the file it refuses to write', () => {
    expect(manifestProblem(manifest({ files: [{ vaultPath: 'atlas-vtt/../.obsidian/app.json', role: 'asset-file' }] })))
      .toBe('This collection export contains a file Atlas will not write: atlas-vtt/../.obsidian/app.json');
  });
});

describe('scene snapshots', () => {
  const scene = { id: 'scene-1', type: 'scene', name: 'Cave', tags: [], data: { mapPath: 'atlas-vtt/collections/source/scenes/Cave.atlasmap' } };
  const snapshot = (vaultPath: string, owners = ['scene-1']): Record<string, unknown> => ({ vaultPath, role: 'scene-snapshot', owners });

  it('names visible paths, which need no exception', () => {
    expect(isSafeBundlePath('atlas-vtt/collections/source/snapshots/scene-1/s1.json')).toBe(true);
    expect(isSafeBundlePath('atlas-vtt/collections/source/scenes/.snapshots/Cave/s1.json')).toBe(false);
    expect(manifestProblem(manifest({ assets: [scene], files: [snapshot('atlas-vtt/collections/source/snapshots/scene-1/s1.json')] }))).toBeNull();
  });

  it('still accepts the hidden paths earlier versions wrote, for a scene of the bundle', () => {
    const legacy = 'atlas-vtt/collections/source/scenes/.snapshots/Cave/s1.json';
    expect(isLegacySnapshotFile({ vaultPath: legacy, role: 'scene-snapshot' })).toBe(true);
    expect(isLegacySnapshotFile({ vaultPath: legacy, role: 'asset-file' })).toBe(false);
    expect(isLegacySnapshotFile({ vaultPath: '.obsidian/.snapshots/Cave/s1.json', role: 'scene-snapshot' })).toBe(false);
    expect(isLegacySnapshotFile({ vaultPath: 'atlas-vtt/.snapshots/Cave/../s1.json', role: 'scene-snapshot' })).toBe(false);
    expect(manifestProblem(manifest({ assets: [scene], files: [snapshot(legacy)] }))).toBeNull();
    expect(manifestProblem(manifest({ assets: [scene], files: [snapshot(legacy, ['token-1'])] }))).toMatch(/will not write/);
  });
});

describe('statblock templates, their notes and dice sets', () => {
  const template = { vaultPath: 'atlas-vtt/statblock-templates/Marsh creature.atlastemplate', role: 'statblock-template', sha256: 'b'.repeat(64) } as const;
  const body = { vaultPath: 'atlas-vtt/statblock-templates/Marsh creature.md', role: 'statblock-template-body', linkedFrom: [template.vaultPath] } as const;
  const diceSet = { vaultPath: 'atlas-vtt/dice-sets/Duality.json', role: 'dice-set' } as const;
  const preset = { vaultPath: 'atlas-vtt/system-presets/Marsh.json', role: 'system-preset' } as const;

  it('travel in format 9, which a bundle says only when it packs one, so older versions still import the rest', () => {
    expect(manifestProblem(manifest({ format: 9, files: [template, body, diceSet] }))).toBeNull();
    expect(bundleFormatFor([template])).toBe(9);
    expect(bundleFormatFor([body])).toBe(9);
    expect(bundleFormatFor([preset, diceSet])).toBe(9);
    expect(bundleFormatFor([preset])).toBe(8);
    expect(bundleFormatFor([{ vaultPath: 'atlas-vtt/assets/goblin.webp', role: 'token-image' }])).toBe(6);
  });

  it('still reads templates in format 7, as development builds wrote them', () => {
    expect(manifestProblem(manifest({ format: 7, files: [template] }))).toBeNull();
  });
});
