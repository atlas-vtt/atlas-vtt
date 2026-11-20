// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { DM_SCREEN_VIEW_TYPE, DMScreenView, showDMScreenView } from '../../src/app/dm-screen-view';
import { getLoadedAtlasView, loadAtlasView } from '../../src/app/plugin/atlasLeaves';
import { useAtlasStore } from '../../src/app/react/ViewStoreContext';

vi.mock('../../src/app/plugin/atlasLeaves', () => ({
  getLoadedAtlasView: vi.fn(),
  loadAtlasView: vi.fn(),
}));
vi.mock('../../src/app/utils/observeResize', () => ({ observeResize: () => () => {} }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ ContextMenuProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('../../src/app/react/components/DMScreen', () => ({
  default: ({ inTab, onLocate }: { inTab: boolean; onLocate: () => void }) => {
    const scene = useAtlasStore((state) => state.mapPath);
    return <button onClick={onLocate}>{inTab ? scene : 'overlay'}</button>;
  },
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('DM screen window', () => {
  it('opens one popout and reveals it again without resetting its view', async () => {
    const leaf = { setViewState: vi.fn(async () => {}) };
    const workspace = { openPopoutLeaf: vi.fn(() => leaf), getLeavesOfType: vi.fn(() => [] as typeof leaf[]), revealLeaf: vi.fn(async () => {}) };
    vi.mocked(loadAtlasView).mockResolvedValue({} as never);
    await showDMScreenView({ workspace } as never);
    expect(workspace.openPopoutLeaf).toHaveBeenCalledOnce();
    expect(leaf.setViewState).toHaveBeenCalledWith({ type: DM_SCREEN_VIEW_TYPE, active: true });
    workspace.getLeavesOfType.mockReturnValue([leaf]);
    await showDMScreenView({ workspace } as never);
    expect(workspace.openPopoutLeaf).toHaveBeenCalledTimes(1);
    expect(leaf.setViewState).toHaveBeenCalledTimes(1);
    expect(workspace.revealLeaf).toHaveBeenCalledTimes(2);
    expect(workspace.revealLeaf).toHaveBeenLastCalledWith(leaf);
  });

  it('requires an Atlas view before opening a window', async () => {
    vi.mocked(loadAtlasView).mockResolvedValue(null);
    const openPopoutLeaf = vi.fn();
    await expect(showDMScreenView({ workspace: { openPopoutLeaf } } as never)).rejects.toThrow('No Atlas map view');
    expect(openPopoutLeaf).not.toHaveBeenCalled();
  });

  it('reports a failure to open the popout', async () => {
    vi.mocked(loadAtlasView).mockResolvedValue({} as never);
    const error = new Error('Could not open a window');
    const workspace = { getLeavesOfType: () => [], openPopoutLeaf: vi.fn(() => { throw error; }) };
    await expect(showDMScreenView({ workspace } as never)).rejects.toThrow(error);
  });

  it('follows the map store and closes when its map leaf goes away', async () => {
    const store = createStore(() => ({ mapPath: 'first.atlasmap' }));
    let layoutChange: () => void = () => {};
    let mapPresent = true;
    const workspace = {
      on: vi.fn((_name: string, callback: () => void) => { layoutChange = callback; return {}; }),
      onLayoutReady: (callback: () => void) => callback(),
      getLeavesOfType: () => mapPresent ? [{}] : [],
      revealLeaf: vi.fn(async () => {}),
    };
    const app = { workspace };
    const map = { app, leaf: {}, renderer: null, getStore: () => store };
    vi.mocked(loadAtlasView).mockResolvedValue(map as never);
    vi.mocked(getLoadedAtlasView).mockImplementation(() => mapPresent ? map as never : null);
    const leaf = { app, detach: vi.fn() };
    const view = new DMScreenView(leaf as never);
    Object.assign(view, { registerEvent: vi.fn() });
    document.body.append(view.contentEl);
    await act(async () => { await view.onOpen(); });
    expect(screen.getByText('first.atlasmap')).toBeTruthy();
    act(() => store.setState({ mapPath: 'second.atlasmap' }));
    expect(screen.getByText('second.atlasmap')).toBeTruthy();
    act(() => screen.getByText('second.atlasmap').click());
    expect(workspace.revealLeaf).toHaveBeenCalledWith(map.leaf);
    mapPresent = false;
    act(() => layoutChange());
    expect(leaf.detach).toHaveBeenCalledOnce();
    await act(async () => view.onClose());
    view.contentEl.remove();
  });
});
