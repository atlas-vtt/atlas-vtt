import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenCollectionSync } from '../../src/app/plugin/TokenCollectionSync';
import { initialRemoteViewState } from '../../src/app/remote-view/remoteViewState';
import { AssetService } from '../../src/app/services/AssetService';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const prone = { id: 'prone', name: 'Prone', color: '#ff0000' };
const BAR = { key: 'bar0', name: 'Bar', field: '', direction: 'drains', color: '#22c55e', visibleToPlayers: true, slot: 0 } as const;

function sync(state: Pick<ViewAtlasState, 'mapPath' | 'grid' | 'remoteView'>): { sync: TokenCollectionSync; assets: AssetService } {
  const { app } = createInMemoryApp();
  const assets = AssetService.getInstance(app);
  vi.spyOn(assets, 'getCollectionForMap').mockImplementation((path: string) => (path.startsWith('atlas-vtt/collections/c/') ? 'c' : null));
  vi.spyOn(assets, 'getCollectionSettings').mockReturnValue({ conditions: [prone] } as never);
  vi.mocked(assets.getCollectionForMap).mockClear();
  return { sync: new TokenCollectionSync(app, () => state, { refreshRules: () => undefined, refreshArt: async () => undefined }), assets };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('TokenCollectionSync conditions and resources', () => {
  it("reads a map's conditions from its collection", () => {
    expect(sync({ mapPath: 'atlas-vtt/collections/c/scenes/a.atlasmap', grid: null as never, remoteView: null }).sync.conditions()).toEqual([prone]);
    expect(sync({ mapPath: 'elsewhere.atlasmap', grid: null as never, remoteView: null }).sync.conditions()).toEqual([]);
    expect(sync({ mapPath: null, grid: null as never, remoteView: null }).sync.conditions()).toEqual([]);
  });

  it("gives a remote view the conditions and resources its owner feeds, and never reads a collection for it", () => {
    const neutral = { id: 'x', name: 'Condition', color: '#5b5f6a' };
    const remoteView = { ...initialRemoteViewState(), conditions: [neutral], resources: { hurt: [BAR] } };
    const { sync: remote, assets } = sync({ mapPath: null, grid: null as never, remoteView });
    expect(remote.conditions()).toEqual([neutral]);
    expect(remote.resources('hurt')).toEqual([BAR]);
    expect(remote.resources('nobody')).toEqual([]);
    expect(remote.resources()).toEqual([]);
    expect(assets.getCollectionForMap).not.toHaveBeenCalled();
  });
});
