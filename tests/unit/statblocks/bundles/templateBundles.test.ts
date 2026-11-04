// JSZip needs Node's ArrayBuffer realm; jsdom's differs and its Blob support is absent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AssetService } from '../../../../src/app/services/AssetService';
import { SystemPresetFiles } from '../../../../src/app/services/systemPresets/SystemPresetFiles';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../../src/app/gameSystems/builtInPresets';
import { exportCollectionBundle, prepareCollectionExport } from '../../../../src/app/services/collectionBundle/collectionExport';
import { openCollectionImport, type ImportDecision } from '../../../../src/app/services/collectionBundle/collectionImport';
import { readInstallRecord } from '../../../../src/app/services/collectionBundle/installRecord';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { findCode } from '../../../../src/app/statblocks/model/fsCodeKeys';
import { MARSH_CREATURE_JSON } from '../../../fixtures/statblockTemplateFixtures';
import { createInMemoryApp, parseFrontmatter, type InMemoryApp } from '../../../mocks/inMemoryVault';


const MARSH = 'marsh-creature-k7m2qa';
const LIBRARY = 'atlas-vtt/statblock-templates';
const MARSH_PATH = `${LIBRARY}/Marsh creature.atlastemplate`;
const COPY_PATH = `${LIBRARY}/Marsh creature (Fen).atlastemplate`;
const NOTE = 'Bestiary/Hag.md';
const INSTALLED_NOTE = 'atlas-vtt/collections/Fen/statblocks/Hag.md';
const HAG_IMAGE = 'atlas-vtt/assets/hag.webp';
const ROLE = { id: 'monster', name: 'Monster', templateId: MARSH };

const note = (template: string): string => `---\nstatblock: true\natlas-template: ${template}\nname: Hag\n---\nA hag.`;
const templateText = (description: string): string => MARSH_CREATURE_JSON.replace('Creatures of the marsh campaign', description);
/** The template as the creator keeps it: with a script block and a diceCallback hidden in a block's fsExtras. */
function withCode(description = 'Creatures of the marsh campaign'): string {
  const json = JSON.parse(templateText(description)) as { layout: { blocks: unknown[] } };
  json.layout.blocks.push({ id: 'js000001', type: 'script', summary: 'Rolls' }, { id: 'st000001', type: 'stat', field: 'hp', look: 'run-in', fsExtras: { diceCallback: 'return [];' } });
  return JSON.stringify(json, null, 2);
}
/** The template as it travels: what an export makes of `withCode`. */
function packed(description = 'Creatures of the marsh campaign'): string {
  const json = JSON.parse(withCode(description)) as { layout: { blocks: Array<{ id: string }> } };
  json.layout.blocks = json.layout.blocks.filter((block) => block.id !== 'js000001');
  json.layout.blocks[json.layout.blocks.length - 1] = { id: 'st000001', type: 'stat', field: 'hp', look: 'run-in', fsExtras: {} } as { id: string };
  return `${JSON.stringify(json, null, 2)}\n`;
}

interface Vault { vault: InMemoryApp; assets: AssetService }

async function vaultWith(files: Record<string, string> = {}): Promise<Vault> {
  const vault = createInMemoryApp({ files });
  (vault.app.vault as { readBinary: unknown }).readBinary = async (file: TFile): Promise<ArrayBuffer> =>
    new TextEncoder().encode(vault.files.get(file.path) ?? '').buffer as ArrayBuffer;
  vault.app.metadataCache.getFileCache = vi.fn((file: TFile) => {
    const frontmatter = parseFrontmatter(vault.files.get(file.path) ?? '');
    return frontmatter ? { frontmatter } : null;
  });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  return { vault, assets };
}

