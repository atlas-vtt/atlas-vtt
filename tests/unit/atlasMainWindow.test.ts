// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, ViewState, WorkspaceLeaf } from 'obsidian';
import { keepAtlasInMainWindow } from '../../src/app/plugin/atlasMainWindow';
import { registerAtlasLeafSync } from '../../src/app/plugin/atlasLeaves';
import { showNotice } from '../../src/app/ui/notice';

vi.mock('../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

const rootSplit = { id: 'root' };
const popoutWindow = { id: 'popout' };

const MAP_STATE = {
  file: 'Maps/Tavern.atlasmap',
  tabs: [{ id: 'a', filePath: 'Maps/Tavern.atlasmap', displayName: 'Tavern' }, { id: 'b', filePath: 'Maps/Cave.atlasmap', displayName: 'Cave' }],
  activeTabId: 'b',
  viewportPerTab: { b: { centerX: 10, centerY: 20, scale: 2 } },
};

interface FakeLeaf {
  container: object;
  type: string;
  state: Record<string, unknown>;
  view: { getViewType: () => string; file?: { path: string } | null; atlasStore?: unknown };
  attached: boolean;
  opened: ViewState[];
  getContainer: () => object;
  getViewState: () => ViewState;
  setViewState: (state: ViewState) => Promise<void>;
  detach: () => void;
}

function leafIn(container: object, type: string, state: Record<string, unknown> = {}): FakeLeaf {
  const leaf: FakeLeaf = {
    container,
    type,
    state,
    view: { getViewType: () => leaf.type },
    attached: true,
    opened: [],
    getContainer: () => leaf.container,
    getViewState: () => ({ type: leaf.type, state: leaf.state }),
    setViewState: vi.fn(async (next: ViewState) => {
      leaf.opened.push(next);
      leaf.type = next.type;
      leaf.state = next.state ?? {};
    }),
    detach: vi.fn(() => { leaf.attached = false; }),
  };
  return leaf;
}

/** A workspace of `leaves`, whose new tabs open in the main window. */
function workspaceOf(leaves: FakeLeaf[]): { app: App; newTabs: FakeLeaf[]; layoutChange: () => void } {
  const newTabs: FakeLeaf[] = [];
  const handlers: Array<() => void> = [];
  const all = (): FakeLeaf[] => [...leaves, ...newTabs].filter((leaf) => leaf.attached);
  const workspace = {
    rootSplit,
    getLeavesOfType: (type: string) => all().filter((leaf) => leaf.type === type),
    getMostRecentLeaf: (root: object) => all().find((leaf) => leaf.container === root) ?? null,
    setActiveLeaf: vi.fn(),
    getLeaf: () => {
      const leaf = leafIn(rootSplit, 'empty');
      newTabs.push(leaf);
      return leaf;
    },
    createLeafInParent: vi.fn(),
    revealLeaf: vi.fn(async () => undefined),
    on: (_name: string, handler: () => void) => { handlers.push(handler); return {}; },
    onLayoutReady: vi.fn(),
  };
  return { app: { workspace } as unknown as App, newTabs, layoutChange: () => handlers.forEach((handler) => handler()) };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => vi.mocked(showNotice).mockClear());
afterEach(() => vi.useRealTimers());

describe('keepAtlasInMainWindow', () => {
  it('moves a map in a popout back into the main window with its scenes, and says so once', async () => {
    const note = leafIn(rootSplit, 'markdown');
    const map = leafIn(popoutWindow, 'atlas-vtt', MAP_STATE);
    const { app, newTabs } = workspaceOf([note, map]);

    keepAtlasInMainWindow(app);
    // A layout change while the move runs starts no second one
    keepAtlasInMainWindow(app);
    await settle();

    // The popout's view closes before the map opens again, and its leaf goes
    expect(map.opened).toEqual([{ type: 'empty' }]);
    expect(map.detach).toHaveBeenCalledOnce();
    expect(newTabs).toHaveLength(1);
    expect(newTabs[0]!.opened).toEqual([{ type: 'atlas-vtt', state: MAP_STATE, active: true }]);
    expect(app.workspace.revealLeaf).toHaveBeenCalledWith(newTabs[0]);
    expect(showNotice).toHaveBeenCalledOnce();
    expect(showNotice).toHaveBeenCalledWith('Atlas runs in your main Obsidian window. To use two screens, move your notes into a new window instead.');

    // Back in the main window, nothing moves again
    keepAtlasInMainWindow(app);
    await settle();
    expect(newTabs).toHaveLength(1);
    expect(showNotice).toHaveBeenCalledOnce();
  });

  it('opens the scene a popout view was opened on, which it never loaded', async () => {
    const map = leafIn(popoutWindow, 'atlas-vtt', { file: null, tabs: [], activeTabId: null });
    map.view = { getViewType: () => map.type, file: { path: 'Maps/Cave.atlasmap' }, atlasStore: {} };
    const { app, newTabs } = workspaceOf([leafIn(rootSplit, 'markdown'), map]);

    keepAtlasInMainWindow(app);
    await settle();

    expect(newTabs[0]!.opened[0]!.state).toMatchObject({ file: 'Maps/Cave.atlasmap' });
  });

  it('takes an empty tab of the main window for the map', async () => {
    const empty = leafIn(rootSplit, 'empty');
    const map = leafIn(popoutWindow, 'atlas-vtt', MAP_STATE);
    const { app, newTabs } = workspaceOf([empty, map]);

    keepAtlasInMainWindow(app);
    await settle();

    expect(newTabs).toHaveLength(0);
    expect(empty.opened).toEqual([{ type: 'atlas-vtt', state: MAP_STATE, active: true }]);
  });

  it('leaves a map in the main window alone', async () => {
    const map = leafIn(rootSplit, 'atlas-vtt', MAP_STATE);
    const { app } = workspaceOf([map]);

    keepAtlasInMainWindow(app);
    await settle();

    expect(map.setViewState).not.toHaveBeenCalled();
    expect(map.detach).not.toHaveBeenCalled();
    expect(showNotice).not.toHaveBeenCalled();
  });

  it('never touches the players\' window', async () => {
    const players = leafIn(popoutWindow, 'atlas-vtt-local-player', { tabId: 'a', filePath: 'Maps/Tavern.atlasmap', frozen: false });
    const { app } = workspaceOf([leafIn(rootSplit, 'atlas-vtt', MAP_STATE), players]);

    keepAtlasInMainWindow(app);
    await settle();

    expect(players.setViewState).not.toHaveBeenCalled();
    expect(players.detach).not.toHaveBeenCalled();
    expect(showNotice).not.toHaveBeenCalled();
  });

  it('tries again later while Obsidian is still opening the view, and leaves it where it is meanwhile', async () => {
    vi.useFakeTimers();
    const map = leafIn(popoutWindow, 'atlas-vtt', MAP_STATE);
    // A leaf Obsidian is opening a view in ignores another view state
    let busy = true;
    map.setViewState = vi.fn(async (next: ViewState) => {
      if (busy) return;
      map.opened.push(next);
      map.type = next.type;
    });
    const { app, newTabs } = workspaceOf([leafIn(rootSplit, 'markdown'), map]);

    keepAtlasInMainWindow(app);
    await settle();
    expect(map.detach).not.toHaveBeenCalled();
    expect(newTabs).toHaveLength(0);

    busy = false;
    await vi.advanceTimersByTimeAsync(100);
    await settle();
    expect(map.detach).toHaveBeenCalledOnce();
    expect(newTabs[0]!.opened[0]!.type).toBe('atlas-vtt');
    expect(showNotice).toHaveBeenCalledOnce();
  });
});

describe('registerAtlasLeafSync', () => {
  it('folds a copy opened in a popout into the map in the main window, and says so', async () => {
    const map = leafIn(rootSplit, 'atlas-vtt', MAP_STATE);
    const onLoadFile = vi.fn(async () => undefined);
    map.view = { getViewType: () => map.type, atlasStore: {}, onLoadFile } as FakeLeaf['view'];
    const copy = leafIn(popoutWindow, 'atlas-vtt', MAP_STATE);
    copy.view = { getViewType: () => copy.type, atlasStore: {}, file: { path: 'Maps/Cave.atlasmap' } };
    const { app, layoutChange } = workspaceOf([map, copy]);
    registerAtlasLeafSync({ app, registerEvent: vi.fn() } as never);

    layoutChange();
    await settle();

    expect(copy.detach).toHaveBeenCalledOnce();
    expect(onLoadFile).toHaveBeenCalledWith({ path: 'Maps/Cave.atlasmap' });
    expect(map.setViewState).not.toHaveBeenCalled();
    expect(showNotice).toHaveBeenCalledOnce();
  });
});
