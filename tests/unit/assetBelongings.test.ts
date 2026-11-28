import { describe, expect, it } from 'vitest';
import type { Asset } from '../../src/app/services/AssetService';
import { belongingsOf, tokenArtwork, trashedOnDelete, type Belonging } from '../../src/app/services/assetBelongings';

const base = { tags: [], collection: 'fen', createdAt: 0, modifiedAt: 0 };
const C = 'atlas-vtt/collections/fen';

const goblin: Asset = { ...base, id: 'tok', name: 'Goblin', type: 'token', imagePath: 'atlas-vtt/assets/goblin.webp', thumbnailPath: 'atlas-vtt/assets/thumbnails/goblin-1.webp', statblockPath: 'Bestiary/Goblin.md' };
const region: Asset = { ...base, id: 'map', name: 'Region', type: 'map', mapFilePath: 'atlas-vtt/assets/region.webp', thumbnailPath: 'atlas-vtt/assets/thumbnails/region-1.png' };
const cave: Asset = { ...base, id: 'scn', name: 'Cave', type: 'scene', data: { mapPath: `${C}/scenes/Cave.atlasmap` } };
const ambush: Asset = { ...base, id: 'enc', name: 'Ambush', type: 'encounter', tokens: [], thumbnailUrl: 'app://x/atlas-vtt/assets/encounter-thumbnails/ambush.png' };

describe('the files that are part of an asset', () => {
  it.each<[string, Asset, Parameters<typeof belongingsOf>[1], Belonging[]]>([
    ['a token: its image and its thumbnail in both formats, all its own', goblin, {}, [
      { path: 'atlas-vtt/assets/goblin.webp', role: 'token-image', shared: false },
      { path: 'atlas-vtt/assets/thumbnails/goblin-1.webp', role: 'thumbnail', shared: false },
      { path: 'atlas-vtt/assets/thumbnails/goblin-1.png', role: 'thumbnail', shared: false },
    ]],
    ['a map: its record, and an image and thumbnails copies may share', region, {}, [
      { path: `${C}/maps/map.json`, role: 'asset-file', shared: false },
      { path: 'atlas-vtt/assets/region.webp', role: 'background', shared: true },
      { path: 'atlas-vtt/assets/thumbnails/region-1.png', role: 'thumbnail', shared: true },
      { path: 'atlas-vtt/assets/thumbnails/region-1.webp', role: 'thumbnail', shared: true },
    ]],
    ['a scene: its record, map and the thumbnail beside the map', cave, { mapPath: `${C}/scenes/Cave.atlasmap` }, [
      { path: `${C}/scenes/scn.json`, role: 'asset-file', shared: false },
      { path: `${C}/scenes/Cave.atlasmap`, role: 'scene-map', shared: false },
      { path: `${C}/scenes/Cave.thumb.jpg`, role: 'scene-thumbnail', shared: false },
    ]],
    ['a scene whose map is not found: its record alone', cave, {}, [
      { path: `${C}/scenes/scn.json`, role: 'asset-file', shared: false },
    ]],
    ['an encounter with its thumbnail found, which copies may share', ambush, { encounterThumbnail: 'atlas-vtt/assets/encounter-thumbnails/ambush.png' }, [
      { path: `${C}/encounters/enc.json`, role: 'asset-file', shared: false },
      { path: 'atlas-vtt/assets/encounter-thumbnails/ambush.png', role: 'thumbnail', shared: true },
    ]],
    ['an encounter without', ambush, {}, [{ path: `${C}/encounters/enc.json`, role: 'asset-file', shared: false }]],
    ['a statblock record', { ...base, id: 'stb', name: 'Ogre', type: 'statblock' }, {}, [{ path: `${C}/statblocks/stb.json`, role: 'asset-file', shared: false }]],
    ['a character record', { ...base, id: 'chr', name: 'Hero', type: 'character' }, {}, [{ path: `${C}/characters/chr.json`, role: 'asset-file', shared: false }]],
    ['a token without art or thumbnail: nothing', { ...base, id: 't0', name: 'Blank', type: 'token', imagePath: '' }, {}, []],
  ])('%s', (_, asset, found, expected) => {
    expect(belongingsOf(asset, found)).toEqual(expected);
  });

  it('counts the image and thumbnails of tokens alone as token artwork', () => {
    expect(tokenArtwork([goblin, region, cave])).toEqual(new Set([
      'atlas-vtt/assets/goblin.webp', 'atlas-vtt/assets/thumbnails/goblin-1.webp', 'atlas-vtt/assets/thumbnails/goblin-1.png',
    ]));
  });
});

describe('what a delete trashes', () => {
  const file = (path: string, role: Belonging['role'], shared: boolean): Belonging => ({ path, role, shared });
  const belongings = [
    file('Art/token.png', 'token-image', false),
    file('atlas-vtt/assets/used.webp', 'background', true),
    file('atlas-vtt/assets/unused.webp', 'thumbnail', true),
    file('Art/outside.png', 'background', true),
    file(`${C}/scenes/Cave.thumb.jpg`, 'scene-thumbnail', false),
  ];

  it('trashes what the asset owns wherever it lies, a shared file in Atlas\'s folder once unused, and leaves a scene\'s thumbnail to the vault check', () => {
    expect(trashedOnDelete(belongings, (path) => path === 'atlas-vtt/assets/used.webp')).toEqual(['Art/token.png', 'atlas-vtt/assets/unused.webp']);
  });

  it('keeps every shared file while their use cannot be told', () => {
    expect(trashedOnDelete(belongings, () => true)).toEqual(['Art/token.png']);
  });
});
