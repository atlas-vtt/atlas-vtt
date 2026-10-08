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

function pressMoveKey(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV' }));
}

describe('map shortcuts after pinned note previews opened', () => {
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
  });

  /** A map with two pinned notes loads; the notes finish loading in the order they were opened. */
  async function loadMapWithTwoPinnedNotes(): Promise<void> {
    const layout = { left: 10, top: 10, width: 400, height: 300 };
    store.getState().savePinnedNotePreview({ anchorId: 'pin-1', notePath: 'notes/tavern.md', ...layout });
    store.getState().savePinnedNotePreview({ anchorId: 'pin-2', notePath: 'notes/cellar.md', ...layout });
    eventBus.emit('map-loaded');

    expect(tabs.noteLoads).toHaveLength(2);
    for (const [index, finishLoading] of tabs.noteLoads.entries()) {
      finishLoading();
      await waitFor(() => expect(document.querySelectorAll('.atlas-embedded-leaf-view')).toHaveLength(index + 1));
    }
  }

  it('still runs them in a map tab that was closed and opened again', async () => {
    await loadMapWithTwoPinnedNotes();

    tabs.close(mapLeaf);
    tabs.openMap(SECOND_VIEW);

    const move = vi.fn();
    renderHook(() => useMapHotkeys({ move }, SECOND_VIEW));
    pressMoveKey();
    expect(move).toHaveBeenCalledTimes(1);
  });

  it('still activates the tab the GM switches to', async () => {
    await loadMapWithTwoPinnedNotes();

    const otherMap = tabs.openMap(SECOND_VIEW);

    expect(otherMap.view.containerEl.closest('.workspace-leaf')?.hasClass('mod-active')).toBe(true);
    expect(mapLeaf.view.containerEl.closest('.workspace-leaf')?.hasClass('mod-active')).toBe(false);
  });
});
