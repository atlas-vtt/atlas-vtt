// JSZip needs Node's ArrayBuffer realm; jsdom's differs and its Blob support is absent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { AssetService } from '../../../../src/app/services/AssetService';
import { exportCollectionBundle, prepareCollectionExport } from '../../../../src/app/services/collectionBundle/collectionExport';
import { openCollectionImport } from '../../../../src/app/services/collectionBundle/collectionImport';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { savedTemplateBody, statblockNoteText } from '../../../../src/app/statblocks/notes/createStatblockNote';
import { MARSH_CREATURE_JSON } from '../../../fixtures/statblockTemplateFixtures';
import { createInMemoryApp, parseFrontmatter, type InMemoryApp } from '../../../mocks/inMemoryVault';

// Linking a token to a statblock is tested on its own; its imports reach the canvas renderer.
vi.mock('../../../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: vi.fn() } }));

const MARSH = 'marsh-creature-k7m2qa';
const LIBRARY = 'atlas-vtt/statblock-templates';
const MARSH_PATH = `${LIBRARY}/Marsh creature.atlastemplate`;
const BODY_PATH = `${LIBRARY}/Marsh creature.md`;
const COPY_PATH = `${LIBRARY}/Marsh creature (Fen).atlastemplate`;
const COPY_BODY_PATH = `${LIBRARY}/Marsh creature (Fen).md`;
const ROLE = { id: 'monster', name: 'Monster', templateId: MARSH };
const BODY = '## Tactics\n\nLurks below the reeds.\n';

interface Vault { vault: InMemoryApp; assets: AssetService }

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
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  return { vault, assets };
}

/** A collection "Fen" whose Monster role starts from the Marsh creature, with the note beside the template. */
async function creatorVault(body: string = BODY): Promise<Vault> {
  const creator = await vaultWith({ [MARSH_PATH]: MARSH_CREATURE_JSON, [BODY_PATH]: body });
  await creator.assets.createCollection('Fen');
  await creator.assets.updateCollectionSettings('Fen', { statblockRoles: [ROLE] });
  return creator;
}

async function release({ vault, assets }: Vault, version = 1): Promise<Blob> {
  AssetService.resetInstance();
  const preview = await prepareCollectionExport(vault.app, assets, 'Fen');
  const bundle = await exportCollectionBundle(vault.app, assets, preview, { kind: 'release', version });
  await bundle.commit();
  return bundle.blob;
}

async function unzip(blob: Blob): Promise<{ files: Array<{ vaultPath: string; role: string; linkedFrom?: string[] }>; text: (path: string) => Promise<string | undefined> }> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as { files: Array<{ vaultPath: string; role: string }> };
  return { files: manifest.files, text: async (path) => zip.file(`files/${path}`)?.async('string') };
}

async function importInto({ vault, assets }: Vault, blob: Blob): Promise<void> {
  const session = await openCollectionImport(vault.app, assets, blob);
  await session.apply({});
}

const idIn = (text: string | undefined): string => (JSON.parse(text ?? '{}') as { id: string }).id;

beforeEach(() => {
  AssetService.resetInstance();
  // The template library gives the browser turns on the main window's timers, which Obsidian always has.
  vi.stubGlobal('window', { setTimeout });
});
afterEach(() => {
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('a template\'s note in a collection bundle', () => {
  it('travels with its template, as the user sees it, and the publisher\'s release is up to date with it', async () => {
    const creator = await creatorVault();
    const blob = await release(creator);
    const { files, text } = await unzip(blob);
    expect(files).toContainEqual({ vaultPath: BODY_PATH, role: 'statblock-template-body', linkedFrom: [MARSH_PATH], sha256: expect.any(String) as string });
    expect(await text(BODY_PATH)).toBe(BODY);
    expect((await openCollectionImport(creator.vault.app, creator.assets, blob)).review).toMatchObject({ upToDate: true, conflicts: [] });
  });

  it('stays behind when it is empty', async () => {
    const { files } = await unzip(await release(await creatorVault('')));
    expect(files.some((file) => file.role === 'statblock-template-body')).toBe(false);
  });

  it('comes in beside the imported template, and new statblocks of the template start with its text', async () => {
    const fan = await vaultWith();
    await importInto(fan, await release(await creatorVault()));
    expect(fan.vault.files.get(BODY_PATH)).toBe(BODY);
    const body = await savedTemplateBody(fan.vault.app, MARSH);
    expect(body).toBe(BODY);
    expect(statblockNoteText({ name: 'Bog hag', templateId: MARSH, body })).toBe(`---\nstatblock: true\natlas-template: ${MARSH}\nname: Bog hag\n---\n${BODY}`);
  });

  it('never lands on a note of the vault: the template then takes a name whose note is free', async () => {
    const fan = await vaultWith({ [BODY_PATH]: 'My own notes on marshes.' });
    await importInto(fan, await release(await creatorVault()));
    expect(fan.vault.files.get(BODY_PATH)).toBe('My own notes on marshes.');
    expect(idIn(fan.vault.files.get(COPY_PATH))).toBe(MARSH);
    expect(fan.vault.files.get(COPY_BODY_PATH)).toBe(BODY);
    expect(fan.vault.files.has(MARSH_PATH)).toBe(false);
  });

  it('is updated with its template while left as installed, and removed when the release has none', async () => {
    const creator = await creatorVault();
    const fan = await vaultWith();
    const first = await release(creator);
    await importInto(fan, first);
    expect((await openCollectionImport(fan.vault.app, fan.assets, first)).review).toMatchObject({ upToDate: true });

    creator.vault.files.set(BODY_PATH, '## Tactics\n\nDrags prey under.\n');
    await importInto(fan, await release(creator, 2));
    expect(fan.vault.files.get(BODY_PATH)).toBe('## Tactics\n\nDrags prey under.\n');
    expect(fan.vault.files.has(COPY_PATH)).toBe(false);

    creator.vault.files.delete(BODY_PATH);
    await importInto(fan, await release(creator, 3));
    expect(fan.vault.files.has(BODY_PATH)).toBe(false);
    expect(fan.vault.files.get(MARSH_PATH)).toBe(MARSH_CREATURE_JSON);
  });

  it('counts as the user\'s change: a release then brings template and note in as a copy beside them', async () => {
    const creator = await creatorVault();
    const fan = await vaultWith();
    await importInto(fan, await release(creator));
    fan.vault.files.set(BODY_PATH, 'Our own tactics.');
    creator.vault.files.set(BODY_PATH, '## Tactics\n\nDrags prey under.\n');

    await importInto(fan, await release(creator, 2));
    expect(fan.vault.files.get(BODY_PATH)).toBe('Our own tactics.');
    expect(fan.vault.files.get(MARSH_PATH)).toBe(MARSH_CREATURE_JSON);
    expect(idIn(fan.vault.files.get(COPY_PATH))).not.toBe(MARSH);
    expect(fan.vault.files.get(COPY_BODY_PATH)).toBe('## Tactics\n\nDrags prey under.\n');
  });
});
