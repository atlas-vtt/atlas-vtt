// JSZip needs Node's ArrayBuffer realm; jsdom's differs and its Blob support is absent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { AssetService } from '../../src/app/services/AssetService';
import { exportCollectionBundle, prepareCollectionExport } from '../../src/app/services/collectionBundle/collectionExport';
import { openCollectionImport } from '../../src/app/services/collectionBundle/collectionImport';
import { readInstallRecord } from '../../src/app/services/collectionBundle/installRecord';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import { SYSTEM_PRESET_FOLDER } from '../../src/app/services/systemPresets/presetFiles';
import { SystemPresetFiles } from '../../src/app/services/systemPresets/SystemPresetFiles';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';


const PRESET = 'marsh-rules';
const PRESET_PATH = `${SYSTEM_PRESET_FOLDER}/Marsh.json`;
const COPY_PATH = `${SYSTEM_PRESET_FOLDER}/Marsh (Fen).json`;
const IMAGE = 'atlas-vtt/assets/hag.webp';
const rules = structuredClone(BUILT_IN_SYSTEM_PRESETS[1]!.rules);

interface Vault { vault: InMemoryApp; assets: AssetService; presets: SystemPresetFiles; service: SystemPresetService }

const opened: App[] = [];

async function vaultWith(files: Record<string, string> = {}): Promise<Vault> {
  const vault = createInMemoryApp({ files });
  (vault.app.vault as { readBinary: unknown }).readBinary = async (file: TFile): Promise<ArrayBuffer> =>
    new TextEncoder().encode(vault.files.get(file.path) ?? '').buffer as ArrayBuffer;
  opened.push(vault.app);
  const presets = SystemPresetFiles.open(vault.app);
  await presets.load();
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  return { vault, assets, presets, service: new SystemPresetService(presets) };
}

/** A collection "Fen" on the user preset "Marsh", with one token. */
async function creatorVault(systemPresetId: string = PRESET): Promise<Vault> {
  const creator = await vaultWith({ [IMAGE]: 'IMG' });
  creator.presets.create({ id: PRESET, name: 'Marsh', builtIn: false, rules });
  await creator.presets.flush();
  await creator.assets.createCollection('Fen');
  await creator.assets.updateCollectionSettings('Fen', { systemPresetId });
  await creator.assets.addTokenAsset({ name: 'Hag', imagePath: IMAGE, collection: 'Fen', tags: [] });
  return creator;
}

async function release({ vault, assets, presets }: Vault, version = 1): Promise<Blob> {
  await presets.flush();
  AssetService.resetInstance();
  const preview = await prepareCollectionExport(vault.app, assets, 'Fen');
  const bundle = await exportCollectionBundle(vault.app, assets, preview, { kind: 'release', version });
  await bundle.commit();
  return bundle.blob;
}

async function manifestOf(blob: Blob): Promise<{ format: number; files: Array<{ vaultPath: string; role: string }> }> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return JSON.parse(await zip.file('manifest.json')!.async('string')) as { format: number; files: Array<{ vaultPath: string; role: string }> };
}

async function importInto({ vault, assets, presets }: Vault, blob: Blob): Promise<void> {
  await presets.flush();
  const session = await openCollectionImport(vault.app, assets, blob);
  await session.apply({});
}

const presetPaths = ({ vault }: Vault): string[] =>
  [...vault.files.keys()].filter((path) => path.startsWith(`${SYSTEM_PRESET_FOLDER}/`)).sort();
const fileOf = ({ vault }: Vault, path: string): Record<string, unknown> => JSON.parse(vault.files.get(path) ?? '{}') as Record<string, unknown>;
const systemOf = async ({ assets }: Vault): Promise<string | undefined> => (await assets.getCollection('Fen'))?.settings.systemPresetId;

beforeEach(() => { AssetService.resetInstance(); });
afterEach(() => {
  for (const app of opened.splice(0)) SystemPresetFiles.release(app);
  vi.restoreAllMocks();
});

