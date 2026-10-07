import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class AtlasView {} }));

import { AtlasView } from '../../src/app/atlas-view';
import { presentedScene } from '../../src/app/services/PresentedScene';
import { presentTabToPlayers } from '../../src/app/services/presentToPlayers';
import { addPresentationTarget } from '../../src/app/services/presentationTargets';
import { playerWindowStore } from '../../src/app/stores/playerWindowStore';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

function mapView(switches: boolean): { view: AtlasView & { switchToTab: ReturnType<typeof vi.fn> }; caves: string } {
  const tabMetaStore = createTabMetaStore();
  const tavern = tabMetaStore.getState().addTab('Tavern.atlasmap', 'Tavern');
  const caves = tabMetaStore.getState().addTab('Caves.atlasmap', 'Caves');
  tabMetaStore.getState().setActiveTab(tavern);
  const view = Object.assign(Object.create(AtlasView.prototype) as AtlasView, {
    tabMetaStore,
    atlasStore: createStore(() => ({ isMapLoading: false, mapLoaded: true, mapPath: 'Caves.atlasmap' })),
    isClosed: false,
    register: () => {},
    switchToTab: vi.fn(async (tabId: string) => { if (switches) tabMetaStore.getState().setActiveTab(tabId); }),
  });
  return { view, caves };
}

describe('presentTabToPlayers, once a presentation target is registered', () => {
  let removeTarget: () => void = () => undefined;
  beforeEach(() => {
    playerWindowStore.setState({ isOpen: true });
    removeTarget = addPresentationTarget({ id: 'registered', label: 'an audience', isActive: () => false });
  });
  afterEach(() => { removeTarget(); presentedScene.clear(); });

  it('switches to the clicked tab before presenting it', async () => {
    const { view, caves } = mapView(true);
    await presentTabToPlayers(view, caves);
    expect(view.switchToTab).toHaveBeenCalledWith(caves);
    expect(presentedScene.current()?.tabId).toBe(caves);
    expect(presentedScene.isHeld()).toBe(false);
  });

  it('presents nothing when the switch did not land on the tab', async () => {
    const { view, caves } = mapView(false);
    await presentTabToPlayers(view, caves);
    expect(presentedScene.current()).toBeNull();
  });
});
