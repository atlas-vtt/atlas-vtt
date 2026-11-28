// JSZip needs Node's ArrayBuffer realm; jsdom's differs and its Blob support is absent.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AssetService, type Asset } from '../../src/app/services/AssetService';
import { transferAssets } from '../../src/app/services/assetTransfer/assetTransfer';
import { exportCollectionBundle, prepareCollectionExport } from '../../src/app/services/collectionBundle/collectionExport';
import { CAMPAIGNS_FOLDER } from '../../src/app/campaigns/campaignPaths';
import { mapMemoryFolder } from '../../src/app/campaigns/exploredFolders';
import { ENCOUNTER_THUMBNAIL_DIR } from '../../src/app/encounters/encounterThumbnailFile';
import { createSnapshot } from '../../src/app/snapshots/sceneSnapshotFormat';
import { sceneSnapshotFolder } from '../../src/app/snapshots/snapshotPaths';
import { createInMemoryApp, parseFrontmatter, type InMemoryApp } from '../mocks/inMemoryVault';

/**
 * Which files go with an asset, per operation, on real files: what a delete trashes, what a move
 * takes away and brings, what a copy brings, and what an export of the collection packs (`role
 * path`). Ids in paths read as `{Name}` of their asset, and `{Name copy}` for a copy's new id.
 * Where the operations disagree about one file, the row holds what each does today.
 */

const A = 'atlas-vtt/assets';
const S = 'atlas-vtt/collections/source';
const T = 'atlas-vtt/collections/target';
const CAVE = `${S}/scenes/Cave.atlasmap`;
const LAIR = `${S}/scenes/Lair.atlasmap`;
const MEMORY = `${mapMemoryFolder(`${CAMPAIGNS_FOLDER}/Main`, CAVE)}/ground/player.png`;
const AMBUSH_THUMB = `${ENCOUNTER_THUMBNAIL_DIR}/ambush.png`;

interface Bench { vault: InMemoryApp; assets: AssetService }

async function bench(): Promise<Bench> {
  const vault = createInMemoryApp();
  (vault.app.vault as { readBinary: unknown }).readBinary = async (file: TFile): Promise<ArrayBuffer> =>
    new TextEncoder().encode(vault.files.get(file.path) ?? '').buffer as ArrayBuffer;
  vault.app.metadataCache.getFileCache = vi.fn((file: TFile) => {
    const frontmatter = parseFrontmatter(vault.files.get(file.path) ?? '');
    return frontmatter ? { frontmatter } : null;
  });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('source');
  await assets.createCollection('target');
  return { vault, assets };
}

async function put({ vault }: Bench, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) await vault.app.vault.create(path, content);
}

const atlasmap = (state: Record<string, unknown> = {}): string => JSON.stringify({
  version: 4,
  state: {
    schema: 'atlas-vtt', version: 4, background: null, grid: null, camera: { x: 0, y: 0, scale: 1 },
    objects: { tokens: {}, pins: {}, fog: {}, texts: {}, drawings: {}, walls: {}, lights: {} },
    ...state,
  },
});

const statblock = (image?: string): string => `---\nstatblock: true\n${image ? `image: "[[${image}]]"\n` : ''}---\nA creature.`;

const token = (b: Bench, name: string, imagePath: string, extra: Record<string, string> = {}): Promise<Asset> =>
  b.assets.addTokenAsset({ name, imagePath, collection: 'source', tags: [], ...extra });

const map = (b: Bench, name: string, mapFilePath: string, thumbnailPath?: string): Promise<Asset> =>
  b.assets.addAsset({ type: 'map', name, collection: 'source', tags: [], mapFilePath, ...(thumbnailPath && { thumbnailPath }) });

const scene = (b: Bench, name: string, mapPath: string): Promise<Asset> =>
  b.assets.addAsset({ type: 'scene', name, collection: 'source', tags: [], data: { mapPath } });

const encounter = (b: Bench, name: string, refs: readonly Asset[], thumbnail?: string): Promise<Asset> =>
  b.assets.addAsset({
    type: 'encounter', name, collection: 'source', tags: [],
    tokens: refs.flatMap((ref) => (ref.type === 'token' ? [{ id: ref.id, name: ref.name, imagePath: ref.imagePath, ...(ref.statblockPath && { statblockPath: ref.statblockPath }) }] : [])),
    ...(thumbnail && { thumbnailUrl: `app://vault/${thumbnail}?1792500000000` }),
  });

