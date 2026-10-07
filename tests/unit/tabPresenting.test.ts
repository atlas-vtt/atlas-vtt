import { beforeEach, describe, expect, it, vi } from 'vitest';

const { presentTabInPlayerWindow, presentTabToPlayers } = vi.hoisted(() => ({
  presentTabInPlayerWindow: vi.fn(() => Promise.resolve()),
  presentTabToPlayers: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentTabInPlayerWindow }));
vi.mock('../../src/app/services/presentToPlayers', () => ({ presentTabToPlayers }));

import { activePresentationTarget, addPresentationTarget } from '../../src/app/services/presentationTargets';
import { presentTab } from '../../src/app/react/tabPresenting';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

const app = {} as never;
const tabMetaStore = createTabMetaStore();
tabMetaStore.getState().addTab('maps/t1.atlasmap', 'T1');
tabMetaStore.getState().setTabs(tabMetaStore.getState().tabs.map((tab) => ({ ...tab, id: 't1' })), 't1');
const view = { viewId: 'view-1', tabMetaStore } as never;

describe('the eye button', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('presents in the player window without a target', () => {
    presentTab(app, view, 't1');
    expect(presentTabInPlayerWindow).toHaveBeenCalledWith(app, view, 't1');
    expect(presentTabToPlayers).not.toHaveBeenCalled();
  });

  it('presents to the second screen only while a target is active', () => {
    const stop = addPresentationTarget({ id: 't', label: 'the second screen', isActive: () => true });
    presentTab(app, view, 't1');
    expect(presentTabToPlayers).toHaveBeenCalledWith(view, 't1');
    expect(presentTabInPlayerWindow).not.toHaveBeenCalled();
    stop();
  });

  it('the eye opens the player window again once the last target is removed', () => {
    const stop = addPresentationTarget({ id: 't', label: 'the second screen', isActive: () => true });
    stop();
    expect(activePresentationTarget()).toBeNull();
    presentTab(app, view, 't1');
    expect(presentTabInPlayerWindow).toHaveBeenCalledWith(app, view, 't1');
  });
});
