// JSZip needs Node's ArrayBuffer realm; jsdom's differs and its Blob support is absent.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../src/app/gameSystems/builtInPresets';
import { installedListings } from '../../../src/app/armarium/installedListings';
import type { AssetService } from '../../../src/app/services/AssetService';
import { templateFingerprint } from '../../../src/app/services/collectionBundle/fingerprints';
import { DICE_SET_FOLDER, DiceSetFiles } from '../../../src/app/services/diceSets/DiceSetFiles';
import { openBundleImport } from '../../../src/app/services/itemBundle/bundleImport';
import { exportItemBundle } from '../../../src/app/services/itemBundle/itemExport';
import { readItemBundle } from '../../../src/app/services/itemBundle/itemBundleReader';
import { openItemImport } from '../../../src/app/services/itemBundle/itemImport';
import type { ItemRef } from '../../../src/app/services/itemBundle/itemBundleFormat';
import { shareableItems } from '../../../src/app/services/itemBundle/vaultItems';
import { SystemPresetFiles } from '../../../src/app/services/systemPresets/SystemPresetFiles';
import { recordFingerprint } from '../../../src/app/services/vaultRecords/bundleRecords';
import { parseTemplate } from '../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../src/app/statblocks/format/templateFormat';
import type { TemplateLibrary } from '../../../src/app/statblocks/library/TemplateLibrary';
import { newTemplateFile } from '../../../src/app/statblocks/library/templateWriter';
import { MARSH_CREATURE_JSON } from '../../fixtures/statblockTemplateFixtures';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

const MARSH = 'marsh-creature-k7m2qa';
const UID = '467922d140933c6d093ea94697a02d82';
const LIBRARY = 'atlas-vtt/statblock-templates';
const MARSH_PATH = `${LIBRARY}/Marsh creature.atlastemplate`;
const BODY_PATH = `${LIBRARY}/Marsh creature.md`;
const BODY = '## Tactics\n\nLurks below the reeds.\n';
const BOONS = { id: 'boons', name: 'Boons', crit: 'natural', dice: [{ count: 1, sides: 20 }, { count: 1, sides: 6, name: 'Boon' }] };
const BOONS_PATH = `${DICE_SET_FOLDER}/Boons.json`;
const PROVENANCE = { uid: 'feedfacefeedfacefeedfacefeedface', version: 7, source: 'older-item', installed: 'b'.repeat(64) };
const TEMPLATE: ItemRef = { kind: 'statblock-template', id: MARSH };
const dnd = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;

/** The Marsh creature rolling Boons, with code and an older install's provenance that must never travel. */
function marshText(change: Record<string, unknown> = {}): string {
  const json = JSON.parse(MARSH_CREATURE_JSON) as { layout: { blocks: unknown[] } } & Record<string, unknown>;
  json.layout.blocks.push({ id: 'js000001', type: 'script', summary: 'Rolls', fs: { type: 'javascript', code: 'return el;' } });
  return `${JSON.stringify({ ...json, diceSetId: 'boons', armarium: PROVENANCE, ...change }, null, 2)}\n`;
}

const apps: App[] = [];

async function vaultWith(files: Record<string, string> = {}): Promise<InMemoryApp> {
  const vault = createInMemoryApp({ files });
  (vault.app.vault as { readBinary: unknown }).readBinary = async (file: TFile): Promise<ArrayBuffer> =>
    new TextEncoder().encode(vault.files.get(file.path) ?? '').buffer as ArrayBuffer;
  apps.push(vault.app);
  await SystemPresetFiles.open(vault.app).load();
  await DiceSetFiles.open(vault.app).load();
  return vault;
}

async function creatorVault(change: Record<string, unknown> = {}): Promise<InMemoryApp> {
  const vault = await vaultWith({ [MARSH_PATH]: marshText(change), [BODY_PATH]: BODY });
  DiceSetFiles.forApp(vault.app)!.create({ ...BOONS, armarium: PROVENANCE });
  await DiceSetFiles.forApp(vault.app)!.flush();
  return vault;
}