async function snapshot({ vault }: Bench, sceneAsset: Asset, mapPath: string): Promise<void> {
  const folder = sceneSnapshotFolder('source', sceneAsset.id);
  const saved = createSnapshot(JSON.parse(vault.files.get(mapPath)!) as never, 'snap1', 'Start', 1000);
  await vault.app.vault.create(`${folder}/snap1.json`, JSON.stringify(saved));
  await vault.app.vault.create(`${folder}/snap1.jpg`, 'SNAPJPG');
}

async function goblin(b: Bench, name = 'Goblin', statblockPath = 'Bestiary/Goblin.md'): Promise<Asset> {
  const image = `${A}/${name.toLowerCase().replace(/ /g, '-')}.webp`;
  const thumb = `${A}/thumbnails/${name.toLowerCase().replace(/ /g, '-')}-1.webp`;
  await put(b, { [image]: 'IMG', [thumb]: 'THUMB' });
  if (!b.vault.files.has(statblockPath)) await put(b, { [statblockPath]: statblock('goblin.png'), 'Bestiary/goblin.png': 'PNG' });
  return token(b, name, image, { thumbnailPath: thumb, statblockPath });
}

async function cave(b: Bench, background = `${S}/files/cave.webp`): Promise<Asset> {
  await put(b, {
    [background]: 'BG', [`${A}/ogre.webp`]: 'OGRE', [`${S}/notes/Entrance.md`]: '# Door', [`${S}/scenes/Cave.thumb.jpg`]: 'JPG',
    [CAVE]: atlasmap({
      background,
      objects: {
        tokens: { t1: { id: 't1', kind: 'character', x: 0, y: 0, imagePath: `${A}/ogre.webp`, name: 'Ogre' } },
        pins: { p1: { id: 'p1', kind: 'pin', x: 0, y: 0, notePath: `${S}/notes/Entrance.md#Door` } },
        fog: {}, texts: {}, drawings: {}, walls: {}, lights: {},
      },
    }),
  });
  const caveScene = await scene(b, 'Cave', CAVE);
  await snapshot(b, caveScene, CAVE);
  return caveScene;
}

interface Change { gone: string[]; arrived: string[] }

interface Row {
  name: string;
  build: (b: Bench) => Promise<unknown>;
  /** The asset deleted, moved and copied. */
  subject: string;
  delete: Change;
  move: Change;
  copy: Change;
  /** `role path` of every file an export of the source collection packs. */
  export: string[];
}

const NONE: Change = { gone: [], arrived: [] };

