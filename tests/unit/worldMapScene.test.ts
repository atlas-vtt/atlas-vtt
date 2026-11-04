import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { CampaignService } from '../../src/app/campaigns/CampaignService';
import { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryCampaigns } from '../mocks/memoryCampaigns';

const leaves = vi.hoisted(() => ({ openMapInView: vi.fn(), setActiveTool: vi.fn() }));
vi.mock('../../src/app/plugin/atlasLeaves', () => ({
  openMapInView: leaves.openMapInView,
  getLoadedAtlasView: () => ({ getStore: () => ({ getState: () => ({ setActiveTool: leaves.setActiveTool }) }) }),
}));

import { editWorldMap } from '../../src/app/react/components/dashboard/worldMapScene';

const SCENE = 'atlas-vtt/collections/Cairn/scenes/The Wide World.atlasmap';
const IMAGE = 'atlas-vtt/assets/The Wide World.webp';

afterEach(() => {
  vi.clearAllMocks();
  AssetService.resetInstance();
});

async function setUp(): Promise<{ app: ReturnType<typeof createInMemoryApp>['app']; service: CampaignService; mapId: string; sceneId: string }> {
  const { app } = createInMemoryApp({
    files: {
      [SCENE]: JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, mapPath: SCENE, objects: {} } }),
      [IMAGE]: 'WEBP',
    },
  });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  const map = await assets.addAsset({ type: 'map', name: 'The Wide World', mapFilePath: IMAGE, tags: [], collection: 'Cairn' });
  const [scene] = await assets.getAssets(undefined, 'scene');
  const service = new CampaignService(memoryCampaigns([{ id: 'a', name: 'Cairn', createdAt: 1, worldMap: map.id }]));
  return { app, service, mapId: map.id, sceneId: scene!.id };
}

describe('opening a campaign\'s world map to place pins', () => {
  it('opens a world map that is a scene with the note pin tool in hand', async () => {
    const { app, service, mapId, sceneId } = await setUp();
    await editWorldMap(app, service.get('a')!, service, { id: sceneId, name: 'The Wide World', kind: 'scene', thumbnailUrl: null, scenePath: SCENE });
    expect(leaves.openMapInView).toHaveBeenCalledWith(app, expect.objectContaining({ path: SCENE }));
    expect(leaves.setActiveTool).toHaveBeenCalledWith('note-pin');
    // Opening a scene changes nothing of the campaign.
    expect(service.get('a')?.worldMap).toBe(mapId);
  });

  it('makes a plain map a scene first, which becomes the world map, and opens that', async () => {
    const { app, service, mapId } = await setUp();
    await editWorldMap(app, service.get('a')!, service, { id: mapId, name: 'The Wide World', kind: 'map', thumbnailUrl: null });
    const opened = leaves.openMapInView.mock.calls[0]![1] as TFile;
    expect(opened).toBeInstanceOf(TFile);
    expect(opened.path).not.toBe(SCENE);
    const scene = await AssetService.getInstance(app).getAssetById(service.get('a')!.worldMap!);
    expect(scene?.type).toBe('scene');
    expect(scene?.type === 'scene' && scene.data?.mapPath).toBe(opened.path);
    expect(leaves.setActiveTool).toHaveBeenCalledWith('note-pin');
  });
});
