// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu, TFile, type EmbedContext } from 'obsidian';
import { AssetService, type EncounterAsset } from '../../src/app/services/AssetService';
import { SceneSnapshotService } from '../../src/app/snapshots/SceneSnapshotService';
import { sceneSnapshotFolder } from '../../src/app/snapshots/snapshotPaths';
import { primaryPath } from '../../src/app/services/vault-sync/assetFiles';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const links = vi.hoisted(() => ({ openSceneLink: vi.fn(async () => {}), placeEncounterFile: vi.fn(async () => {}) }));
vi.mock('../../src/app/links/openAtlasLink', () => links);

import { SceneEmbed } from '../../src/app/links/SceneEmbed';
import { EncounterEmbed } from '../../src/app/links/EncounterEmbed';

const MAP_PATH = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';

async function vaultWithScene(): Promise<{ vault: InMemoryApp; assets: AssetService }> {
  const vault = createInMemoryApp({
    files: {
      [MAP_PATH]: JSON.stringify({ version: 4, state: { mapPath: MAP_PATH } }),
      'atlas-vtt/collections/c/scenes/Cave.thumb.jpg': 'JPG',
      'atlas-vtt/assets/goblin.webp': 'WEBP',
    },
  });
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  return { vault, assets };
}

function context(vault: InMemoryApp): EmbedContext {
  return { app: vault.app as never, containerEl: document.createElement('div'), linktext: '', sourcePath: 'Notes/a.md', depth: 0 };
}

const textOf = (root: HTMLElement, cls: string): string | null | undefined => root.querySelector(`.${cls}`)?.textContent;

afterEach(() => {
  vi.clearAllMocks();
  AssetService.resetInstance();
});

describe('scene embed', () => {
  it('shows the scene with its thumbnail and opens it from its button', async () => {
    const { vault } = await vaultWithScene();
    const ctx = context(vault);
    const file = new TFile(MAP_PATH);
    const embed = new SceneEmbed(ctx, file, '');
    await embed.loadFile();

    expect(textOf(ctx.containerEl, 'atlas-link-embed__title')).toBe('Cave');
    expect(textOf(ctx.containerEl, 'atlas-link-embed__meta')).toBe('c');
    expect(ctx.containerEl.querySelector('img')?.getAttribute('src')).toBe('app://vault/atlas-vtt/collections/c/scenes/Cave.thumb.jpg');

    ctx.containerEl.querySelector<HTMLButtonElement>('button')!.click();
    expect(links.openSceneLink).toHaveBeenCalledWith(vault.app, file, '');
  });

  it('shows the snapshot a link names, and says when the scene has none of that name', async () => {
    const { vault, assets } = await vaultWithScene();
    const scene = (await assets.getAssets(undefined, 'scene'))[0]!;
    await new SceneSnapshotService(vault.app).create(sceneSnapshotFolder('c', scene.id), new TFile(MAP_PATH), 'Before the fight', new ArrayBuffer(3));

    const found = context(vault);
    await new SceneEmbed(found, new TFile(MAP_PATH), '#before the fight').loadFile();
    expect(textOf(found.containerEl, 'atlas-link-embed__title')).toBe('Before the fight');
    expect(textOf(found.containerEl, 'atlas-link-embed__meta')).toBe('Snapshot of Cave');
    expect(found.containerEl.querySelector('img')?.getAttribute('src')).toMatch(/\/snapshots\/.+\.jpg\?v=\d+$/);

    const missing = context(vault);
    await new SceneEmbed(missing, new TFile(MAP_PATH), '#Later').loadFile();
    expect(textOf(missing.containerEl, 'atlas-link-embed__title')).toBe('Cave');
    expect(textOf(missing.containerEl, 'atlas-link-embed__meta')).toBe('This scene has no snapshot named "Later".');
  });
});

describe('encounter embed', () => {
  async function encounter(assets: AssetService): Promise<EncounterAsset> {
    const goblin = { id: 'g', name: 'Goblin', imagePath: 'atlas-vtt/assets/goblin.webp' };
    return assets.createEncounter({ name: 'Goblin ambush', collection: 'c', tags: [], tokens: [goblin, { ...goblin, id: 'g2' }] });
  }

  it('shows the encounter by its name with its tokens, and places it from its button', async () => {
    const { vault, assets } = await vaultWithScene();
    const file = new TFile(primaryPath(await encounter(assets))!);
    const ctx = context(vault);
    await new EncounterEmbed(ctx, file, '').loadFile();

    expect(textOf(ctx.containerEl, 'atlas-link-embed__title')).toBe('Goblin ambush');
    expect(textOf(ctx.containerEl, 'atlas-link-embed__meta')).toBe('2 tokens · c');
    expect(ctx.containerEl.querySelectorAll('.atlas-link-embed__token')).toHaveLength(2);

    ctx.containerEl.querySelector<HTMLButtonElement>('button')!.click();
    expect(links.placeEncounterFile).toHaveBeenCalledWith(vault.app, file);
  });

  it('says so when the file is no encounter of the library', async () => {
    const { vault } = await vaultWithScene();
    const ctx = context(vault);
    await new EncounterEmbed(ctx, new TFile('atlas-vtt/collections/c/encounters/gone.json'), '').loadFile();
    expect(textOf(ctx.containerEl, 'atlas-link-embed__meta')).toBe('This encounter is no longer in your library.');
  });

  it('starts a fight with it, or adds it to initiative without placing it, from its menu', async () => {
    const { vault, assets } = await vaultWithScene();
    const file = new TFile(primaryPath(await encounter(assets))!);
    const ctx = context(vault);
    await new EncounterEmbed(ctx, file, '').loadFile();

    ctx.containerEl.querySelector<HTMLButtonElement>('.atlas-link-embed__more')!.click();
    const items = Menu.shown?.items ?? [];
    expect(items.map((item) => item.title)).toEqual(['Start fight', 'Add to initiative without placing']);
    for (const item of items) item.handler?.(new MouseEvent('click'));
    expect(links.placeEncounterFile).toHaveBeenCalledWith(vault.app, file, 'fight');
    expect(links.placeEncounterFile).toHaveBeenCalledWith(vault.app, file, 'beside');
  });

  it('offers no menu for a file that is no encounter of the library', async () => {
    const { vault } = await vaultWithScene();
    const ctx = context(vault);
    await new EncounterEmbed(ctx, new TFile('atlas-vtt/collections/c/encounters/gone.json'), '').loadFile();
    expect(ctx.containerEl.querySelector('.atlas-link-embed__more')).toBeNull();
  });
});