const ROWS: Row[] = [
  {
    name: 'a token', subject: 'Goblin',
    build: (b) => goblin(b),
    delete: {
      gone: [`${A}/goblin.webp`, `${A}/thumbnails/goblin-1.webp`, `${S}/tokens/{Goblin}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/tokens/{Goblin}.json`],
      arrived: [`${T}/tokens/{Goblin}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${A}/goblin-2.webp`, `${A}/thumbnails/goblin-1-2.webp`, `${T}/tokens/{Goblin copy}.json`],
    },
    export: [
      'statblock-image Bestiary/goblin.png',
      'statblock-note Bestiary/Goblin.md',
      `thumbnail ${A}/thumbnails/goblin-1.webp`,
      `token-image ${A}/goblin.webp`,
    ],
  },
  {
    name: 'a token whose art lies in the collection folder', subject: 'Zombie',
    build: async (b) => {
      await put(b, { [`${S}/tokens/Undead/zombie.webp`]: 'ZOMBIE', [`${A}/thumbnails/zombie-1.webp`]: 'THUMB' });
      return token(b, 'Zombie', `${S}/tokens/Undead/zombie.webp`, { thumbnailPath: `${A}/thumbnails/zombie-1.webp` });
    },
    delete: {
      gone: [`${A}/thumbnails/zombie-1.webp`, `${S}/tokens/Undead/zombie.webp`, `${S}/tokens/{Zombie}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/tokens/Undead/zombie.webp`, `${S}/tokens/{Zombie}.json`],
      arrived: [`${T}/tokens/Undead/zombie.webp`, `${T}/tokens/{Zombie}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${A}/thumbnails/zombie-1-2.webp`, `${T}/tokens/Undead/zombie.webp`, `${T}/tokens/{Zombie copy}.json`],
    },
    export: [
      `thumbnail ${A}/thumbnails/zombie-1.webp`,
      `token-image ${S}/tokens/Undead/zombie.webp`,
    ],
  },
  {
    name: 'a map', subject: 'Region',
    build: async (b) => {
      await put(b, { [`${A}/region.webp`]: 'IMG', [`${A}/thumbnails/region-1.webp`]: 'THUMB' });
      return map(b, 'Region', `${A}/region.webp`, `${A}/thumbnails/region-1.webp`);
    },
    delete: {
      gone: [`${A}/region.webp`, `${A}/thumbnails/region-1.webp`, `${S}/maps/{Region}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/maps/{Region}.json`],
      arrived: [`${T}/maps/{Region}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${T}/maps/{Region copy}.json`],
    },
    export: [
      `asset-file ${S}/maps/{Region}.json`,
      `background ${A}/region.webp`,
      `thumbnail ${A}/thumbnails/region-1.webp`,
    ],
  },
  // A delete leaves the scene's thumbnail to the vault check, which trashes it once it sees the map go (`vaultSync`).
  {
    name: 'a scene with snapshots', subject: 'Cave',
    build: async (b) => {
      await cave(b);
      await put(b, { [MEMORY]: 'PNG' });
    },
    delete: {
      gone: [MEMORY, CAVE, `${S}/scenes/{Cave}.json`, `${S}/snapshots/{Cave}/snap1.jpg`, `${S}/snapshots/{Cave}/snap1.json`],
      arrived: [],
    },
    move: {
      gone: [
        `${S}/files/cave.webp`,
        `${S}/notes/Entrance.md`,
        CAVE,
        `${S}/scenes/Cave.thumb.jpg`,
        `${S}/scenes/{Cave}.json`,
        `${S}/snapshots/{Cave}/snap1.jpg`,
        `${S}/snapshots/{Cave}/snap1.json`,
      ],
      arrived: [
        `${T}/files/cave.webp`,
        `${T}/notes/Entrance.md`,
        `${T}/scenes/Cave.atlasmap`,
        `${T}/scenes/Cave.thumb.jpg`,
        `${T}/scenes/{Cave}.json`,
        `${T}/snapshots/{Cave}/snap1.jpg`,
        `${T}/snapshots/{Cave}/snap1.json`,
      ],
    },
    copy: {
      gone: [],
      arrived: [
        `${T}/files/cave.webp`,
        `${T}/notes/Entrance.md`,
        `${T}/scenes/Cave.atlasmap`,
        `${T}/scenes/Cave.thumb.jpg`,
        `${T}/scenes/{Cave copy}.json`,
        `${T}/snapshots/{Cave copy}/snap1.jpg`,
        `${T}/snapshots/{Cave copy}/snap1.json`,
      ],
    },
    export: [
      `asset-file ${S}/scenes/{Cave}.json`,
      `background ${S}/files/cave.webp`,
      `linked-note ${S}/notes/Entrance.md`,
      `scene-map ${CAVE}`,
      `scene-snapshot ${S}/snapshots/{Cave}/snap1.json`,
      `scene-snapshot-thumbnail ${S}/snapshots/{Cave}/snap1.jpg`,
      `scene-thumbnail ${S}/scenes/Cave.thumb.jpg`,
      `token-image ${A}/ogre.webp`,
    ],
  },
  // A delete trashes the thumbnail, an export does not carry it (#882).
  {
    name: 'an encounter', subject: 'Ambush',
    build: async (b) => {
      const goblinToken = await goblin(b);
      await put(b, { [AMBUSH_THUMB]: 'PNG' });
      return encounter(b, 'Ambush', [goblinToken], AMBUSH_THUMB);
    },
    delete: {
      gone: [AMBUSH_THUMB, `${S}/encounters/{Ambush}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/encounters/{Ambush}.json`],
      arrived: [`${T}/encounters/{Ambush}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${T}/encounters/{Ambush copy}.json`],
    },
    export: [
      `asset-file ${S}/encounters/{Ambush}.json`,
      'statblock-image Bestiary/goblin.png',
      'statblock-note Bestiary/Goblin.md',
      `thumbnail ${A}/thumbnails/goblin-1.webp`,
      `token-image ${A}/goblin.webp`,
    ],
  },
  {
    name: 'a statblock record', subject: 'Ogre stats',
    build: (b) => b.assets.addAsset({ type: 'statblock', name: 'Ogre stats', collection: 'source', tags: [], data: { hp: 59 } }),
    delete: {
      gone: [`${S}/statblocks/{Ogre stats}.json`],
      arrived: [],
    },
    move: NONE,
    copy: NONE,
    export: [],
  },
  {
    name: 'a character record', subject: 'Hero',
    build: (b) => b.assets.addAsset({ type: 'character', name: 'Hero', collection: 'source', tags: [], data: { level: 3 } }),
    delete: {
      gone: [`${S}/characters/{Hero}.json`],
      arrived: [],
    },
    move: NONE,
    copy: NONE,
    export: [],
  },
  {
    name: 'a map whose image two scenes show', subject: 'Region',
    build: async (b) => {
      await put(b, { [`${A}/thumbnails/region-1.webp`]: 'THUMB', [LAIR]: atlasmap({ background: `${A}/region.webp` }) });
      await cave(b, `${A}/region.webp`);
      await scene(b, 'Lair', LAIR);
      return map(b, 'Region', `${A}/region.webp`, `${A}/thumbnails/region-1.webp`);
    },
    delete: {
      gone: [`${A}/thumbnails/region-1.webp`, `${S}/maps/{Region}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/maps/{Region}.json`],
      arrived: [`${T}/maps/{Region}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${T}/maps/{Region copy}.json`],
    },
    export: [
      `asset-file ${S}/maps/{Region}.json`,
      `asset-file ${S}/scenes/{Cave}.json`,
      `asset-file ${S}/scenes/{Lair}.json`,
      `background ${A}/region.webp`,
      `linked-note ${S}/notes/Entrance.md`,
      `scene-map ${CAVE}`,
      `scene-map ${LAIR}`,
      `scene-snapshot ${S}/snapshots/{Cave}/snap1.json`,
      `scene-snapshot-thumbnail ${S}/snapshots/{Cave}/snap1.jpg`,
      `scene-thumbnail ${S}/scenes/Cave.thumb.jpg`,
      `thumbnail ${A}/thumbnails/region-1.webp`,
      `token-image ${A}/ogre.webp`,
    ],
  },
  {
    name: 'a scene whose background another scene shows', subject: 'Cave',
    build: async (b) => {
      await cave(b);
      await put(b, { [LAIR]: atlasmap({ background: `${S}/files/cave.webp` }) });
      return scene(b, 'Lair', LAIR);
    },
    delete: {
      gone: [CAVE, `${S}/scenes/{Cave}.json`, `${S}/snapshots/{Cave}/snap1.jpg`, `${S}/snapshots/{Cave}/snap1.json`],
      arrived: [],
    },
    move: {
      gone: [
        `${S}/notes/Entrance.md`,
        CAVE,
        `${S}/scenes/Cave.thumb.jpg`,
        `${S}/scenes/{Cave}.json`,
        `${S}/snapshots/{Cave}/snap1.jpg`,
        `${S}/snapshots/{Cave}/snap1.json`,
      ],
      arrived: [
        `${T}/files/cave.webp`,
        `${T}/notes/Entrance.md`,
        `${T}/scenes/Cave.atlasmap`,
        `${T}/scenes/Cave.thumb.jpg`,
        `${T}/scenes/{Cave}.json`,
        `${T}/snapshots/{Cave}/snap1.jpg`,
        `${T}/snapshots/{Cave}/snap1.json`,
      ],
    },
    copy: {
      gone: [],
      arrived: [
        `${T}/files/cave.webp`,
        `${T}/notes/Entrance.md`,
        `${T}/scenes/Cave.atlasmap`,
        `${T}/scenes/Cave.thumb.jpg`,
        `${T}/scenes/{Cave copy}.json`,
        `${T}/snapshots/{Cave copy}/snap1.jpg`,
        `${T}/snapshots/{Cave copy}/snap1.json`,
      ],
    },
    export: [
      `asset-file ${S}/scenes/{Cave}.json`,
      `asset-file ${S}/scenes/{Lair}.json`,
      `background ${S}/files/cave.webp`,
      `linked-note ${S}/notes/Entrance.md`,
      `scene-map ${CAVE}`,
      `scene-map ${LAIR}`,
      `scene-snapshot ${S}/snapshots/{Cave}/snap1.json`,
      `scene-snapshot-thumbnail ${S}/snapshots/{Cave}/snap1.jpg`,
      `scene-thumbnail ${S}/scenes/Cave.thumb.jpg`,
      `token-image ${A}/ogre.webp`,
    ],
  },
  // A delete trashes art the other token still shows; a move copies it (#880).
  {
    name: 'token art two tokens show', subject: 'Orc',
    build: async (b) => {
      await put(b, { [`${S}/tokens/orc.webp`]: 'ORC' });
      await token(b, 'Orc', `${S}/tokens/orc.webp`);
      return token(b, 'Orc chief', `${S}/tokens/orc.webp`);
    },
    delete: {
      gone: [`${S}/tokens/orc.webp`, `${S}/tokens/{Orc}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/tokens/{Orc}.json`],
      arrived: [`${T}/tokens/orc.webp`, `${T}/tokens/{Orc}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${T}/tokens/orc.webp`, `${T}/tokens/{Orc copy}.json`],
    },
    export: [
      `token-image ${S}/tokens/orc.webp`,
    ],
  },
  {
    name: 'a token with its thumbnail in both formats', subject: 'Goblin',
    build: async (b) => {
      await goblin(b);
      await put(b, { [`${A}/thumbnails/goblin-1.png`]: 'THUMB PNG' });
    },
    delete: {
      gone: [`${A}/goblin.webp`, `${A}/thumbnails/goblin-1.png`, `${A}/thumbnails/goblin-1.webp`, `${S}/tokens/{Goblin}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/tokens/{Goblin}.json`],
      arrived: [`${T}/tokens/{Goblin}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${A}/goblin-2.webp`, `${A}/thumbnails/goblin-1-2.png`, `${A}/thumbnails/goblin-1-2.webp`, `${T}/tokens/{Goblin copy}.json`],
    },
    export: [
      'statblock-image Bestiary/goblin.png',
      'statblock-note Bestiary/Goblin.md',
      `thumbnail ${A}/thumbnails/goblin-1.png`,
      `thumbnail ${A}/thumbnails/goblin-1.webp`,
      `token-image ${A}/goblin.webp`,
    ],
  },
  {
    name: 'a map with its thumbnail in both formats', subject: 'Region',
    build: async (b) => {
      await put(b, { [`${A}/region.webp`]: 'IMG', [`${A}/thumbnails/region-1.webp`]: 'THUMB', [`${A}/thumbnails/region-1.png`]: 'THUMB PNG' });
      return map(b, 'Region', `${A}/region.webp`, `${A}/thumbnails/region-1.webp`);
    },
    delete: {
      gone: [`${A}/region.webp`, `${A}/thumbnails/region-1.png`, `${A}/thumbnails/region-1.webp`, `${S}/maps/{Region}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/maps/{Region}.json`],
      arrived: [`${T}/maps/{Region}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${T}/maps/{Region copy}.json`],
    },
    export: [
      `asset-file ${S}/maps/{Region}.json`,
      `background ${A}/region.webp`,
      `thumbnail ${A}/thumbnails/region-1.png`,
      `thumbnail ${A}/thumbnails/region-1.webp`,
    ],
  },
  {
    name: 'a map whose image and thumbnails a copy shares', subject: 'Region',
    build: async (b) => {
      await put(b, { [`${A}/region.webp`]: 'IMG', [`${A}/thumbnails/region-1.webp`]: 'THUMB', [`${A}/thumbnails/region-1.png`]: 'THUMB PNG' });
      await map(b, 'Region', `${A}/region.webp`, `${A}/thumbnails/region-1.webp`);
      return map(b, 'Region again', `${A}/region.webp`, `${A}/thumbnails/region-1.webp`);
    },
    delete: {
      gone: [`${S}/maps/{Region}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/maps/{Region}.json`],
      arrived: [`${T}/maps/{Region}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${T}/maps/{Region copy}.json`],
    },
    export: [
      `asset-file ${S}/maps/{Region again}.json`,
      `asset-file ${S}/maps/{Region}.json`,
      `background ${A}/region.webp`,
      `thumbnail ${A}/thumbnails/region-1.png`,
      `thumbnail ${A}/thumbnails/region-1.webp`,
    ],
  },
  {
    name: 'a map whose image a scene shows on an upper floor', subject: 'Region',
    build: async (b) => {
      await put(b, {
        [`${A}/region.webp`]: 'IMG', [`${A}/ground.webp`]: 'GROUND',
        [LAIR]: atlasmap({ levels: [{ id: 'l1', name: 'Ground', background: `${A}/ground.webp` }, { id: 'l2', name: 'Upper', background: `${A}/region.webp` }] }),
      });
      await scene(b, 'Lair', LAIR);
      return map(b, 'Region', `${A}/region.webp`);
    },
    delete: {
      gone: [`${S}/maps/{Region}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/maps/{Region}.json`],
      arrived: [`${T}/maps/{Region}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${T}/maps/{Region copy}.json`],
    },
    export: [
      `asset-file ${S}/maps/{Region}.json`,
      `asset-file ${S}/scenes/{Lair}.json`,
      `background ${A}/ground.webp`,
      `background ${A}/region.webp`,
      `scene-map ${LAIR}`,
    ],
  },
  {
    name: 'a map whose image a scene shows as a roof', subject: 'Region',
    build: async (b) => {
      await put(b, { [`${A}/region.webp`]: 'IMG', [LAIR]: atlasmap({ levels: [{ id: 'l1', name: 'Ground', background: null, foreground: `${A}/region.webp` }] }) });
      await scene(b, 'Lair', LAIR);
      return map(b, 'Region', `${A}/region.webp`);
    },
    delete: {
      gone: [`${S}/maps/{Region}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/maps/{Region}.json`],
      arrived: [`${T}/maps/{Region}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${T}/maps/{Region copy}.json`],
    },
    export: [
      `asset-file ${S}/maps/{Region}.json`,
      `asset-file ${S}/scenes/{Lair}.json`,
      `background ${A}/region.webp`,
      `scene-map ${LAIR}`,
    ],
  },
  {
    name: 'a token whose thumbnail arrived only in the other format', subject: 'Goblin',
    build: async (b) => {
      await goblin(b);
      await put(b, { [`${A}/thumbnails/goblin-1.png`]: 'THUMB PNG' });
      b.vault.files.delete(`${A}/thumbnails/goblin-1.webp`);
    },
    delete: {
      gone: [`${A}/goblin.webp`, `${A}/thumbnails/goblin-1.png`, `${S}/tokens/{Goblin}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/tokens/{Goblin}.json`],
      arrived: [`${T}/tokens/{Goblin}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${A}/goblin-2.webp`, `${A}/thumbnails/goblin-1-2.png`, `${T}/tokens/{Goblin copy}.json`],
    },
    export: [
      'statblock-image Bestiary/goblin.png',
      'statblock-note Bestiary/Goblin.md',
      `thumbnail ${A}/thumbnails/goblin-1.png`,
      `token-image ${A}/goblin.webp`,
    ],
  },
  {
    name: 'a scene whose snapshot a note links', subject: 'Cave',
    build: async (b) => {
      await cave(b);
      await put(b, { 'Notes/Plan.md': '[[Cave.atlasmap#Start]]' });
    },
    delete: {
      gone: [CAVE, `${S}/scenes/{Cave}.json`, `${S}/snapshots/{Cave}/snap1.jpg`, `${S}/snapshots/{Cave}/snap1.json`],
      arrived: [],
    },
    move: {
      gone: [
        `${S}/files/cave.webp`,
        `${S}/notes/Entrance.md`,
        CAVE,
        `${S}/scenes/Cave.thumb.jpg`,
        `${S}/scenes/{Cave}.json`,
        `${S}/snapshots/{Cave}/snap1.jpg`,
        `${S}/snapshots/{Cave}/snap1.json`,
      ],
      arrived: [
        `${T}/files/cave.webp`,
        `${T}/notes/Entrance.md`,
        `${T}/scenes/Cave.atlasmap`,
        `${T}/scenes/Cave.thumb.jpg`,
        `${T}/scenes/{Cave}.json`,
        `${T}/snapshots/{Cave}/snap1.jpg`,
        `${T}/snapshots/{Cave}/snap1.json`,
      ],
    },
    copy: {
      gone: [],
      arrived: [
        `${T}/files/cave.webp`,
        `${T}/notes/Entrance.md`,
        `${T}/scenes/Cave.atlasmap`,
        `${T}/scenes/Cave.thumb.jpg`,
        `${T}/scenes/{Cave copy}.json`,
        `${T}/snapshots/{Cave copy}/snap1.jpg`,
        `${T}/snapshots/{Cave copy}/snap1.json`,
      ],
    },
    export: [
      `asset-file ${S}/scenes/{Cave}.json`,
      `background ${S}/files/cave.webp`,
      `linked-note ${S}/notes/Entrance.md`,
      `scene-map ${CAVE}`,
      `scene-snapshot ${S}/snapshots/{Cave}/snap1.json`,
      `scene-snapshot-thumbnail ${S}/snapshots/{Cave}/snap1.jpg`,
      `scene-thumbnail ${S}/scenes/Cave.thumb.jpg`,
      `token-image ${A}/ogre.webp`,
    ],
  },
  {
    name: 'a token whose statblock another token uses', subject: 'Goblin',
    build: async (b) => {
      await goblin(b, 'Goblin', `${S}/statblocks/Goblin.md`);
      return goblin(b, 'Goblin boss', `${S}/statblocks/Goblin.md`);
    },
    delete: {
      gone: [`${A}/goblin.webp`, `${A}/thumbnails/goblin-1.webp`, `${S}/tokens/{Goblin}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/tokens/{Goblin}.json`],
      arrived: [`${T}/statblocks/Goblin.md`, `${T}/tokens/{Goblin}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${A}/goblin-2.webp`, `${A}/thumbnails/goblin-1-2.webp`, `${T}/statblocks/Goblin.md`, `${T}/tokens/{Goblin copy}.json`],
    },
    export: [
      'statblock-image Bestiary/goblin.png',
      `statblock-note ${S}/statblocks/Goblin.md`,
      `thumbnail ${A}/thumbnails/goblin-1.webp`,
      `thumbnail ${A}/thumbnails/goblin-boss-1.webp`,
      `token-image ${A}/goblin-boss.webp`,
      `token-image ${A}/goblin.webp`,
    ],
  },
  {
    name: 'an encounter whose thumbnail a copy shows', subject: 'Ambush',
    build: async (b) => {
      const goblinToken = await goblin(b);
      await put(b, { [AMBUSH_THUMB]: 'PNG' });
      await encounter(b, 'Ambush', [goblinToken], AMBUSH_THUMB);
      return encounter(b, 'Ambush again', [goblinToken], AMBUSH_THUMB);
    },
    delete: {
      gone: [`${S}/encounters/{Ambush}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/encounters/{Ambush}.json`],
      arrived: [`${T}/encounters/{Ambush}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${T}/encounters/{Ambush copy}.json`],
    },
    export: [
      `asset-file ${S}/encounters/{Ambush again}.json`,
      `asset-file ${S}/encounters/{Ambush}.json`,
      'statblock-image Bestiary/goblin.png',
      'statblock-note Bestiary/Goblin.md',
      `thumbnail ${A}/thumbnails/goblin-1.webp`,
      `token-image ${A}/goblin.webp`,
    ],
  },
  // A delete reads the record after trashing it and leaves the map; the others find it (#881).
  {
    name: 'a scene whose record alone names its map', subject: 'Cave',
    build: async (b) => {
      await put(b, { [CAVE]: atlasmap(), [`${S}/scenes/Cave.thumb.jpg`]: 'JPG' });
      const legacy = await b.assets.addAsset({ type: 'scene', name: 'Cave', collection: 'source', tags: [] });
      const record = legacy.filePath!;
      b.vault.files.set(record, JSON.stringify({ ...JSON.parse(b.vault.files.get(record)!) as object, mapPath: CAVE }));
    },
    delete: {
      gone: [`${S}/scenes/{Cave}.json`],
      arrived: [],
    },
    move: {
      gone: [CAVE, `${S}/scenes/Cave.thumb.jpg`, `${S}/scenes/{Cave}.json`],
      arrived: [`${T}/scenes/Cave.atlasmap`, `${T}/scenes/Cave.thumb.jpg`, `${T}/scenes/{Cave}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${T}/scenes/Cave.atlasmap`, `${T}/scenes/Cave.thumb.jpg`, `${T}/scenes/{Cave copy}.json`],
    },
    export: [
      `asset-file ${S}/scenes/{Cave}.json`,
      `scene-map ${CAVE}`,
      `scene-thumbnail ${S}/scenes/Cave.thumb.jpg`,
    ],
  },
  {
    name: 'a map whose image a note links', subject: 'Region',
    build: async (b) => {
      await put(b, { [`${A}/region.webp`]: 'IMG', [`${A}/thumbnails/region-1.webp`]: 'THUMB', 'Notes/Region.md': '![[region.webp]]' });
      return map(b, 'Region', `${A}/region.webp`, `${A}/thumbnails/region-1.webp`);
    },
    delete: {
      gone: [`${A}/thumbnails/region-1.webp`, `${S}/maps/{Region}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/maps/{Region}.json`],
      arrived: [`${T}/maps/{Region}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${T}/maps/{Region copy}.json`],
    },
    export: [
      `asset-file ${S}/maps/{Region}.json`,
      `background ${A}/region.webp`,
      `thumbnail ${A}/thumbnails/region-1.webp`,
    ],
  },
  {
    name: 'a map while a scene\'s map cannot be read', subject: 'Region',
    build: async (b) => {
      await put(b, { [`${A}/region.webp`]: 'IMG', [`${A}/thumbnails/region-1.webp`]: 'THUMB', [LAIR]: '{ half written' });
      await scene(b, 'Lair', LAIR);
      return map(b, 'Region', `${A}/region.webp`, `${A}/thumbnails/region-1.webp`);
    },
    delete: {
      gone: [`${S}/maps/{Region}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/maps/{Region}.json`],
      arrived: [`${T}/maps/{Region}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${T}/maps/{Region copy}.json`],
    },
    export: [
      `asset-file ${S}/maps/{Region}.json`,
      `asset-file ${S}/scenes/{Lair}.json`,
      `background ${A}/region.webp`,
      `scene-map ${LAIR}`,
      `thumbnail ${A}/thumbnails/region-1.webp`,
    ],
  },
  {
    name: 'a map whose image lies outside Atlas\'s folder', subject: 'Mine',
    build: async (b) => {
      await put(b, { 'Art/my-map.png': 'PNG' });
      return map(b, 'Mine', 'Art/my-map.png');
    },
    delete: {
      gone: [`${S}/maps/{Mine}.json`],
      arrived: [],
    },
    move: {
      gone: [`${S}/maps/{Mine}.json`],
      arrived: [`${T}/maps/{Mine}.json`],
    },
    copy: {
      gone: [],
      arrived: [`${T}/maps/{Mine copy}.json`],
    },
    export: [
      `asset-file ${S}/maps/{Mine}.json`,
      'background Art/my-map.png',
    ],
  },
];