async function bundleOf(vault: InMemoryApp, ref: ItemRef = TEMPLATE, version = 1, notes?: string): Promise<Uint8Array<ArrayBuffer>> {
  const { bytes } = await exportItemBundle(vault.app, ref, { uid: UID, version, notes });
  return bytes.slice();
}

async function install(vault: InMemoryApp, bytes: Uint8Array<ArrayBuffer>, creator?: string, listingUid: string | null = UID): Promise<Awaited<ReturnType<typeof openItemImport>>> {
  await DiceSetFiles.forApp(vault.app)!.flush();
  await SystemPresetFiles.forApp(vault.app)!.flush();
  return openItemImport(vault.app, await readItemBundle(bytes), { creator, listingUid: listingUid ?? undefined });
}

const json = (vault: InMemoryApp, path: string): Record<string, unknown> => JSON.parse(vault.files.get(path) ?? '{}') as Record<string, unknown>;
const templatePaths = (vault: InMemoryApp): string[] => [...vault.files.keys()].filter((path) => path.startsWith(`${LIBRARY}/`) && path.endsWith('.atlastemplate')).sort();

afterEach(() => {
  for (const app of apps.splice(0)) {
    DiceSetFiles.release(app);
    SystemPresetFiles.release(app);
  }
  vi.restoreAllMocks();
});

describe('exporting an item', () => {
  it('packs the template without code or provenance, its note and its dice set, the manifest first', async () => {
    const vault = await creatorVault();
    const { fileName, bytes, manifest } = await exportItemBundle(vault.app, TEMPLATE, { uid: UID, version: 2, notes: ' Wetter. ' });
    expect(fileName).toBe('Marsh creature v2.atlas-template.zip');
    expect(manifest).toMatchObject({ format: 10, item: { kind: 'statblock-template', uid: UID, id: MARSH, name: 'Marsh creature', version: 2, notes: 'Wetter.' } });
    expect(manifest.files.map(({ vaultPath, role, linkedFrom }) => ({ vaultPath, role, linkedFrom }))).toEqual([
      { vaultPath: MARSH_PATH, role: 'statblock-template', linkedFrom: undefined },
      { vaultPath: BODY_PATH, role: 'statblock-template-body', linkedFrom: [MARSH_PATH] },
      { vaultPath: BOONS_PATH, role: 'dice-set', linkedFrom: [MARSH_PATH] },
    ]);

    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)[0]).toBe('manifest.json');
    const template = JSON.parse(await zip.file(`files/${MARSH_PATH}`)!.async('string')) as { layout: { blocks: Array<{ type: string }> } } & Record<string, unknown>;
    expect(template).not.toHaveProperty('armarium');
    expect(template.layout.blocks.some((block) => block.type === 'script')).toBe(false);
    expect(JSON.parse(await zip.file(`files/${BOONS_PATH}`)!.async('string'))).not.toHaveProperty('armarium');
  });

  it('reads back as the bundle it packed', async () => {
    const vault = await creatorVault();
    const bundle = await readItemBundle(await bundleOf(vault));
    expect(bundle.manifest.item.id).toBe(MARSH);
    expect(await bundle.files.text(BODY_PATH)).toBe(BODY);
  });

  it('carries the listing\'s cover, which an install never writes into the vault', async () => {
    const creator = await creatorVault();
    // The RIFF/WEBP header is what tells a WebP from a PNG.
    const cover = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3, 4]).buffer;
    const { bytes, manifest } = await exportItemBundle(creator.app, { kind: 'dice-set', id: 'boons' }, { uid: UID, version: 1, cover });
    expect(manifest.files.at(-1)).toMatchObject({ vaultPath: 'cover.webp', role: 'cover' });
    const vault = await vaultWith();
    await (await install(vault, bytes.slice())).apply();
    expect(DiceSetFiles.forApp(vault.app)!.entries()[0]).toMatchObject({ id: 'boons' });
    expect([...vault.files.keys()].filter((path) => path.includes('cover'))).toEqual([]);
  });

  it('carries a template\'s card pictures, which an install never writes into the vault', async () => {
    const creator = await creatorVault();
    const previews = { light: new Uint8Array([1, 2]).buffer, dark: new Uint8Array([3, 4]).buffer };
    const { bytes, manifest } = await exportItemBundle(creator.app, TEMPLATE, { uid: UID, version: 1, previews });
    expect(manifest.files.slice(-2)).toMatchObject([{ vaultPath: 'preview-light.png', role: 'preview-light' }, { vaultPath: 'preview-dark.png', role: 'preview-dark' }]);
    const vault = await vaultWith();
    await (await install(vault, bytes.slice())).apply();
    expect([...vault.files.keys()].filter((path) => path.includes('preview'))).toEqual([]);
  });

  it('packs no card pictures for a dice set, which has no card', async () => {
    const creator = await creatorVault();
    const previews = { light: new Uint8Array([1]).buffer, dark: new Uint8Array([2]).buffer };
    const { manifest } = await exportItemBundle(creator.app, { kind: 'dice-set', id: 'boons' }, { uid: UID, version: 1, previews });
    expect(manifest.files.map((file) => file.role)).toEqual(['dice-set']);
  });

  it('refuses a built-in and an item the vault lacks', async () => {
    const vault = await creatorVault();
    await expect(exportItemBundle(vault.app, { kind: 'statblock-template', id: 'builtin:d20-creature' }, { uid: UID, version: 1 })).rejects.toThrow(/built into Atlas/);
    await expect(exportItemBundle(vault.app, { kind: 'dice-set', id: 'gone' }, { uid: UID, version: 1 })).rejects.toThrow(/no longer in your vault/);
  });

  it('lists the vault\'s own items, never a built-in', async () => {
    const vault = await creatorVault();
    SystemPresetFiles.forApp(vault.app)!.create({ id: 'marsh-preset', name: 'Marsh', builtIn: false, rules: dnd.rules });
    expect((await shareableItems(vault.app)).map(({ kind, id, name }) => [kind, id, name])).toEqual([
      ['statblock-template', MARSH, 'Marsh creature'],
      ['system-preset', 'marsh-preset', 'Marsh'],
      ['dice-set', 'boons', 'Boons'],
    ]);
  });
});

