import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';

import { formatServiceAsset, partitionByTab, tokenPreviewSources, withThumbnails } from '../../src/app/packages/components/asset-manager/utils/assetFormatters';
import type { Asset, EncounterAsset, TokenAsset } from '../../src/app/services/AssetService';

function createAppWithFiles(paths: string[]): any {
  const files = new Set(paths);
  return {
    vault: {
      getAbstractFileByPath: (path: string) => (files.has(path) ? new TFile(path) : null),
      getResourcePath: (file: TFile) => `resource://${file.path}`,
    },
  };
}

const TAB_BASE = 'atlas-vtt/collections/default/tokens';
const token = (id: string, imagePath: string, thumbnailPath?: string): TokenAsset => ({
  id, type: 'token', name: id, imagePath, tags: [], collection: 'default', createdAt: 1, modifiedAt: 1,
  ...(thumbnailPath && { thumbnailPath }),
});

describe('formatServiceAsset thumbnails', () => {
  it('shows the thumbnail in the grid and keeps the full image for spawning', () => {
    const app = createAppWithFiles(['atlas-vtt/assets/goblin.png', 'atlas-vtt/assets/thumbnails/goblin-1.webp']);
    const formatted = formatServiceAsset(token('goblin', 'atlas-vtt/assets/goblin.png', 'atlas-vtt/assets/thumbnails/goblin-1.webp'), TAB_BASE, app);
    expect(formatted).toMatchObject({
      thumbnailUrl: 'resource://atlas-vtt/assets/thumbnails/goblin-1.webp',
      imageUrl: 'resource://atlas-vtt/assets/goblin.png',
    });
  });

  it('falls back to the full image while the thumbnail file is missing', () => {
    const app = createAppWithFiles(['atlas-vtt/assets/goblin.png']);
    const formatted = formatServiceAsset(token('goblin', 'atlas-vtt/assets/goblin.png', 'atlas-vtt/assets/thumbnails/goblin-1.webp'), TAB_BASE, app);
    expect(formatted.thumbnailUrl).toBe('resource://atlas-vtt/assets/goblin.png');
  });

  it('shows a placeholder, not the full image, while the thumbnail is being made', () => {
    const app = createAppWithFiles(['atlas-vtt/assets/goblin.png']);
    const formatted = formatServiceAsset(token('goblin', 'atlas-vtt/assets/goblin.png'), TAB_BASE, app, undefined, () => ({ pending: true }));
    expect(formatted).toMatchObject({ thumbnailUrl: '', thumbnailPending: true, imageUrl: 'resource://atlas-vtt/assets/goblin.png' });
  });

  it('shows a thumbnail that was made but is not recorded on the asset yet', () => {
    const made = 'atlas-vtt/assets/thumbnails/goblin-1.webp';
    const app = createAppWithFiles(['atlas-vtt/assets/goblin.png', made]);
    const formatted = formatServiceAsset(token('goblin', 'atlas-vtt/assets/goblin.png'), TAB_BASE, app, undefined, () => ({ path: made, pending: false }));
    expect(formatted.thumbnailUrl).toBe(`resource://${made}`);
    expect(formatted.thumbnailPending).toBeUndefined();
  });

  it('gives only the assets whose thumbnail arrived a new object', () => {
    const made = 'atlas-vtt/assets/thumbnails/goblin-1.webp';
    const app = createAppWithFiles(['atlas-vtt/assets/goblin.png', 'atlas-vtt/assets/wolf.png', made]);
    const pending = (): { pending: boolean } => ({ pending: true });
    const assets = ['goblin', 'wolf'].map((name) => formatServiceAsset(token(name, `atlas-vtt/assets/${name}.png`), TAB_BASE, app, undefined, pending));

    const next = withThumbnails(assets, [{ id: 'goblin', thumbnailPath: made }], app);

    expect(next[0]).toMatchObject({ thumbnailUrl: `resource://${made}` });
    expect(next[0]).not.toHaveProperty('thumbnailPending');
    expect(next[1]).toBe(assets[1]);
    expect(withThumbnails(next, [{ id: 'elsewhere', thumbnailPath: made }], app)).toBe(next);
    expect(withThumbnails(next, [{ id: 'goblin', thumbnailPath: made }], app)).toBe(next);
  });

  it('falls back to the image when no thumbnail could be made', () => {
    const app = createAppWithFiles(['atlas-vtt/assets/goblin.png']);
    const assets = [formatServiceAsset(token('goblin', 'atlas-vtt/assets/goblin.png'), TAB_BASE, app, undefined, () => ({ pending: true }))];
    const [shown] = withThumbnails(assets, [{ id: 'goblin', thumbnailPath: null }], app);
    expect(shown).toMatchObject({ thumbnailUrl: 'resource://atlas-vtt/assets/goblin.png' });
    expect(shown).not.toHaveProperty('thumbnailPending');
  });

  it('previews encounter tokens with their thumbnails where they exist, three at most', () => {
    const app = createAppWithFiles([
      'atlas-vtt/assets/goblin.png', 'atlas-vtt/assets/thumbnails/goblin-1.webp',
      'atlas-vtt/assets/wolf.png', 'atlas-vtt/assets/boss.png', 'atlas-vtt/assets/shaman.png',
    ]);
    const tokens = [token('goblin', 'atlas-vtt/assets/goblin.png', 'atlas-vtt/assets/thumbnails/goblin-1.webp'), token('wolf', 'atlas-vtt/assets/wolf.png')];
    const encounter: EncounterAsset = {
      id: 'enc', type: 'encounter', name: 'Ambush', tags: [], collection: 'default', createdAt: 1, modifiedAt: 1,
      tokens: ['goblin', 'wolf', 'boss', 'shaman'].map((name) => ({ id: name, name, imagePath: `atlas-vtt/assets/${name}.png` })),
    };

    const formatted = formatServiceAsset(encounter, 'atlas-vtt/collections/default/encounters', app, tokenPreviewSources(tokens));

    expect(formatted.type === 'encounters' && formatted.tokenPreviews.map((preview) => preview.url)).toEqual([
      'resource://atlas-vtt/assets/thumbnails/goblin-1.webp',
      'resource://atlas-vtt/assets/wolf.png',
      'resource://atlas-vtt/assets/boss.png',
    ]);
  });

  it('frames encounter previews like the tokens they spawn', () => {
    const app = createAppWithFiles(['atlas-vtt/assets/goblin.png', 'atlas-vtt/assets/wolf.png']);
    const tokens = [{ ...token('goblin', 'atlas-vtt/assets/goblin.png'), showRing: false }, token('wolf', 'atlas-vtt/assets/wolf.png')];
    const encounter: EncounterAsset = {
      id: 'enc', type: 'encounter', name: 'Ambush', tags: [], collection: 'default', createdAt: 1, modifiedAt: 1,
      tokens: [
        { id: 'goblin', name: 'goblin', imagePath: 'atlas-vtt/assets/goblin.png' },
        {
          id: 'map-wolf', name: 'wolf', imagePath: 'atlas-vtt/assets/wolf.png',
          state: { kind: 'token', imagePath: 'atlas-vtt/assets/wolf.png', ringColor: '#ff0000' },
        },
      ],
    };

    const formatted = formatServiceAsset(encounter, 'atlas-vtt/collections/default/encounters', app, tokenPreviewSources(tokens));

    expect(formatted.type === 'encounters' && formatted.tokenPreviews).toEqual([
      { url: 'resource://atlas-vtt/assets/goblin.png', showRing: false },
      { url: 'resource://atlas-vtt/assets/wolf.png', ringColor: '#ff0000' },
    ]);
  });
});

