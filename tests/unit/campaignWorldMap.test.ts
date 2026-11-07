import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { CampaignPlay } from '../../src/app/campaigns/campaignPlay';
import type { StoredCampaign } from '../../src/app/campaigns/campaignTypes';
import type { WorldMapTree } from '../../src/app/online/gm/book/worldMapGate';
import { campaignWorldMapGate } from '../../src/app/plugin/campaignWorldMapGate';
import { AssetService, type Asset } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryCampaigns } from '../mocks/memoryCampaigns';

const REGION = 'atlas-vtt/assets/region.webp';
const CAVE_MAP = 'atlas-vtt/collections/dungeon/scenes/Cave.atlasmap';
const CAVE_ART = 'atlas-vtt/collections/dungeon/art/cave.webp';
const BARE_MAP = 'atlas-vtt/collections/dungeon/scenes/Bare.atlasmap';
const PRIVATE = 'Private/Passport.png';
const OTHER_FOLDER = 'atlas-vtt/collections/other/art/secret.webp';

const sceneFile = (background: string | null): string => JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, background, grid: null } });

const ASSETS = [
  { id: 'realm', type: 'map', name: 'The Realm', collection: 'dungeon', tags: [], mapFilePath: REGION },
  { id: 'cave', type: 'scene', name: 'Cave', collection: 'dungeon', tags: [], data: { mapPath: CAVE_MAP } },
  { id: 'bare', type: 'scene', name: 'Bare', collection: 'dungeon', tags: [], data: { mapPath: BARE_MAP } },
  { id: 'knight', type: 'token', name: 'Knight', collection: 'dungeon', tags: [], mapFilePath: REGION },
  // A bundle or a hand edit may name any file of the vault as a map's artwork.
  { id: 'passport', type: 'map', name: 'Trap', collection: 'dungeon', tags: [], mapFilePath: PRIVATE },
  { id: 'climb', type: 'map', name: 'Climb', collection: 'dungeon', tags: [], mapFilePath: 'atlas-vtt/assets/../../Private/Passport.png' },
  { id: 'elsewhere', type: 'map', name: 'Elsewhere', collection: 'dungeon', tags: [], mapFilePath: OTHER_FOLDER },
] as unknown as Asset[];

const campaign = (id: string, worldMap?: string): StoredCampaign => ({ id, name: id, createdAt: 1, ...(worldMap !== undefined && { worldMap }) });

interface Setup {
  readonly app: App;
  readonly play: CampaignPlay;
  readonly campaigns: ReturnType<typeof memoryCampaigns>;
  readonly worldMap: () => Promise<string | null>;
  readonly tree: () => Promise<WorldMapTree | null>;
}

function setup(initial: readonly StoredCampaign[]): Setup {
  const { app } = createInMemoryApp({ files: {
    [REGION]: 'IMG', [CAVE_ART]: 'IMG', [PRIVATE]: 'IMG', [OTHER_FOLDER]: 'IMG',
    [CAVE_MAP]: sceneFile(CAVE_ART), 'atlas-vtt/collections/dungeon/scenes/Cave.thumb.jpg': 'JPG',
    [BARE_MAP]: sceneFile(null), 'atlas-vtt/collections/dungeon/scenes/Bare.thumb.jpg': 'JPG',
  } });
  // Looked up as the index does: a plain record, where `constructor` names no asset of its own.
  const index: Record<string, Asset> = Object.fromEntries(ASSETS.map((asset) => [asset.id, asset]));
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getAssetById: async (id: string) => index[id] || null,
    getAssets: async (_collection: string | undefined, type: string) => ASSETS.filter((asset) => asset.type === type),
  } as unknown as AssetService);
  const campaigns = memoryCampaigns(initial);
  const play = CampaignPlay.forApp(app);
  const gate = campaignWorldMapGate(app, () => play, () => campaigns);
  return { app, play, campaigns, worldMap: async () => (await gate.worldMap())?.levels[0]?.image ?? null, tree: () => gate.worldMap() };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('the world map players may be shown', () => {
  it('is the artwork of the map or scene the campaign being played names', async () => {
    const { play, campaigns, worldMap } = setup([campaign('one', 'realm'), campaign('two', 'cave')]);
    play.play('one');
    expect(await worldMap()).toBe(REGION);
    play.play('two');
    expect(await worldMap()).toBe(CAVE_ART);
    campaigns.update('two', (stored) => ({ ...stored, worldMap: 'realm' }));
    expect(await worldMap()).toBe(REGION);
  });

  it('is none while no campaign is played, or the campaign names none or is gone', async () => {
    const { play, worldMap } = setup([campaign('bare'), campaign('one', 'realm')]);
    expect(await worldMap()).toBeNull();
    play.play('bare');
    expect(await worldMap()).toBeNull();
    play.play('deleted');
    expect(await worldMap()).toBeNull();
  });

  it('is none for an asset that is missing, no map or scene, or a scene without artwork of its own', async () => {
    const { play, worldMap } = setup(['gone', 'knight', 'bare', 'constructor', '__proto__'].map((id) => campaign(`plays-${id}`, id)));
    for (const id of ['gone', 'knight', 'bare', 'constructor', '__proto__']) {
      play.play(`plays-${id}`);
      expect(await worldMap()).toBeNull();
    }
  });

  it('is the artwork wherever in the vault it lies, as presenting the scene sends it too, but never a path that climbs out', async () => {
    const { play, worldMap } = setup(['passport', 'climb', 'elsewhere'].map((id) => campaign(`plays-${id}`, id)));
    play.play('plays-passport');
    expect(await worldMap()).toBe(PRIVATE);
    play.play('plays-elsewhere');
    expect(await worldMap()).toBe(OTHER_FOLDER);
    play.play('plays-climb');
    expect(await worldMap()).toBeNull();
  });

  it('is none before the campaigns can be read', async () => {
    const { app } = createInMemoryApp();
    const play = CampaignPlay.forApp(app);
    play.play('one');
    expect(await campaignWorldMapGate(app, () => play, () => undefined).worldMap()).toBeNull();
  });
});

describe('a change of the world map', () => {
  it('is told when another campaign or none is played, a campaign changes, or the asset index or a scene\'s artwork changes, until it is stopped', () => {
    const { app, play, campaigns } = setup([campaign('one', 'realm')]);
    const events = new Map<string, () => void>();
    vi.mocked(app.workspace.on).mockImplementation(((name: string, callback: () => void) => {
      events.set(name, callback);
      return { name };
    }) as never);
    const heard = vi.fn();
    const stop = campaignWorldMapGate(app, () => play, () => campaigns).onChange(heard);

    play.play('one');
    play.stop();
    campaigns.update('one', (stored) => ({ ...stored, worldMap: 'cave' }));
    events.get('atlas-vtt:refresh-assets')?.();
    events.get('atlas-vtt:scene-thumbnail-updated')?.();
    expect(heard).toHaveBeenCalledTimes(5);

    stop();
    play.play('one');
    campaigns.update('one', (stored) => ({ ...stored, worldMap: 'realm' }));
    expect(heard).toHaveBeenCalledTimes(5);
    expect(app.workspace.offref).toHaveBeenCalledTimes(2);
  });
});
