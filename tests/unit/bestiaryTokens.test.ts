// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { hasBestiaryTokens, installBestiaryTokens } from '../../src/app/services/stockPacks/bestiaryTokens';
import { StockPackError, type PackedFile } from '../../src/app/services/stockPacks/verifiedFetch';
import { sha256 } from '../../src/app/utils/hashing';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const HOST = 'https://assets.atlas-vtt.dev/starter/bestiary-2/';

beforeEach(() => AssetService.resetInstance());

async function setup(): Promise<{ vault: InMemoryApp; assets: AssetService; settings: SettingsService }> {
  const vault = createInMemoryApp();
  const settings = new SettingsService(vault.app);
  await settings.initialize();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  return { vault, assets, settings };
}

const bytesOf = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;

async function described(key: string, bytes: ArrayBuffer): Promise<PackedFile> {
  return { key, bytes: bytes.byteLength, sha256: await sha256(bytes) };
}

/** A pack of its own, since the real manifest's hash names the hosted one; `edit` changes the manifest before it is pinned. */
async function packOf(names: readonly string[] | Readonly<Record<string, string>>, edit: (manifest: Record<string, unknown>) => void = () => undefined): Promise<{ served: Map<string, ArrayBuffer>; manifest: PackedFile }> {
  const served = new Map<string, ArrayBuffer>();
  const credits = bytesOf('# Bestiary tokens\n\nArt by Oozejar, CC BY-SA 4.0.\n');
  served.set('credits.md', credits);
  const tokens = [];
  const tagged = Array.isArray(names) ? Object.fromEntries(names.map((name) => [name, 'Beasts'])) : names;
  for (const [name, tag] of Object.entries(tagged)) {
    const key = `${name.toLowerCase().replace(/ /g, '-')}.webp`;
    const image = bytesOf(`RIFF____WEBPVP8 ${name}`);
    served.set(key, image);
    tokens.push({ ...(await described(key, image)), name, tags: [tag] });
  }
  const manifest: Record<string, unknown> = { format: 2, credits: await described('credits.md', credits), tokens };
  edit(manifest);
  const json = bytesOf(JSON.stringify(manifest));
  served.set('manifest.json', json);
  return { served, manifest: await described('manifest.json', json) };
}

const serving = (served: Map<string, ArrayBuffer>) => vi.fn(async (url: string): Promise<ArrayBuffer> => {
  const bytes = url.startsWith(HOST) ? served.get(url.slice(HOST.length)) : undefined;
  if (!bytes) throw new Error(`404 ${url}`);
  return bytes;
});