/** A collection "Fen" with a token whose native statblock names the Marsh creature, which its Monster role starts from too. */
async function creatorVault(settings: Record<string, unknown> = { statblockRoles: [ROLE] }): Promise<Vault> {
  const creator = await vaultWith({ [MARSH_PATH]: withCode(), [NOTE]: note(MARSH), [HAG_IMAGE]: 'IMG' });
  await creator.assets.createCollection('Fen');
  await creator.assets.updateCollectionSettings('Fen', {
    statblockRoleFolders: { monster: 'atlas-vtt/collections/Fen/Monsters', npc: 'People' },
    ...settings,
  });
  await creator.assets.addTokenAsset({ name: 'Hag', imagePath: HAG_IMAGE, statblockPath: NOTE, collection: 'Fen', tags: [] });
  return creator;
}

async function release({ vault, assets }: Vault, version = 1): Promise<Blob> {
  AssetService.resetInstance();
  const preview = await prepareCollectionExport(vault.app, assets, 'Fen');
  const bundle = await exportCollectionBundle(vault.app, assets, preview, { kind: 'release', version });
  await bundle.commit();
  return bundle.blob;
}

async function unzip(blob: Blob): Promise<{ manifest: { format: number; collection: { settings: Record<string, unknown> } }; text: (path: string) => Promise<string | undefined> }> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return {
    manifest: JSON.parse(await zip.file('manifest.json')!.async('string')) as { format: number; collection: { settings: Record<string, unknown> } },
    text: async (path) => zip.file(`files/${path}`)?.async('string'),
  };
}

async function importInto({ vault, assets }: Vault, blob: Blob, decision: ImportDecision = {}): ReturnType<typeof openCollectionImport> {
  const session = await openCollectionImport(vault.app, assets, blob);
  await session.apply(decision);
  return session;
}

/** Template files the vault indexes: backups in hidden folders are none. */
const templateFiles = ({ vault }: Vault): string[] =>
  [...vault.files.keys()].filter((path) => path.endsWith('.atlastemplate') && !path.split('/').some((part) => part.startsWith('.'))).sort();
const settingsOf = async ({ assets }: Vault): Promise<Record<string, unknown> | undefined> => (await assets.getCollection('Fen'))?.settings as Record<string, unknown> | undefined;
const idIn = (text: string | undefined): string => (JSON.parse(text ?? '{}') as { id: string }).id;