/** `path` with every known asset id written as `{Name}`. */
function labelled(path: string, names: ReadonlyMap<string, string>): string {
  let label = path;
  for (const [id, name] of names) label = label.replaceAll(id, `{${name}}`);
  return label;
}

const namesOf = (assets: readonly Asset[]): Map<string, string> => new Map(assets.map((asset) => [asset.id, asset.name]));

/** Builds the row's vault, runs `act` on its subject, and returns which files went and came. */
async function change(row: Row, act: (b: Bench, subject: Asset) => Promise<Asset[]>): Promise<Change> {
  const b = await bench();
  await row.build(b);
  const all = await b.assets.getAssets();
  const subject = all.find((asset) => asset.name === row.subject)!;
  const before = new Set(b.vault.files.keys());
  const made = await act(b, subject);
  const after = new Set(b.vault.files.keys());
  const names = namesOf(all);
  for (const asset of made) if (!names.has(asset.id)) names.set(asset.id, `${asset.name} copy`);
  const label = (paths: Iterable<string>): string[] => [...paths].map((path) => labelled(path, names)).sort();
  return {
    gone: label([...before].filter((path) => !after.has(path))),
    arrived: label([...after].filter((path) => !before.has(path))),
  };
}

const transfer = (mode: 'move' | 'copy') => async (b: Bench, subject: Asset): Promise<Asset[]> =>
  (await transferAssets(b.vault.app, b.assets, { assetIds: [subject.id], targetCollectionId: 'target', mode })).assets;

async function exported(row: Row): Promise<string[]> {
  const b = await bench();
  await row.build(b);
  const names = namesOf(await b.assets.getAssets());
  const preview = await prepareCollectionExport(b.vault.app, b.assets, 'source');
  const bundle = await exportCollectionBundle(b.vault.app, b.assets, preview, { kind: 'release', version: preview.suggestedVersion });
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await bundle.blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as { files: Array<{ vaultPath: string; role: string }> };
  return manifest.files.map((file) => `${file.role} ${labelled(file.vaultPath, names)}`).sort();
}

beforeEach(() => { AssetService.resetInstance(); });

describe.each(ROWS)('the files of $name', (row) => {
  it('a delete trashes', async () => {
    expect(await change(row, async (b, subject) => { await b.assets.deleteAsset(subject.id); return []; })).toEqual(row.delete);
  });

  it('a move takes along', async () => {
    expect(await change(row, transfer('move'))).toEqual(row.move);
  });

  it('a copy duplicates', async () => {
    expect(await change(row, transfer('copy'))).toEqual(row.copy);
  });

  it('an export packs', async () => {
    expect(await exported(row)).toEqual(row.export);
  });
});