describe('reading an item bundle', () => {
  it('refuses one whose file holds another id than its manifest names', async () => {
    const vault = await creatorVault();
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await bundleOf(vault));
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as { item: Record<string, unknown> };
    zip.file('manifest.json', JSON.stringify({ ...manifest, item: { ...manifest.item, id: 'other-template-abc123' } }));
    await expect(readItemBundle(await zip.generateAsync({ type: 'uint8array' }) as Uint8Array<ArrayBuffer>)).rejects.toThrow('This file is damaged.');
  });

  it('opens the item review, not the collection review, wherever bundles enter', async () => {
    const creator = await creatorVault();
    const vault = await vaultWith();
    const opened = await openBundleImport(vault.app, {} as AssetService, new Blob([await bundleOf(creator)]));
    expect(opened.kind).toBe('item');
  });
});

describe('installing an item', () => {
  it('adds a new template with its note and dice set, and writes its provenance', async () => {
    const creator = await creatorVault();
    const vault = await vaultWith();
    const session = await install(vault, await bundleOf(creator), 'Mara');
    expect(session.review).toMatchObject({ kind: 'statblock-template', name: 'Marsh creature', version: 1, creator: 'Mara', outcome: 'new', installedVersion: null, diceSet: { name: 'Boons', outcome: 'new' } });
    expect(await session.apply()).toMatchObject({ localId: MARSH, outcome: 'new', version: 1 });

    const written = json(vault, MARSH_PATH);
    const { armarium, ...content } = written;
    expect(armarium).toEqual({ uid: UID, version: 1, source: MARSH, installed: await templateFingerprint(content, BODY) });
    expect(await templateFingerprint(written, BODY)).toBe(await templateFingerprint(content, BODY));
    expect(vault.files.get(BODY_PATH)).toBe(BODY);
    expect(json(vault, BOONS_PATH)).toMatchObject({ id: 'boons', name: 'Boons' });
  });

  it('updates a template unchanged since its install in place', async () => {
    const vault = await vaultWith();
    await (await install(vault, await bundleOf(await creatorVault()))).apply();
    const newer = await creatorVault({ description: 'Wetter creatures' });
    const session = await install(vault, await bundleOf(newer, TEMPLATE, 2, 'Wetter'));
    expect(session.review).toMatchObject({ outcome: 'update', installedVersion: 1, notes: 'Wetter', diceSet: { outcome: 'reuse' } });
    await session.apply();
    expect(templatePaths(vault)).toEqual([MARSH_PATH]);
    expect(json(vault, MARSH_PATH)).toMatchObject({ description: 'Wetter creatures', armarium: { uid: UID, version: 2 } });
  });

  it('brings a newer version in beside a template the GM changed, and later updates that copy', async () => {
    const vault = await vaultWith();
    await (await install(vault, await bundleOf(await creatorVault()))).apply();
    vault.files.set(MARSH_PATH, JSON.stringify({ ...json(vault, MARSH_PATH), description: 'Mine now' }, null, 2));
    const session = await install(vault, await bundleOf(await creatorVault({ description: 'Wetter creatures' }), TEMPLATE, 2), 'Mara');
    expect(session.review).toMatchObject({ outcome: 'copy', localName: 'Marsh creature (Mara)', installedVersion: 1 });
    const result = await session.apply();
    const copyPath = `${LIBRARY}/Marsh creature (Mara).atlastemplate`;
    expect(json(vault, MARSH_PATH)).toMatchObject({ description: 'Mine now', armarium: { version: 1 } });
    expect(json(vault, copyPath)).toMatchObject({ id: result.localId, description: 'Wetter creatures', armarium: { uid: UID, version: 2 } });
    expect(result.localId).not.toBe(MARSH);

    const third = await install(vault, await bundleOf(await creatorVault({ description: 'Wettest' }), TEMPLATE, 3));
    expect(third.review).toMatchObject({ outcome: 'update', localName: 'Marsh creature (Mara)', installedVersion: 2 });
  });

  it('never takes a bundle that names an installed listing with another item id for that listing\'s update', async () => {
    const vault = await vaultWith();
    await (await install(vault, await bundleOf(await creatorVault()))).apply();
    const impostor = await vaultWith({ [MARSH_PATH]: marshText({ id: 'other-thing-a1b2c3', description: 'Not yours' }), [BODY_PATH]: BODY });
    const session = await install(vault, await bundleOf(impostor, { kind: 'statblock-template', id: 'other-thing-a1b2c3' }, 2));
    expect(session.review).toMatchObject({ outcome: 'new', installedVersion: null });
    await session.apply();
    expect(json(vault, MARSH_PATH)).toMatchObject({ armarium: { version: 1, source: MARSH } });
    expect(json(vault, MARSH_PATH).description).not.toBe('Not yours');
  });

  it('updates an install in place only from a download checked for its listing, never from a file', async () => {
    const vault = await vaultWith();
    await (await install(vault, await bundleOf(await creatorVault()))).apply();
    const newer = await bundleOf(await creatorVault({ description: 'Wetter creatures' }), TEMPLATE, 2);
    const fromFile = await install(vault, newer, 'Mara', null);
    expect(fromFile.review).toMatchObject({ outcome: 'copy', installedVersion: null });
    await fromFile.apply();
    expect(json(vault, MARSH_PATH)).toMatchObject({ armarium: { version: 1 } });
  });

  it('refuses an Armarium download that names another listing', async () => {
    const vault = await vaultWith();
    await expect(openBundleImport(vault.app, {} as AssetService, new Blob([await bundleOf(await creatorVault())]), undefined, { listingUid: 'feedfacefeedfacefeedfacefeedface' })).rejects.toThrow();
  });

  it('drops provenance a bundle carries in its dice set, and writes none for it', async () => {
    const vault = await vaultWith();
    await (await install(vault, await bundleOf(await creatorVault()))).apply();
    expect(json(vault, BOONS_PATH).armarium).toBeUndefined();
  });

  it('brings its dice set in as a copy where the vault has another set of that id, and the template rolls the copy', async () => {
    const vault = await vaultWith();
    DiceSetFiles.forApp(vault.app)!.create({ ...BOONS, crit: 'doubles' });
    const session = await install(vault, await bundleOf(await creatorVault()), 'Mara');
    expect(session.review.diceSet).toEqual({ name: 'Boons (Mara)', outcome: 'copy' });
    await session.apply();
    const copy = DiceSetFiles.forApp(vault.app)!.entries().find((entry) => entry.name === 'Boons (Mara)')!;
    expect(copy.id).not.toBe('boons');
    expect(json(vault, MARSH_PATH).diceSetId).toBe(copy.id);
  });

  it('tells a template already in the vault, and marks it installed', async () => {
    const creator = await creatorVault();
    const vault = await vaultWith({ [MARSH_PATH]: marshText({ armarium: undefined }), [BODY_PATH]: BODY });
    DiceSetFiles.forApp(vault.app)!.create(BOONS);
    // The vault's copy holds the code the bundle leaves out, so it is the same template only without it.
    vault.files.set(MARSH_PATH, (await readItemBundle(await bundleOf(creator)).then((bundle) => bundle.files.text(MARSH_PATH)))!);
    const session = await install(vault, await bundleOf(creator));
    expect(session.review.outcome).toBe('reuse');
    await session.apply();
    expect(json(vault, MARSH_PATH)).toMatchObject({ armarium: { uid: UID, version: 1 } });
  });

  it('installs a game system with the dice set it rolls, and updates it in place', async () => {
    const creator = await creatorVault();
    SystemPresetFiles.forApp(creator.app)!.create({ id: 'marsh-preset', name: 'Marsh', builtIn: false, rules: { ...dnd.rules, diceSetId: 'boons' } });
    const ref: ItemRef = { kind: 'system-preset', id: 'marsh-preset' };
    const vault = await vaultWith();
    const session = await install(vault, await bundleOf(creator, ref));
    expect(session.review).toMatchObject({ kind: 'system-preset', name: 'Marsh', outcome: 'new', diceSet: { name: 'Boons', outcome: 'new' } });
    await session.apply();
    const stored = SystemPresetFiles.forApp(vault.app)!.entries().find((entry) => entry.id === 'marsh-preset')!;
    expect(stored.armarium).toEqual({ uid: UID, version: 1, source: 'marsh-preset', installed: await recordFingerprint(stored) });

    SystemPresetFiles.forApp(creator.app)!.update('marsh-preset', (entry) => ({ ...entry, name: 'Marsh II' }));
    const update = await install(vault, await bundleOf(creator, ref, 2));
    expect(update.review).toMatchObject({ outcome: 'update', installedVersion: 1 });
    await update.apply();
    expect(SystemPresetFiles.forApp(vault.app)!.entries().find((entry) => entry.id === 'marsh-preset')).toMatchObject({ name: 'Marsh II', armarium: { version: 2 } });
  });

  it('installs a dice set on its own and tells the Armarium which version the vault holds', async () => {
    const creator = await creatorVault();
    const vault = await vaultWith();
    await (await install(vault, await bundleOf(creator, { kind: 'dice-set', id: 'boons' }, 4))).apply();
    expect(DiceSetFiles.forApp(vault.app)!.entries()[0]).toMatchObject({ id: 'boons', armarium: { uid: UID, version: 4 } });
    const assets = { getCollections: async () => [] } as unknown as AssetService;
    expect(await installedListings(vault.app, assets, new Set([UID, 'other-listing-uid']))).toEqual([{ uid: UID, version: 4 }]);
    expect(await installedListings(vault.app, assets, new Set(['other-listing-uid']))).toEqual([]);
  });
});

describe('a template\'s provenance', () => {
  it('is read and written back with the template, without a problem', () => {
    const result = parseTemplate(marshText());
    expect(result.template?.armarium).toEqual(PROVENANCE);
    expect(result.problems).toEqual([]);
    expect(JSON.parse(serializeTemplate(result.template!))).toMatchObject({ armarium: PROVENANCE });
  });

  it('stays behind when a new template is made from it', async () => {
    const vault = await vaultWith();
    const library = { get: () => null, recordWrite: vi.fn() } as unknown as TemplateLibrary;
    const made = await newTemplateFile(vault.app, library, 'Marsh copy', parseTemplate(marshText()).template!);
    expect(json(vault, made.path)).not.toHaveProperty('armarium');
  });
});
