import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class {}, ATLAS_VIEW_TYPE: 'atlas-vtt-view' }));

import { openMapInView } from '../../src/app/plugin/atlasLeaves';

function appWith(recent: { type: string; pinned?: boolean }): { app: never; fresh: { setViewState: ReturnType<typeof vi.fn> }; recentLeaf: { setViewState: ReturnType<typeof vi.fn> } } {
  const make = (type: string, pinned = false): { setViewState: ReturnType<typeof vi.fn>; loadIfDeferred: () => Promise<void>; getViewState: () => { pinned: boolean; type: string }; view: { getViewType: () => string } } => ({
    setViewState: vi.fn(), loadIfDeferred: async () => undefined, getViewState: () => ({ pinned, type }), view: { getViewType: () => type },
  });
  const recentLeaf = make(recent.type, recent.pinned);
  const fresh = make('empty');
  const app = {
    workspace: {
      getLeavesOfType: () => [],
      getMostRecentLeaf: () => recentLeaf,
      getLeaf: () => fresh,
      revealLeaf: async () => undefined,
    },
  } as never;
  return { app, fresh, recentLeaf };
}

describe('openMapInView', () => {
  it('opens a map in the most recent tab', async () => {
    const { app, fresh, recentLeaf } = appWith({ type: 'markdown' });
    await openMapInView(app, { path: 'a.atlasmap' } as never);
    expect(recentLeaf.setViewState).toHaveBeenCalledOnce();
    expect(fresh.setViewState).not.toHaveBeenCalled();
  });

});
