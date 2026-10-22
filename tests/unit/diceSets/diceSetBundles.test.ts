// JSZip needs Node's ArrayBuffer realm; jsdom's differs and its Blob support is absent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../src/app/gameSystems/builtInPresets';
import { collectionDiceSet, findDiceSet } from '../../../src/app/gameSystems/diceSetResolution';
import { parseStoredDiceSet } from '../../../src/app/gameSystems/diceSetValidation';
import { AssetService } from '../../../src/app/services/AssetService';
import { exportCollectionBundle, prepareCollectionExport } from '../../../src/app/services/collectionBundle/collectionExport';
import { openCollectionImport } from '../../../src/app/services/collectionBundle/collectionImport';
import { readInstallRecord } from '../../../src/app/services/collectionBundle/installRecord';
import { diceSetsOf } from '../../../src/app/services/diceSets/collectionDiceSets';
import { systemPresetsOf } from '../../../src/app/services/mapCollectionRules';
import type { DiceSet } from '../../../src/app/types/diceSetTypes';
import { DICE_SET_FOLDER, DiceSetFiles } from '../../../src/app/services/diceSets/DiceSetFiles';
import { SystemPresetFiles } from '../../../src/app/services/systemPresets/SystemPresetFiles';
import { MARSH_CREATURE_JSON } from '../../fixtures/statblockTemplateFixtures';
import { createInMemoryApp, parseFrontmatter, type InMemoryApp } from '../../mocks/inMemoryVault';


const MARSH = 'marsh-creature-k7m2qa';
const MARSH_PATH = 'atlas-vtt/statblock-templates/Marsh creature.atlastemplate';
const ROLE = { id: 'monster', name: 'Monster', templateId: MARSH };
const DUALITY = { id: 'duality', name: 'Duality', crit: 'doubles', dice: [{ count: 1, sides: 12, name: 'Hope' }, { count: 1, sides: 12, name: 'Fear' }] };
const BOONS = { id: 'boons', name: 'Boons', crit: 'natural', dice: [{ count: 1, sides: 20 }, { count: 1, sides: 6, name: 'Boon' }] };
const DUALITY_PATH = `${DICE_SET_FOLDER}/Duality.json`;
const BOONS_PATH = `${DICE_SET_FOLDER}/Boons.json`;
const dnd = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;

/** The Marsh creature template rolling `diceSetId`. */
const template = (diceSetId: string): string => MARSH_CREATURE_JSON.replace('"description":', `"diceSetId": "${diceSetId}",\n  "description":`);

interface Vault { vault: InMemoryApp; assets: AssetService; sets: DiceSetFiles }

const apps: App[] = [];

async function vaultWith(files: Record<string, string> = {}): Promise<Vault> {
  const vault = createInMemoryApp({ files });
  (vault.app.vault as { readBinary: unknown }).readBinary = async (file: TFile): Promise<ArrayBuffer> =>
    new TextEncoder().encode(vault.files.get(file.path) ?? '').buffer as ArrayBuffer;
  vault.app.metadataCache.getFileCache = vi.fn((file: TFile) => {
    const frontmatter = parseFrontmatter(vault.files.get(file.path) ?? '');
    return frontmatter ? { frontmatter } : null;
  });
  apps.push(vault.app);
  await SystemPresetFiles.open(vault.app).load();
  const sets = DiceSetFiles.open(vault.app);
  await sets.load();
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  return { vault, assets, sets };
}

/** A collection "Fen" rolling Duality, on a user preset rolling Duality too, whose Monster template rolls Boons. */
async function creatorVault(settings: Record<string, unknown> = { diceSetId: 'duality', systemPresetId: 'marsh-preset', statblockRoles: [ROLE] }, templateSet = 'boons'): Promise<Vault> {
  const creator = await vaultWith({ [MARSH_PATH]: template(templateSet) });
  creator.sets.create(DUALITY);
  creator.sets.create(BOONS);
  const presets = SystemPresetFiles.forApp(creator.vault.app)!;
  presets.create({ id: 'marsh-preset', name: 'Marsh', builtIn: false, rules: { ...dnd.rules, diceSetId: 'duality' } });
  await Promise.all([creator.sets.flush(), presets.flush()]);
  await creator.assets.createCollection('Fen');
  await creator.assets.updateCollectionSettings('Fen', settings);
  return creator;
}