describe('a collection on a user preset', () => {
  it('carries the preset\'s file, says format 8 and records it by id', async () => {
    const creator = await creatorVault();
    const manifest = await manifestOf(await release(creator));
    expect(manifest.format).toBe(8);
    expect(manifest.files).toContainEqual(expect.objectContaining({ vaultPath: PRESET_PATH, role: 'system-preset' }));
    const record = await readInstallRecord(creator.vault.app, (await creator.assets.getCollection('Fen'))!);
    expect(record?.presets?.[PRESET]).toMatchObject({ localId: PRESET });
    expect(Object.keys(record?.files ?? {})).not.toContain(PRESET_PATH);
  });

  it('carries no preset when the collection is on a built-in one', async () => {
    const manifest = await manifestOf(await release(await creatorVault('builtin:dnd5e')));
    expect(manifest.files.some((file) => file.role === 'system-preset')).toBe(false);
    expect(manifest.format).toBe(6);
  });

  it('brings the preset into a vault that lacks it, under its own id', async () => {
    const fan = await vaultWith();
    await importInto(fan, await release(await creatorVault()));
    expect(presetPaths(fan)).toEqual([PRESET_PATH]);
    expect(fileOf(fan, PRESET_PATH)).toMatchObject({ format: 1, id: PRESET, name: 'Marsh' });
    expect(fan.service.list().find((preset) => preset.id === PRESET)).toMatchObject({ name: 'Marsh' });
    expect(await systemOf(fan)).toBe(PRESET);
    const record = await readInstallRecord(fan.vault.app, (await fan.assets.getCollection('Fen'))!);
    expect(record?.presets?.[PRESET]).toMatchObject({ localId: PRESET });
  });

  it('reuses the same preset, and an import of the same release writes nothing', async () => {
    const creator = await creatorVault();
    const fan = await vaultWith();
    const blob = await release(creator);
    await importInto(fan, blob);
    const text = fan.vault.files.get(PRESET_PATH);
    vi.mocked(fan.vault.app.vault.modifyBinary).mockClear();
    const session = await openCollectionImport(fan.vault.app, fan.assets, blob);
    expect(session.review).toMatchObject({ upToDate: true });
    await session.apply({});
    expect(fan.vault.files.get(PRESET_PATH)).toBe(text);
    expect(fan.vault.app.vault.modifyBinary).not.toHaveBeenCalled();
  });

  it('updates a preset the vault left as installed, silently and in place', async () => {
    const creator = await creatorVault();
    const fan = await vaultWith();
    await importInto(fan, await release(creator));
    creator.service.update(PRESET, { ...rules, conditions: [] });

    await importInto(fan, await release(creator, 2));
    expect(presetPaths(fan)).toEqual([PRESET_PATH]);
    expect(fileOf(fan, PRESET_PATH)).toMatchObject({ id: PRESET, rules: { conditions: [] } });
    expect(await systemOf(fan)).toBe(PRESET);
  });

  it('never overwrites a preset the vault changed: the bundle\'s comes in as a copy the collection points at', async () => {
    const creator = await creatorVault();
    const fan = await vaultWith();
    await importInto(fan, await release(creator));
    fan.service.update(PRESET, { ...rules, conditions: rules.conditions.slice(0, 1) });
    await fan.presets.flush();
    const mine = fan.vault.files.get(PRESET_PATH);
    creator.service.update(PRESET, { ...rules, conditions: [] });

    await importInto(fan, await release(creator, 2));
    expect(fan.vault.files.get(PRESET_PATH)).toBe(mine);
    const copy = fileOf(fan, COPY_PATH);
    expect(copy).toMatchObject({ name: 'Marsh (Fen)', rules: { conditions: [] } });
    expect(copy.id).not.toBe(PRESET);
    expect(await systemOf(fan)).toBe(copy.id);

    // The next release updates the copy in place, as long as it was left alone
    creator.service.update(PRESET, { ...rules, conditions: rules.conditions.slice(0, 2) });
    await importInto(fan, await release(creator, 3));
    expect(presetPaths(fan)).toEqual([COPY_PATH, PRESET_PATH]);
    expect(fileOf(fan, COPY_PATH)).toMatchObject({ id: copy.id, name: 'Marsh (Fen)' });
    expect((fileOf(fan, COPY_PATH).rules as { conditions: unknown[] }).conditions).toHaveLength(2);
  });

  it('gives a preset whose name another preset of the vault has a name of its own', async () => {
    const fan = await vaultWith();
    fan.service.create('Marsh', rules);
    await importInto(fan, await release(await creatorVault()));
    expect(fileOf(fan, COPY_PATH)).toMatchObject({ id: PRESET, name: 'Marsh (Fen)' });
    expect(fan.service.list().filter((preset) => !preset.builtIn).map((preset) => preset.name)).toEqual(['Marsh', 'Marsh (Fen)']);
  });
});
