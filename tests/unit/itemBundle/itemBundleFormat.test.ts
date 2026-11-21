import { describe, expect, it } from 'vitest';
import { ITEM_BUNDLE_FORMAT, isItemManifest, itemBundleFileName, itemManifestProblem } from '../../../src/app/services/itemBundle/itemBundleFormat';
import { itemListingUid } from '../../../src/app/services/itemBundle/itemListingUid';
import { stripProvenanceText, withProvenance, withoutProvenance } from '../../../src/app/services/itemBundle/itemProvenance';

const TEMPLATE = 'atlas-vtt/statblock-templates/Marsh creature.atlastemplate';
const BODY = 'atlas-vtt/statblock-templates/Marsh creature.md';
const SET = 'atlas-vtt/dice-sets/Boons.json';
const PRESET = 'atlas-vtt/system-presets/Marsh.json';

const manifest = (kind: string, files: Array<Record<string, unknown>>, item: Record<string, unknown> = {}): Record<string, unknown> => ({
  format: ITEM_BUNDLE_FORMAT,
  exportedAt: 1,
  item: { kind, uid: '467922d140933c6d093ea94697a02d82', id: 'marsh-creature-k7m2qa', name: 'Marsh creature', version: 2, ...item },
  files,
});

describe('the listing uid of an item', () => {
  it('is the first 32 hex digits of the SHA-256 of its account, kind and id', async () => {
    expect(await itemListingUid('acc-123', 'statblock-template', 'marsh-creature-k7m2qa')).toBe('467922d140933c6d093ea94697a02d82');
  });

  it('differs for another account, kind or item', async () => {
    const uid = await itemListingUid('acc-123', 'dice-set', 'boons');
    expect(uid).toMatch(/^[0-9a-f]{32}$/);
    expect(await itemListingUid('acc-124', 'dice-set', 'boons')).not.toBe(uid);
    expect(await itemListingUid('acc-123', 'system-preset', 'boons')).not.toBe(uid);
  });
});

