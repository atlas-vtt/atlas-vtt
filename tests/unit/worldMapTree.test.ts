import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { CampaignPlay } from '../../src/app/campaigns/campaignPlay';
import { campaignWorldMapGate } from '../../src/app/plugin/campaignWorldMapGate';
import { AssetService, type Asset } from '../../src/app/services/AssetService';
import { worldMapTree } from '../../src/app/services/worldMapTree';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';
import { memoryCampaigns } from '../mocks/memoryCampaigns';

const SCENES = 'atlas-vtt/collections/dungeon/scenes';
const ART = 'atlas-vtt/collections/dungeon/art';
const path = (name: string): string => `${SCENES}/${name}.atlasmap`;

interface Pin {
  readonly x: number;
  readonly y: number;
  readonly notePath: string;
  readonly gmOnly?: boolean;
  readonly sceneLevel?: string;
  readonly icon?: string;
  readonly label?: string;
}

const sceneFile = (background: string | null, pins: readonly Pin[] = [], grid: object | null = null): string => JSON.stringify({
  version: 4,
  state: { schema: 'atlas-vtt', version: 4, background, grid, objects: { tokens: {}, fog: {}, pins: Object.fromEntries(pins.map((pin, index) => [`pin-${index}`, { id: `pin-${index}`, kind: 'pin', ...pin }])) } },
});

const scene = (id: string, name: string): Asset => ({ id, type: 'scene', name, collection: 'dungeon', tags: [], data: { mapPath: path(name) } }) as unknown as Asset;
const ASSETS = [
  scene('world', 'World'), scene('town', 'Town'), scene('house', 'House'), scene('secret', 'Secret'), scene('bare', 'Bare'),
  { id: 'region', type: 'map', name: 'Region', collection: 'dungeon', tags: [], mapFilePath: 'atlas-vtt/assets/region.webp' } as unknown as Asset,
];

function vault(): App {
  return vaultWithEvents().app;
}