describe('the bestiary tokens', () => {
  it('join the collection with the tags the pack gives them, and a note that credits the art', async () => {
    const { vault, assets, settings } = await setup();
    const collection = assets.getDefaultCollectionId();
    const { served, manifest } = await packOf({ 'Black Dragon': 'Dragons', Wolf: 'Beasts', Wizard: 'Class' });
    const steps: number[] = [];

    expect(await installBestiaryTokens(vault.app, assets, assets.getDefaultCollectionId(), { fetch: serving(served), manifest, onStep: (share) => steps.push(share) })).toBe(3);

    const tokens = await assets.getAssets(collection, 'token');
    const pack = tokens.filter((token) => token.id.startsWith('token-bestiary-'));
    const { uid } = (await assets.getCollection(collection))!;
    expect(pack.map((token) => [token.id, token.name, token.tags]).sort()).toEqual([
      [`token-bestiary-${uid}-black-dragon`, 'Black Dragon', ['Dragons']],
      [`token-bestiary-${uid}-wizard`, 'Wizard', ['Class']],
      [`token-bestiary-${uid}-wolf`, 'Wolf', ['Beasts']],
    ]);
    expect((await assets.getCollectionTags(collection, 'tokens')).map((tag) => tag.name).sort()).toEqual(['Beasts', 'Class', 'Dragons']);
    for (const token of pack) {
      expect(token.showRing).toBe(true);
      expect(vault.files.has(token.imagePath)).toBe(true);
    }
    const notes = await assets.getAssets(collection, 'note');
    expect(notes.map((note) => note.name)).toEqual(['Starter token credits']);
    expect(vault.files.get(`atlas-vtt/collections/${collection}/notes/Starter token credits.md`)).toContain('Oozejar');
    expect(steps[0]).toBe(0);
    expect(steps.at(-1)).toBe(1);
    expect(await hasBestiaryTokens(assets, collection)).toBe(true);
    expect(settings.getSetting('onboarding').tokenImported).toBe(false);
    expect(vault.app.workspace.trigger).toHaveBeenCalledWith('atlas-vtt:refresh-assets');
  });

  it('writes nothing when a file is not the one the manifest names, or the manifest not the pinned one', async () => {
    const { vault, assets } = await setup();
    const { served, manifest } = await packOf(['Wolf']);
    const files = vault.files.size;

    served.set('wolf.webp', bytesOf('RIFF____WEBPVP8 Wolg'));
    await expect(installBestiaryTokens(vault.app, assets, assets.getDefaultCollectionId(), { fetch: serving(served), manifest })).rejects.toBeInstanceOf(StockPackError);
    await expect(installBestiaryTokens(vault.app, assets, assets.getDefaultCollectionId(), { fetch: serving(served), manifest: { ...manifest, sha256: '0'.repeat(64) } })).rejects.toBeInstanceOf(StockPackError);

    expect(vault.files.size).toBe(files);
    expect(await hasBestiaryTokens(assets, assets.getDefaultCollectionId())).toBe(false);
  });

  it('takes no tag a tag cannot be', async () => {
    const { vault, assets } = await setup();
    const { served, manifest } = await packOf({ Wolf: '' });
    await expect(installBestiaryTokens(vault.app, assets, assets.getDefaultCollectionId(), { fetch: serving(served), manifest })).rejects.toThrow('tags it cannot have');
  });

  it('takes no file name that could leave its folder', async () => {
    const { vault, assets } = await setup();
    const { served, manifest } = await packOf(['Wolf'], (data) => {
      (data.tokens as { key: string }[])[0]!.key = '../wolf.webp';
    });
    await expect(installBestiaryTokens(vault.app, assets, assets.getDefaultCollectionId(), { fetch: serving(served), manifest })).rejects.toThrow('does not describe');
  });

  it('adds only what the library lacks, so a second download duplicates nothing', async () => {
    const { vault, assets } = await setup();
    const { served, manifest } = await packOf(['Wolf', 'Bear']);
    const collection = assets.getDefaultCollectionId();
    await installBestiaryTokens(vault.app, assets, collection, { fetch: serving(served), manifest });
    await assets.deleteAsset(`token-bestiary-${(await assets.getCollection(collection))!.uid}-wolf`);

    expect(await installBestiaryTokens(vault.app, assets, assets.getDefaultCollectionId(), { fetch: serving(served), manifest })).toBe(1);
    expect(await installBestiaryTokens(vault.app, assets, assets.getDefaultCollectionId(), { fetch: serving(served), manifest })).toBe(0);
    const names = (await assets.getTokenAssets()).filter((token) => token.id.startsWith('token-bestiary-')).map((token) => token.name);
    expect(names.sort()).toEqual(['Bear', 'Wolf']);
    expect((await assets.getAssets(assets.getDefaultCollectionId(), 'note'))).toHaveLength(1);
  });

  it('go into the collection asked for, and each collection can hold its own set', async () => {
    const { vault, assets } = await setup();
    await assets.createCollection('Monsters');
    const { served, manifest } = await packOf(['Wolf']);

    expect(await installBestiaryTokens(vault.app, assets, 'Monsters', { fetch: serving(served), manifest })).toBe(1);
    expect((await assets.getAssets('Monsters', 'token')).map((token) => token.name)).toEqual(['Wolf']);
    expect(vault.files.has('atlas-vtt/collections/Monsters/notes/Starter token credits.md')).toBe(true);
    expect(await hasBestiaryTokens(assets, 'Monsters')).toBe(true);
    expect(await hasBestiaryTokens(assets, assets.getDefaultCollectionId())).toBe(false);

    expect(await installBestiaryTokens(vault.app, assets, assets.getDefaultCollectionId(), { fetch: serving(served), manifest })).toBe(1);
    expect(await hasBestiaryTokens(assets, assets.getDefaultCollectionId())).toBe(true);
  });
});