describe('an item manifest', () => {
  it('is told from a collection manifest by its item', () => {
    expect(isItemManifest(manifest('dice-set', []))).toBe(true);
    expect(isItemManifest({ format: 9, collection: {}, assets: [], files: [] })).toBe(false);
  });

  it('accepts a template with its note and dice set, a preset with its dice set and a dice set alone', () => {
    expect(itemManifestProblem(manifest('statblock-template', [
      { vaultPath: TEMPLATE, role: 'statblock-template' },
      { vaultPath: BODY, role: 'statblock-template-body', linkedFrom: [TEMPLATE] },
      { vaultPath: SET, role: 'dice-set', linkedFrom: [TEMPLATE] },
    ]))).toBeNull();
    expect(itemManifestProblem(manifest('system-preset', [{ vaultPath: PRESET, role: 'system-preset' }, { vaultPath: SET, role: 'dice-set' }]))).toBeNull();
    expect(itemManifestProblem(manifest('dice-set', [{ vaultPath: SET, role: 'dice-set' }]))).toBeNull();
  });

  it('accepts one cover beside an item of any kind, and refuses a second, a misplaced or a linked one', () => {
    const cover = { vaultPath: 'cover.webp', role: 'cover' };
    expect(itemManifestProblem(manifest('dice-set', [{ vaultPath: SET, role: 'dice-set' }, cover]))).toBeNull();
    expect(itemManifestProblem(manifest('system-preset', [{ vaultPath: PRESET, role: 'system-preset' }, { ...cover, vaultPath: 'cover.png' }]))).toBeNull();
    expect(itemManifestProblem(manifest('statblock-template', [{ vaultPath: TEMPLATE, role: 'statblock-template' }, cover]))).toBeNull();
    for (const files of [
      [{ vaultPath: SET, role: 'dice-set' }, cover, { ...cover, vaultPath: 'cover.png' }],
      [{ vaultPath: SET, role: 'dice-set' }, { ...cover, vaultPath: 'atlas-vtt/cover.webp' }],
      [{ vaultPath: SET, role: 'dice-set' }, { ...cover, vaultPath: 'cover.jpg' }],
      [{ vaultPath: SET, role: 'dice-set' }, { ...cover, linkedFrom: [SET] }],
    ]) expect(itemManifestProblem(manifest('dice-set', files))).toMatch(/damaged/i);
  });

  it('accepts a template\'s card in each look, and refuses it beside another kind, twice, misplaced or linked', () => {
    const template = { vaultPath: TEMPLATE, role: 'statblock-template' };
    const light = { vaultPath: 'preview-light.png', role: 'preview-light' };
    const dark = { vaultPath: 'preview-dark.png', role: 'preview-dark' };
    expect(itemManifestProblem(manifest('statblock-template', [template, light, dark]))).toBeNull();
    expect(itemManifestProblem(manifest('statblock-template', [template, dark]))).toBeNull();
    expect(itemManifestProblem(manifest('dice-set', [{ vaultPath: SET, role: 'dice-set' }, light]))).toMatch(/damaged/i);
    for (const files of [
      [template, light, { ...light }],
      [template, { ...light, vaultPath: 'preview-dark.png' }],
      [template, { ...dark, vaultPath: 'atlas-vtt/preview-dark.png' }],
      [template, { ...dark, linkedFrom: [TEMPLATE] }],
    ]) expect(itemManifestProblem(manifest('statblock-template', files))).toMatch(/damaged/i);
  });

  it('refuses a manifest of a newer format as made with a newer Atlas', () => {
    expect(itemManifestProblem({ ...manifest('dice-set', [{ vaultPath: SET, role: 'dice-set' }]), format: 11 })).toMatch(/newer version/);
  });

  it('refuses files a kind does not hold, a missing or second item file and a note that names no template', () => {
    const damaged = [
      manifest('dice-set', [{ vaultPath: SET, role: 'dice-set' }, { vaultPath: TEMPLATE, role: 'statblock-template' }]),
      manifest('dice-set', [{ vaultPath: SET, role: 'dice-set' }, { vaultPath: 'atlas-vtt/dice-sets/Other.json', role: 'dice-set' }]),
      manifest('system-preset', [{ vaultPath: SET, role: 'dice-set' }]),
      manifest('statblock-template', [{ vaultPath: TEMPLATE, role: 'statblock-template' }, { vaultPath: BODY, role: 'statblock-template-body' }]),
      manifest('statblock-template', [{ vaultPath: TEMPLATE, role: 'statblock-template' }, { vaultPath: 'a.md', role: 'linked-note' }]),
      manifest('statblock-template', [{ vaultPath: TEMPLATE, role: 'statblock-template' }, { vaultPath: SET, role: 'dice-set' }, { vaultPath: 'atlas-vtt/dice-sets/B.json', role: 'dice-set' }]),
      manifest('map', [{ vaultPath: SET, role: 'dice-set' }]),
      manifest('dice-set', [{ vaultPath: SET, role: 'dice-set' }], { uid: 'short' }),
      manifest('dice-set', [{ vaultPath: SET, role: 'dice-set' }], { version: 0 }),
      manifest('dice-set', [{ vaultPath: SET, role: 'dice-set' }], { name: 'x'.repeat(121) }),
      { ...manifest('dice-set', [{ vaultPath: SET, role: 'dice-set' }]), format: 9 },
    ];
    for (const value of damaged) expect(itemManifestProblem(value)).toBe('This file is damaged.');
  });

  it('refuses a path Atlas will not write', () => {
    expect(itemManifestProblem(manifest('dice-set', [{ vaultPath: '../dice.json', role: 'dice-set' }]))).toMatch(/will not write/);
    expect(itemManifestProblem(manifest('dice-set', [{ vaultPath: '.obsidian/dice.json', role: 'dice-set' }]))).toMatch(/will not write/);
  });

  it('names its file by the item, its version and its kind', () => {
    expect(itemBundleFileName('Marsh creature', 2, 'statblock-template')).toBe('Marsh creature v2.atlas-template.zip');
    expect(itemBundleFileName('Sun/Moon', 1, 'system-preset')).toBe('Sun-Moon v1.atlas-system.zip');
    expect(itemBundleFileName('Boons', 3, 'dice-set')).toBe('Boons v3.atlas-dice.zip');
  });
});

describe('provenance', () => {
  const provenance = { uid: '467922d140933c6d093ea94697a02d82', version: 2, source: 'boons', installed: 'a'.repeat(64) };

  it('is added after the other keys and taken off again', () => {
    const file = withProvenance({ id: 'boons', name: 'Boons' }, provenance);
    expect(Object.keys(file)).toEqual(['id', 'name', 'armarium']);
    expect(withoutProvenance(file)).toEqual({ id: 'boons', name: 'Boons' });
  });

  it('is stripped from JSON text, which is left alone where it holds none', () => {
    const text = '{\n  "id": "boons"\n}';
    expect(stripProvenanceText(text)).toBe(text);
    expect(JSON.parse(stripProvenanceText(JSON.stringify({ id: 'boons', armarium: provenance })))).toEqual({ id: 'boons' });
  });
});
