import { EventEmitter } from 'events';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownView, WorkspaceLeaf, type App } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { useMapHotkeys } from '../../src/app/keyboard/useMapHotkeys';
import { NotePreviewUIManager } from '../../src/app/services/NotePreviewUIManager';
import { createUILayers } from '../../src/app/services/uiLayers';

const FIRST_VIEW = 'map-view-1';
const SECOND_VIEW = 'map-view-2';

class NoResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

interface Tabs {
  /** Opens the map in a new tab, which Obsidian then activates. */
  openMap(viewId: string): WorkspaceLeaf;
  /** Closes a tab; Obsidian activates another one, if any is left. */
  close(leaf: WorkspaceLeaf): void;
  /** Resolves a preview's `openFile`, in the order the previews asked for their notes. */
  noteLoads: Array<() => void>;
}

/**
 * The part of Obsidian's workspace the map's shortcuts depend on: `setActiveLeaf` is the only
 * place that moves `mod-active` from one tab to another, and Obsidian itself goes through
 * `workspace.setActiveLeaf` for every tab it activates (a click on a tab, a closed active tab).
 */
function createTabs(app: App): Tabs {
  const roots = new Map<WorkspaceLeaf, HTMLElement>();
  const noteLoads: Array<() => void> = [];
  let active: WorkspaceLeaf | null = null;

  const createNoteLeaf = (): WorkspaceLeaf => {
    const leaf = new WorkspaceLeaf();
    leaf.view = new MarkdownView(leaf);
    Object.assign(leaf, {
      detach: vi.fn(),
      openFile: vi.fn(() => new Promise<void>((resolve) => noteLoads.push(resolve))),
    });
    return leaf;
  };

  Object.assign(app.workspace, {
    getLeavesOfType: (type: string): WorkspaceLeaf[] => (type === 'atlas-vtt' ? [...roots.keys()] : []),
    getActiveViewOfType: (): null => null,
    getLeaf: createNoteLeaf,
    setActiveLeaf: (leaf: WorkspaceLeaf): void => {
      const root = roots.get(leaf);
      if (!root || leaf === active) return;
      if (active) roots.get(active)?.removeClass('mod-active');
      active = leaf;
      root.addClass('mod-active');
    },
  });

  return {
    noteLoads,
    openMap(viewId) {
      const leaf = new WorkspaceLeaf();
      const root = document.body.createDiv({ cls: 'workspace-leaf' });
      const containerEl = root.createDiv({ attr: { 'data-view-id': viewId } });
      leaf.view = { viewId, containerEl, getViewType: () => 'atlas-vtt' };
      roots.set(leaf, root);
      app.workspace.setActiveLeaf(leaf, { focus: true });
      return leaf;
    },
    close(leaf) {
      roots.get(leaf)?.remove();
      roots.delete(leaf);
      const [next] = roots.keys();
      if (next) app.workspace.setActiveLeaf(next, { focus: true });
    },
  };
}

describe('map shortcuts after note previews opened at the same time', () => {
  let app: App;
  let tabs: Tabs;
  let store: ViewAtlasStore;
  let eventBus: EventEmitter;
  let manager: NotePreviewUIManager;
  let mapLeaf: WorkspaceLeaf;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', NoResizeObserver);
    ({ app } = createInMemoryApp({ files: { 'notes/tavern.md': 'Tavern', 'notes/cellar.md': 'Cellar' } }));
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    tabs = createTabs(app);
    mapLeaf = tabs.openMap(FIRST_VIEW);
    createUILayers(mapLeaf.view.containerEl);
    store = createViewAtlasStore(app, FIRST_VIEW);
    eventBus = new EventEmitter();
    manager = new NotePreviewUIManager(app, eventBus, store, FIRST_VIEW);
  });

  afterEach(() => {
    manager.destroy();
    document.body.empty();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** The notes finish loading in the order their previews were opened; `shown` of them are still open then. */
  async function finishLoading(shown: number): Promise<void> {
    expect(tabs.noteLoads).toHaveLength(2);
    for (const finish of tabs.noteLoads) finish();
    await waitFor(() => expect(document.querySelectorAll('.atlas-embedded-leaf-view')).toHaveLength(shown));
  }

  function pinNote(anchorId: string, notePath: string): void {
    store.getState().savePinnedNotePreview({ anchorId, notePath, left: 10, top: 10, width: 400, height: 300 });
  }

  async function loadMapWithTwoPinnedNotes(): Promise<void> {
    pinNote('pin-1', 'notes/tavern.md');
    pinNote('pin-2', 'notes/cellar.md');
    eventBus.emit('map-loaded');
    await finishLoading(2);
  }

  function tapModKey(): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true, ctrlKey: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
  }

  /** The handler V reaches in a map view, as its toolbar binds the move tool. */
  function moveToolOf(viewId: string): ReturnType<typeof vi.fn> {
    const move = vi.fn();
    renderHook(() => useMapHotkeys({ move }, viewId));
    return move;
  }

  function pressV(): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV' }));
  }

  /** V must reach the move tool of a map opened in a new tab after the first one was closed. */
  function expectShortcutsInReopenedMap(): void {
    tabs.close(mapLeaf);
    tabs.openMap(SECOND_VIEW);
    const move = moveToolOf(SECOND_VIEW);

    pressV();

    expect(move).toHaveBeenCalledTimes(1);
  }

  function expectActive(leaf: WorkspaceLeaf, active: boolean): void {
    expect(leaf.view.containerEl.closest('.workspace-leaf')?.hasClass('mod-active')).toBe(active);
  }

  it('still runs them in a map tab that was closed and opened again', async () => {
    await loadMapWithTwoPinnedNotes();

    expectShortcutsInReopenedMap();
  });

  it('runs them in the map tab the GM switches to, not in the one left behind', async () => {
    await loadMapWithTwoPinnedNotes();
    const moveInFirstMap = moveToolOf(FIRST_VIEW);

    const otherMap = tabs.openMap(SECOND_VIEW);
    const moveInOtherMap = moveToolOf(SECOND_VIEW);
    pressV();

    expectActive(otherMap, true);
    expectActive(mapLeaf, false);
    expect(moveInOtherMap).toHaveBeenCalledTimes(1);
    expect(moveInFirstMap).not.toHaveBeenCalled();
  });

  it('still runs them after Cmd/Ctrl was tapped twice over a pin while its note loaded', async () => {
    // The first preview's note, forgotten at the key's release, finishes loading without its window.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    eventBus.emit('pin-hover-preview', {
      pin: { id: 'pin-1', kind: 'pin', notePath: 'notes/tavern.md', x: 0, y: 0 },
      screenX: 100,
      screenY: 100,
      sourceLeaf: mapLeaf,
      pixiEvent: { metaKey: false, ctrlKey: false },
    });
    tapModKey();
    tapModKey();
    await finishLoading(0);

    expectShortcutsInReopenedMap();
  });

  it('still activates tabs when the workspace fails to give a preview its leaf', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    app.workspace.getLeaf = (): never => {
      throw new Error('No tab group found.');
    };
    pinNote('pin-1', 'notes/tavern.md');
    eventBus.emit('map-loaded');
    await waitFor(() => expect(document.querySelector('.atlas-note-preview-window')).toBeNull());

    const otherMap = tabs.openMap(SECOND_VIEW);

    expectActive(otherMap, true);
  });
});