async function release({ vault, assets }: Vault, version = 1): Promise<Blob> {
  AssetService.resetInstance();
  const preview = await prepareCollectionExport(vault.app, assets, 'Fen');
  const bundle = await exportCollectionBundle(vault.app, assets, preview, { kind: 'release', version });
  await bundle.commit();
  return bundle.blob;
}

interface Manifest { format: number; files: Array<{ vaultPath: string; role: string; linkedFrom?: string[] }> }

async function manifestOf(blob: Blob): Promise<Manifest> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return JSON.parse(await zip.file('manifest.json')!.async('string')) as Manifest;
}

/** The bundle as an Atlas before dice sets would have written it: format 8, no dice set files. */
async function withoutDiceSets(blob: Blob): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as Manifest;
  for (const file of manifest.files.filter((entry) => entry.role === 'dice-set')) zip.remove(`files/${file.vaultPath}`);
  zip.file('manifest.json', JSON.stringify({ ...manifest, format: 8, files: manifest.files.filter((entry) => entry.role !== 'dice-set') }));
  return zip.generateAsync({ type: 'blob' });
}

async function importInto({ vault, assets, sets }: Vault, blob: Blob): Promise<void> {
  await sets.flush();
  const session = await openCollectionImport(vault.app, assets, blob);
  await session.apply({});
}

const setPaths = ({ vault }: Vault): string[] => [...vault.files.keys()].filter((path) => path.startsWith(`${DICE_SET_FOLDER}/`)).sort();
const fileOf = ({ vault }: Vault, path: string): Record<string, unknown> => JSON.parse(vault.files.get(path) ?? '{}') as Record<string, unknown>;
const templateSetOf = ({ vault }: Vault): string | undefined => (fileOf({ vault } as Vault, MARSH_PATH) as { diceSetId?: string }).diceSetId;
/** The set the collection "Fen" rolls a bare bonus with. */
async function rolledBy({ vault, assets }: Vault): Promise<DiceSet> {
  const settings = (await assets.getCollection('Fen'))!.settings;
  return collectionDiceSet(settings, systemPresetsOf(vault.app), diceSetsOf(vault.app));
}
const setIdOf = async ({ assets }: Vault): Promise<string | undefined> => (await assets.getCollection('Fen'))?.settings.diceSetId;

beforeEach(() => { AssetService.resetInstance(); });
afterEach(() => {
  for (const app of apps.splice(0)) {
    DiceSetFiles.release(app);
    SystemPresetFiles.release(app);
  }
  vi.restoreAllMocks();
});

describe('exporting a collection\'s dice sets', () => {
  it('carries the sets the collection, its preset and its templates roll with, once each, and records them by id', async () => {
    const creator = await creatorVault();
    const blob = await release(creator);
    const manifest = await manifestOf(blob);
    expect(manifest.format).toBe(9);
    const sets = manifest.files.filter((file) => file.role === 'dice-set');
    expect(sets).toEqual([
      expect.objectContaining({ vaultPath: DUALITY_PATH }),
      expect.objectContaining({ vaultPath: BOONS_PATH, linkedFrom: [MARSH_PATH] }),
    ]);
    expect(sets[0]).not.toHaveProperty('linkedFrom');
    const record = await readInstallRecord(creator.vault.app, (await creator.assets.getCollection('Fen'))!);
    expect(Object.keys(record?.diceSets ?? {}).sort()).toEqual(['boons', 'duality']);
    expect(Object.keys(record?.files ?? {})).not.toContain(DUALITY_PATH);
    // The publisher's vault holds what it released
    expect((await openCollectionImport(creator.vault.app, creator.assets, blob)).review).toMatchObject({ upToDate: true, conflicts: [] });
  });

  it('never carries a built-in set', async () => {
    const creator = await creatorVault({ diceSetId: 'builtin:d20', statblockRoles: [ROLE] }, 'builtin:power-roll');
    const manifest = await manifestOf(await release(creator));
    expect(manifest.files.some((file) => file.role === 'dice-set')).toBe(false);
  });
});

