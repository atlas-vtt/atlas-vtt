// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceLeaf } from 'obsidian';
import { AtlasView } from '../../src/app/atlas-view';

const init = vi.fn(async () => null);
const setMapLoading = vi.fn();

vi.mock('../../src/app/services/ServiceManager', () => ({
  ServiceManager: class {
    getRendererService(): unknown { return { init, isInitialized: () => false }; }
    getNotePreviewUIManager(): unknown { return { setViewElement: vi.fn() }; }
    getUIOverlay(): unknown { return { mount: vi.fn() }; }
  },
}));
vi.mock('../../src/app/storeFactory', () => ({ createViewAtlasStore: () => ({ getState: () => ({ setMapLoading }) }) }));

const rootSplit = { id: 'root' };

/** An Atlas view in a leaf of `container`: the main window's `rootSplit` or a popout. */
function viewIn(container: object): AtlasView {
  const leaf = new WorkspaceLeaf();
  Object.assign(leaf, { app: { workspace: { rootSplit } }, getContainer: () => container });
  return new AtlasView(leaf);
}

describe('AtlasView in a popout', () => {
  it('loads nothing there: the map opens in the main window instead', async () => {
    init.mockClear();
    await viewIn({ id: 'popout' }).onOpen();
    expect(init).not.toHaveBeenCalled();
    expect(setMapLoading).not.toHaveBeenCalled();
  });

  it('starts its renderer in the main window', async () => {
    init.mockClear();
    await viewIn(rootSplit).onOpen();
    expect(init).toHaveBeenCalledOnce();
  });
});