function vaultWithEvents(): InMemoryApp {
  const memory = createInMemoryApp({ files: {
    [`${ART}/world.webp`]: 'IMG', [`${ART}/town.webp`]: 'IMG', [`${ART}/house.webp`]: 'IMG', [`${ART}/secret.webp`]: 'IMG', 'atlas-vtt/assets/region.webp': 'IMG',
    [path('World')]: sceneFile(`${ART}/world.webp`, [
      { x: 100, y: 50, notePath: path('Town'), icon: 'castle' },
      { x: 10, y: 10, notePath: path('Secret'), gmOnly: true },
      { x: 20, y: 20, notePath: 'Notes/Lore.md' },
      // A link made into another collection before such links were refused opens the scene at the same place in this one.
      { x: 30, y: 30, notePath: 'atlas-vtt/collections/other/scenes/Town.atlasmap#Night', icon: 'number', label: '3' },
      { x: 40, y: 40, notePath: path('Gone') },
      { x: 50, y: 50, notePath: path('World') },
    ], { type: 'square', size: 70, offsetX: 0, offsetY: 0, mapStretch: { x: 1.2, y: 1 } }),
    [path('Town')]: sceneFile(`${ART}/town.webp`, [{ x: 5, y: 6, notePath: path('House') }, { x: 7, y: 8, notePath: path('World') }]),
    [path('House')]: sceneFile(`${ART}/house.webp`, [{ x: 1, y: 2, notePath: path('Bare') }]),
    [path('Secret')]: sceneFile(`${ART}/secret.webp`),
    [path('Bare')]: sceneFile(null),
  } });
  const index: Record<string, Asset> = Object.fromEntries(ASSETS.map((asset) => [asset.id, asset]));
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getAssetById: async (id: string) => index[id] || null,
    getAssets: async (_collection: string | undefined, type: string) => ASSETS.filter((asset) => asset.type === type),
  } as unknown as AssetService);
  return memory;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('the maps a world map leads into', () => {
  it('follow the scene links of the pins players may see, each scene once, nearest first, as far as they go', async () => {
    const read = await worldMapTree(vault(), 'world', 32);
    expect(read?.tree.root).toBe('world');
    expect(read?.tree.levels.map((level) => [level.key, level.title, level.image])).toEqual([
      ['world', 'World', `${ART}/world.webp`],
      ['town', 'Town', `${ART}/town.webp`],
      ['house', 'House', `${ART}/house.webp`],
    ]);
    const [world, town, house] = read?.tree.levels ?? [];
    // The GM's hidden pin, a note, a scene that is gone and the map itself lead nowhere.
    expect(world?.entrances).toEqual([{ x: 100, y: 50, to: 'town', icon: 'castle' }, { x: 30, y: 30, to: 'town', icon: 'number', label: '3' }]);
    expect(world?.stretch).toEqual({ x: 1.2, y: 1 });
    // A pin back to the world map is an entrance as well: the page leads back along the path.
    expect(town?.entrances).toEqual([{ x: 5, y: 6, to: 'house', icon: 'pin' }, { x: 7, y: 8, to: 'world', icon: 'pin' }]);
    // A scene without a background has no image to show: it is left out, the pin into it stays for the page to drop.
    expect(house?.entrances).toEqual([{ x: 1, y: 2, to: 'bare', icon: 'pin' }]);
    expect(read?.scenePaths).toEqual([path('World'), path('Town'), path('House'), path('Bare')]);
  });

  it('lead on only from the pins of a scene\'s first floor, whose map they stand on', async () => {
    const memory = vaultWithEvents();
    const town = JSON.parse(memory.files.get(path('Town'))!) as { version: number; state: { levels?: unknown; objects: { pins: Record<string, Record<string, unknown>> } } };
    town.version = 5;
    town.state.levels = [
      { id: 'street', name: 'Street', elevation: { bottom: 0, top: 10 }, background: `${ART}/town.webp` },
      { id: 'roofs', name: 'Roofs', elevation: { bottom: 10, top: 20 }, background: `${ART}/house.webp` },
    ];
    town.state.objects.pins['pin-0']!.level = 'roofs';
    memory.files.set(path('Town'), JSON.stringify(town));

    const read = await worldMapTree(memory.app, 'world', 32);
    expect(read?.tree.levels.find((level) => level.key === 'town')?.entrances).toEqual([{ x: 7, y: 8, to: 'world', icon: 'pin' }]);
    expect(read?.tree.levels.map((level) => level.key)).toEqual(['world', 'town']);
  });

  it('lead into the floor a pin opens its scene on, a map of its own whose pins lead on', async () => {
    const memory = vaultWithEvents();
    const world = JSON.parse(memory.files.get(path('World'))!) as { state: { objects: { pins: Record<string, Record<string, unknown>> } } };
    world.state.objects.pins['pin-0']!.sceneLevel = 'roofs';
    // A floor without a map of its own is no map players may be shown: that pin opens the first floor.
    world.state.objects.pins['pin-3']!.sceneLevel = 'attic';
    memory.files.set(path('World'), JSON.stringify(world));
    const town = JSON.parse(memory.files.get(path('Town'))!) as { version: number; state: { levels?: unknown; objects: { pins: Record<string, Record<string, unknown>> } } };
    town.version = 5;
    town.state.levels = [
      { id: 'street', name: 'Street', elevation: { bottom: 0, top: 10 }, background: `${ART}/town.webp` },
      // A floor's map may lie anywhere in the vault, as the scene's own does.
      { id: 'roofs', name: 'Roofs', elevation: { bottom: 10, top: 20 }, background: 'Elsewhere/roofs.webp', alignment: { offset: { x: 70, y: 0 }, scale: 2 } },
      { id: 'attic', name: 'Attic', elevation: { bottom: 20, top: 30 } },
    ];
    town.state.objects.pins['pin-0']!.level = 'roofs';
    memory.files.set(path('Town'), JSON.stringify(town));

    const read = await worldMapTree(memory.app, 'world', 32);
    const levels = read?.tree.levels ?? [];
    expect(levels.map((level) => [level.key, level.title, level.image])).toEqual([
      ['world', 'World', `${ART}/world.webp`],
      ['town#roofs', 'Town: Roofs', 'Elsewhere/roofs.webp'],
      ['town', 'Town', `${ART}/town.webp`],
      ['house', 'House', `${ART}/house.webp`],
    ]);
    expect(levels[0]?.entrances).toEqual([{ x: 100, y: 50, to: 'town#roofs', icon: 'castle' }, { x: 30, y: 30, to: 'town', icon: 'number', label: '3' }]);
    // The floor's own pins lead on, placed on its map as the floor's alignment draws it.
    expect(levels[1]?.entrances).toEqual([{ x: 5, y: 6, to: 'house', icon: 'pin' }]);
    expect(levels[1]?.stretch).toMatchObject({ x: 2, y: 2, offset: { x: 70, y: 0 } });
    expect(levels[2]?.entrances).toEqual([{ x: 7, y: 8, to: 'world', icon: 'pin' }]);
    expect(read?.scenePaths).toEqual([path('World'), path('Town'), path('House'), path('Bare')]);
  });

  it('place the quests whose notes the pins players may see link, each once its note has an id', async () => {
    const memory = vaultWithEvents();
    const crown = 'a'.repeat(24);
    const notes: Record<string, Record<string, unknown>> = {
      'Quests/Crown.md': { 'atlas-type': 'quest', campaign: 'one', 'atlas-id': crown },
      'Quests/Eggs.md': { 'atlas-type': 'quest', campaign: 'one', 'atlas-id': 'b'.repeat(24) },
      'Quests/Ledger.md': { 'atlas-type': 'quest', campaign: 'one' },
      'Notes/Lore.md': { tags: ['lore'] },
    };
    for (const note of Object.keys(notes)) memory.files.set(note, '');
    vi.mocked(memory.app.metadataCache.getFileCache).mockImplementation((file) => ({ frontmatter: notes[file.path] }));
    const world = JSON.parse(memory.files.get(path('World'))!) as { state: { objects: { pins: Record<string, Record<string, unknown>> } } };
    const pins = world.state.objects.pins;
    pins['pin-6'] = { id: 'pin-6', kind: 'pin', x: 60, y: 70, notePath: 'Quests/Crown.md' };
    pins['pin-7'] = { id: 'pin-7', kind: 'pin', x: 80, y: 90, notePath: 'Quests/Crown.md#Reward' };
    pins['pin-8'] = { id: 'pin-8', kind: 'pin', x: 1, y: 1, notePath: 'Quests/Eggs.md', gmOnly: true };
    pins['pin-9'] = { id: 'pin-9', kind: 'pin', x: 2, y: 2, notePath: 'Quests/Ledger.md' };
    memory.files.set(path('World'), JSON.stringify(world));

    const read = await worldMapTree(memory.app, 'world', 32);
    // The GM's own pin places nothing, a quest without an id yet and a note that is no quest neither.
    expect(read?.tree.levels[0]?.quests).toEqual([{ x: 60, y: 70, id: crown }, { x: 80, y: 90, id: crown }]);
    expect(read?.tree.levels[0]?.entrances).toEqual([{ x: 100, y: 50, to: 'town', icon: 'castle' }, { x: 30, y: 30, to: 'town', icon: 'number', label: '3' }]);
    expect(read?.tree.levels[1]).not.toHaveProperty('quests');
    expect(read?.notePaths).toEqual(['Notes/Lore.md', 'Quests/Crown.md', 'Quests/Ledger.md']);

    // The world map may be another once a note its pins link is written: the quest may have its id now.
    const play = CampaignPlay.forApp(memory.app);
    play.play('one');
    const gate = campaignWorldMapGate(memory.app, () => play, () => memoryCampaigns([{ id: 'one', name: 'one', createdAt: 1, worldMap: 'world' }]));
    const changed: ((file: { path: string }) => void)[] = [];
    vi.mocked(memory.app.metadataCache.on).mockImplementation((name: string, callback: (file: { path: string }) => void) => {
      if (name === 'changed') changed.push(callback);
      return {};
    });
    const heard = vi.fn();
    const stop = gate.onChange(heard);
    await gate.worldMap();
    for (const callback of changed) callback({ path: 'Quests/Eggs.md' });
    expect(heard).not.toHaveBeenCalled();
    for (const callback of changed) callback({ path: 'Quests/Ledger.md' });
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stop at the limit, and a plain map is a world map without entrances', async () => {
    const app = vault();
    expect((await worldMapTree(app, 'world', 1))?.tree.levels.map((level) => level.key)).toEqual(['world', 'town']);
    expect((await worldMapTree(app, 'region', 32))?.tree).toEqual({ root: 'region', levels: [{ key: 'region', title: 'Region', image: 'atlas-vtt/assets/region.webp', stretch: { x: 1, y: 1 }, entrances: [] }] });
    expect(await worldMapTree(app, 'bare', 32)).toBeNull();
    expect(await worldMapTree(app, 'gone', 32)).toBeNull();
  });

  it('may be others once one of their scenes is saved, and not for any other file', async () => {
    const { app, emit } = vaultWithEvents();
    const play = CampaignPlay.forApp(app);
    const campaigns = memoryCampaigns([{ id: 'one', name: 'one', createdAt: 1, worldMap: 'world' }]);
    play.play('one');
    const gate = campaignWorldMapGate(app, () => play, () => campaigns);
    const heard = vi.fn();
    const stop = gate.onChange(heard);
    await gate.worldMap();
    emit('modify', { path: path('Secret') });
    expect(heard).not.toHaveBeenCalled();
    emit('modify', { path: path('Town') });
    emit('rename', { path: `${SCENES}/Town 2.atlasmap` }, path('House'));
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
    emit('modify', { path: path('Town') });
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