describe('partitionByTab', () => {
  it('groups the stored assets by tab, player characters apart from the other tokens, and drops the types the manager does not show', () => {
    const assets: Asset[] = [
      token('goblin', 'atlas-vtt/assets/goblin.png'),
      { ...token('ranger', 'atlas-vtt/assets/ranger.png'), playerCharacter: true },
      { id: 'map', type: 'map', name: 'Cave', mapFilePath: 'atlas-vtt/assets/cave.webp', tags: [], collection: 'default', createdAt: 1, modifiedAt: 1 },
      { id: 'scene', type: 'scene', name: 'Cave', tags: [], collection: 'default', createdAt: 1, modifiedAt: 1 },
      { id: 'enc', type: 'encounter', name: 'Ambush', tokens: [], tags: [], collection: 'default', createdAt: 1, modifiedAt: 1 },
      { id: 'party', type: 'player', name: 'Party', tokens: [], tags: [], collection: 'default', createdAt: 1, modifiedAt: 1 },
    ];
    const byTab = partitionByTab(assets);
    expect(Object.fromEntries(Object.entries(byTab).map(([tab, list]) => [tab, list.map((asset) => asset.id)]))).toEqual({
      tokens: ['goblin'], party: ['ranger'], maps: ['map'], scenes: ['scene'], encounters: ['enc'],
    });
  });
});