describe('importing a collection\'s dice sets', () => {
  it('brings them into a vault that lacks them, where the collection and its template roll them as the creator\'s do', async () => {
    const fan = await vaultWith();
    await importInto(fan, await release(await creatorVault()));
    expect(setPaths(fan)).toEqual([BOONS_PATH, DUALITY_PATH]);
    expect(fileOf(fan, DUALITY_PATH)).toMatchObject({ format: 1, ...DUALITY });
    expect(await rolledBy(fan)).toEqual(parseStoredDiceSet(DUALITY));
    expect(findDiceSet(diceSetsOf(fan.vault.app), templateSetOf(fan))).toEqual(parseStoredDiceSet(BOONS));
    const record = await readInstallRecord(fan.vault.app, (await fan.assets.getCollection('Fen'))!);
    expect(record?.diceSets?.duality).toMatchObject({ localId: 'duality' });
  });

  it('reuses the same sets, and an import of the same release writes nothing', async () => {
    const fan = await vaultWith();
    const blob = await release(await creatorVault());
    await importInto(fan, blob);
    const before = fan.vault.files.get(DUALITY_PATH);
    const session = await openCollectionImport(fan.vault.app, fan.assets, blob);
    expect(session.review).toMatchObject({ upToDate: true });
    await session.apply({});
    expect(fan.vault.files.get(DUALITY_PATH)).toBe(before);
  });

  it('updates a set the vault left as installed, silently and in place', async () => {
    const creator = await creatorVault();
    const fan = await vaultWith();
    await importInto(fan, await release(creator));
    creator.sets.update('duality', (stored) => ({ ...stored, crit: 'none' }));

    await importInto(fan, await release(creator, 2));
    expect(setPaths(fan)).toEqual([BOONS_PATH, DUALITY_PATH]);
    expect(fileOf(fan, DUALITY_PATH)).toMatchObject({ id: 'duality', crit: 'none' });
    expect(await setIdOf(fan)).toBe('duality');
  });

  it('never overwrites a set the vault changed: the bundle\'s comes in as a copy the collection and the template roll with', async () => {
    const creator = await creatorVault();
    const fan = await vaultWith();
    await importInto(fan, await release(creator));
    fan.sets.update('duality', (stored) => ({ ...stored, crit: 'natural' }));
    fan.sets.update('boons', (stored) => ({ ...stored, crit: 'none' }));
    await fan.sets.flush();
    creator.sets.update('duality', (stored) => ({ ...stored, crit: 'none' }));
    creator.sets.update('boons', (stored) => ({ ...stored, crit: 'doubles' }));

    await importInto(fan, await release(creator, 2));
    expect(fileOf(fan, DUALITY_PATH)).toMatchObject({ id: 'duality', crit: 'natural' });
    expect(fileOf(fan, BOONS_PATH)).toMatchObject({ id: 'boons', crit: 'none' });
    const duality = fileOf(fan, `${DICE_SET_FOLDER}/Duality (Fen).json`);
    const boons = fileOf(fan, `${DICE_SET_FOLDER}/Boons (Fen).json`);
    expect(duality).toMatchObject({ name: 'Duality (Fen)', crit: 'none' });
    expect(boons).toMatchObject({ name: 'Boons (Fen)', crit: 'doubles' });
    expect(await setIdOf(fan)).toBe(duality.id);
    expect(templateSetOf(fan)).toBe(boons.id);
    expect(await rolledBy(fan)).toMatchObject({ name: 'Duality (Fen)', crit: 'none' });
  });

  it('gives a set whose name a set of the vault has a name of its own, within a set name\'s length', async () => {
    const long = 'Hope and Fear of the Drowned Marsh Kings';
    const creator = await vaultWith();
    creator.sets.create({ ...DUALITY, name: long });
    await creator.sets.flush();
    await creator.assets.createCollection('Fen');
    await creator.assets.updateCollectionSettings('Fen', { diceSetId: 'duality' });
    const fan = await vaultWith();
    fan.sets.create({ ...DUALITY, id: 'own', name: long });
    await importInto(fan, await release(creator));
    const imported = diceSetsOf(fan.vault.app).find((set) => set.id === 'duality');
    expect(imported?.name).toBe(`${long.slice(0, 34).trimEnd()} (Fen)`);
    expect(imported?.name.length).toBeLessThanOrEqual(40);
    expect(diceSetsOf(fan.vault.app).filter((set) => set.name === long).map((set) => set.id)).toEqual(['own']);
  });

  it('imports a bundle of an older format: a collection whose set did not come along rolls its system\'s dice', async () => {
    const fan = await vaultWith();
    await importInto(fan, await withoutDiceSets(await release(await creatorVault({ diceSetId: 'duality' }))));
    expect(setPaths(fan)).toEqual([]);
    expect(await setIdOf(fan)).toBe('duality');
    expect((await rolledBy(fan)).id).toBe('builtin:d20');
  });
});