beforeEach(() => { AssetService.resetInstance(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('exporting a collection with statblock templates', () => {
  it('packs the templates its roles and notes name without code, says format 9, and keeps only its own role folders', async () => {
    const { manifest, text } = await unzip(await release(await creatorVault()));
    expect(manifest.format).toBe(9);
    expect(await text(MARSH_PATH)).toBe(packed());
    expect(findCode(JSON.parse((await text(MARSH_PATH))!))).toEqual([]);
    expect(manifest.collection.settings).toMatchObject({ statblockRoles: [ROLE], statblockRoleFolders: { monster: 'atlas-vtt/collections/Fen/Monsters' } });
  });

  it('says format 6 when it packs no template', async () => {
    const creator = await creatorVault({});
    creator.vault.files.set(NOTE, '---\nstatblock: true\nname: Hag\n---\nA hag.');
    const { manifest } = await unzip(await release(creator));
    expect(manifest.format).toBe(6);
    expect(manifest.collection.settings).not.toHaveProperty('statblockRoles');
  });

  it('writes out the roles a collection reads from a user preset, which then counts as unchanged where that preset is', async () => {
    const dnd = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
    const creator = await creatorVault({ systemPresetId: 'marsh-preset' });
    const presets = SystemPresetFiles.open(creator.vault.app);
    presets.create({ id: 'marsh-preset', name: 'Marsh', builtIn: false, rules: { ...dnd.rules, statblockRoles: [ROLE] } });
    await presets.flush();
    creator.vault.files.set(NOTE, '---\nstatblock: true\nname: Hag\n---\nA hag.');

    const blob = await release(creator);
    const { manifest } = await unzip(blob);
    expect(manifest.collection.settings).toMatchObject({ systemPresetId: 'marsh-preset', statblockRoles: [ROLE] });
    // The preset and the role's template travel with the collection, which only a format 9 reader understands.
    expect(manifest.format).toBe(9);
    // The publisher's vault reads the bundle's roles as its preset's and keeps the folder that stayed behind: its release is up to date
    expect((await openCollectionImport(creator.vault.app, creator.assets, blob)).review).toMatchObject({ upToDate: true, conflicts: [], counts: { kept: 0 } });
    expect(creator.vault.files.get(MARSH_PATH)).toBe(withCode());
    SystemPresetFiles.release(creator.vault.app);
  });
});

describe('importing a collection with statblock templates', () => {
  it('places a new template by its id in the library folder, never in the collection, and records it', async () => {
    const fan = await vaultWith();
    const session = await importInto(fan, await release(await creatorVault()));
    expect(templateFiles(fan)).toEqual([MARSH_PATH]);
    expect(fan.vault.files.get(MARSH_PATH)).toBe(packed());
    expect(parseFrontmatter(fan.vault.files.get(INSTALLED_NOTE)!)).toMatchObject({ 'atlas-template': MARSH });
    expect(await settingsOf(fan)).toMatchObject({ statblockRoles: [ROLE], statblockRoleFolders: { monster: 'atlas-vtt/collections/Fen/Monsters' } });
    expect(session.files.templates?.map((entry) => entry.template.id)).toEqual([MARSH]);
    const record = await readInstallRecord(fan.vault.app, (await fan.assets.getCollection('Fen'))!);
    expect(record?.templates?.[MARSH]).toMatchObject({ localId: MARSH, target: MARSH_PATH });
    expect(Object.keys(record?.files ?? {}).some((path) => path.endsWith('.atlastemplate'))).toBe(false);
  });

  it('reuses the same template wherever the vault keeps it, and writes none', async () => {
    const fan = await vaultWith({ 'Homebrew/Marsh.atlastemplate': packed() });
    await importInto(fan, await release(await creatorVault()));
    expect(templateFiles(fan)).toEqual(['Homebrew/Marsh.atlastemplate']);
    expect(parseFrontmatter(fan.vault.files.get(INSTALLED_NOTE)!)).toMatchObject({ 'atlas-template': MARSH });
  });

  it('updates a template the vault left as installed, silently and in place', async () => {
    const creator = await creatorVault();
    const fan = await vaultWith();
    await importInto(fan, await release(creator));
    creator.vault.files.set(MARSH_PATH, withCode('Marsh folk, revised'));

    const session = await importInto(fan, await release(creator, 2));
    expect(session.review).toMatchObject({ conflicts: [], templates: { copies: [], reusedNotes: [] } });
    expect(templateFiles(fan)).toEqual([MARSH_PATH]);
    expect(fan.vault.files.get(MARSH_PATH)).toBe(packed('Marsh folk, revised'));
  });

  it('brings a diverged template in as a copy, and points the collection\'s own notes and roles at it', async () => {
    const creator = await creatorVault();
    const fan = await vaultWith();
    await importInto(fan, await release(creator));
    const edited = packed('Our marsh');
    fan.vault.files.set(MARSH_PATH, edited);
    creator.vault.files.set(MARSH_PATH, withCode('Marsh folk, revised'));

    const session = await importInto(fan, await release(creator, 2));
    expect(session.review.conflicts).toEqual([]);
    expect(session.review.templates?.copies).toEqual([{ name: 'Marsh creature', copyName: 'Marsh creature (Fen)' }]);
    expect(fan.vault.files.get(MARSH_PATH)).toBe(edited);
    const copyId = idIn(fan.vault.files.get(COPY_PATH));
    expect(copyId).not.toBe(MARSH);
    expect(fan.vault.files.get(COPY_PATH)).toBe(packed('Marsh folk, revised').replace(MARSH, copyId));
    expect(parseFrontmatter(fan.vault.files.get(INSTALLED_NOTE)!)).toMatchObject({ 'atlas-template': copyId });
    expect((await settingsOf(fan))?.statblockRoles).toEqual([{ ...ROLE, templateId: copyId }]);

    // The next release updates the copy in place, as long as it was left alone
    creator.vault.files.set(MARSH_PATH, withCode('Marsh folk, third'));
    await importInto(fan, await release(creator, 3));
    expect(templateFiles(fan)).toEqual([COPY_PATH, MARSH_PATH]);
    expect(idIn(fan.vault.files.get(COPY_PATH))).toBe(copyId);
    expect(fan.vault.files.get(COPY_PATH)).toContain('Marsh folk, third');
  });

  it('points a new collection\'s notes and roles at the copy when the vault has its own version, and stays up to date', async () => {
    const mine = packed('Our marsh');
    const fan = await vaultWith({ [MARSH_PATH]: mine });
    const blob = await release(await creatorVault());
    await importInto(fan, blob);
    const copyId = idIn(fan.vault.files.get(COPY_PATH));
    expect(fan.vault.files.get(MARSH_PATH)).toBe(mine);
    expect(parseFrontmatter(fan.vault.files.get(INSTALLED_NOTE)!)).toMatchObject({ 'atlas-template': copyId });
    expect((await settingsOf(fan))?.statblockRoles).toEqual([{ ...ROLE, templateId: copyId }]);
    expect((await openCollectionImport(fan.vault.app, fan.assets, blob)).review).toMatchObject({ upToDate: true, conflicts: [], templates: { copies: [] } });
  });

  it('never rewrites a note it reuses in place, and switches it to the copy only when asked', async () => {
    const mine = '{\n  "format": "atlas-statblock-template", "version": 1, "id": "marsh-creature-k7m2qa", "fields": [], "layout": { "maxColumns": 2, "blocks": [] }\n}\n';
    const ownNote = `${note(MARSH)}\nMy own notes.`;
    const keeping = await vaultWith({ [MARSH_PATH]: mine, [NOTE]: ownNote });
    const blob = await release(await creatorVault());
    const kept = await importInto(keeping, blob);
    expect(kept.review.templates?.reusedNotes).toEqual([{ path: NOTE, name: 'Hag', from: MARSH, to: expect.any(String) as string }]);
    expect(keeping.vault.files.get(NOTE)).toBe(ownNote);
    expect(keeping.vault.files.get(MARSH_PATH)).toBe(mine);
    expect((await settingsOf(keeping))?.statblockRoles).toEqual([{ ...ROLE, templateId: idIn(keeping.vault.files.get(COPY_PATH)) }]);

    vi.stubGlobal('window', globalThis);
    const switching = await vaultWith({ [MARSH_PATH]: mine, [NOTE]: ownNote });
    await importInto(switching, blob, { switchReusedNotes: true });
    expect(switching.vault.files.get(NOTE)).toBe(ownNote.replace(MARSH, idIn(switching.vault.files.get(COPY_PATH))));
    NoteFieldWriter.release(switching.vault.app);
  });

  it('takes every file back, templates included, when the import fails midway', async () => {
    const creator = await creatorVault();
    const fan = await vaultWith();
    await importInto(fan, await release(creator));
    creator.vault.files.set(MARSH_PATH, withCode('Marsh folk, revised'));
    const session = await openCollectionImport(fan.vault.app, fan.assets, await release(creator, 2));

    const before = new Map(fan.vault.files);
    vi.spyOn(fan.assets, 'commitCollectionImport').mockRejectedValue(new Error('Disk full'));
    await expect(session.apply({})).rejects.toThrow('The import failed: Disk full. Nothing was changed.');
    expect(new Map([...fan.vault.files].filter(([path]) => !path.includes('/backups/')))).toEqual(before);
    expect(fan.vault.files.get(MARSH_PATH)).toBe(packed());

    // A first install takes back the templates it brought, and the library folder it made for them
    const fresh = await vaultWith();
    const install = await openCollectionImport(fresh.vault.app, fresh.assets, await release(creator, 3));
    vi.spyOn(fresh.assets, 'commitCollectionImport').mockRejectedValue(new Error('Disk full'));
    await expect(install.apply({})).rejects.toThrow('Nothing was changed.');
    expect(templateFiles(fresh)).toEqual([]);
    expect(fresh.vault.folders.has(LIBRARY)).toBe(false);
  });
});
