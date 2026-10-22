// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownView, Platform, WorkspaceLeaf, type OpenViewState } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { NotePreviewUIManager } from '../../src/app/services/NotePreviewUIManager';
import { createUILayers, type UILayers } from '../../src/app/services/uiLayers';
import type { PreviewWindowLayout } from '../../src/app/stores/pinnedNotePreviewSlice';

const VIEW_ID = 'pinned-previews-test';
const TAVERN = 'maps/tavern.atlasmap';
const CELLAR = 'maps/cellar.atlasmap';
const LAYOUT: PreviewWindowLayout = { left: 321, top: 54, width: 480, height: 300 };
/** Where a preview opens: jsdom has no layout, so each test places it. */
const OPENED_AT: PreviewWindowLayout = { left: 112, top: 112, width: 400, height: 450 };

/** Lets a test resize the map's leaf the way Obsidian's window does. */
class LeafResizeObserver {
  static instances: LeafResizeObserver[] = [];
  constructor(private readonly callback: ResizeObserverCallback) {
    LeafResizeObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    LeafResizeObserver.instances = LeafResizeObserver.instances.filter((observer) => observer !== this);
  }
  static resize(): void {
    for (const observer of LeafResizeObserver.instances) observer.callback([], observer as unknown as ResizeObserver);
  }
}

interface Harness {
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  manager: NotePreviewUIManager;
  atlasLeaf: WorkspaceLeaf;
  atlasLeafRoot: HTMLElement;
  uiLayers: UILayers;
  /** Note views opened by previews, oldest first. */
  noteViews: MarkdownView[];
}

/** A detached leaf that opens the note in a markdown view, the way Obsidian's does. */
function createNoteLeaf(noteViews: MarkdownView[]): WorkspaceLeaf {
  const leaf = new WorkspaceLeaf();
  const view = new MarkdownView(leaf);
  leaf.view = view;
  noteViews.push(view);
  Object.assign(leaf, {
    detach: vi.fn(),
    openFile: vi.fn(async (_file: unknown, options: OpenViewState) => {
      view.containerEl.setText('Tavern notes');
      view.contentEl.setText('Tavern notes');
      const mode = options.state?.mode;
      if (mode === 'source' || mode === 'preview') view.setMode(mode);
      if (options.eState) view.setEphemeralState(options.eState);
    }),
  });
  return leaf;
}

/** Without `noteLeaves` the workspace has no leaf to spare and previews render plain markdown. */
function createHarness({ noteLeaves = false } = {}): Harness {
  const { app } = createInMemoryApp({ files: { 'notes/tavern.md': 'Tavern notes' } });
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;

  const atlasLeafRoot = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
  const atlasLeaf = new WorkspaceLeaf();
  const viewContainer = atlasLeafRoot.createDiv();
  atlasLeaf.view = { viewId: VIEW_ID, containerEl: viewContainer, getViewType: () => 'atlas-vtt' };
  const uiLayers = createUILayers(viewContainer);
  const noteViews: MarkdownView[] = [];
  Object.assign(app.workspace, {
    getLeavesOfType: vi.fn((type: string) => (type === 'atlas-vtt' ? [atlasLeaf] : [])),
    getActiveViewOfType: vi.fn(() => null),
    getLeaf: vi.fn(() => (noteLeaves ? createNoteLeaf(noteViews) : null)),
    setActiveLeaf: vi.fn(),
  });

  const store = createViewAtlasStore(app, VIEW_ID);
  const eventBus = new EventEmitter();
  const manager = new NotePreviewUIManager(app, eventBus, store, VIEW_ID);
  return { store, eventBus, manager, atlasLeaf, atlasLeafRoot, uiLayers, noteViews };
}

/** The store side of `MapService.loadMap`: save the old map, rehydrate the new one, announce it. */
async function loadMap({ store, eventBus }: Harness, path: string): Promise<void> {
  const state = store.getState();
  if (state.mapLoaded) eventBus.emit('map-unloading');
  state.setPersistenceEnabled(false);
  await store.flushStorage();
  state.setMapLoaded(false);
  state.setMapPath(path);
  state.clearMapState();
  await store.persist.rehydrate();
  state.setPersistenceEnabled(true);
  eventBus.emit('map-loaded');
  state.setMapLoaded(true);
}

async function openPreview({ eventBus }: Harness): Promise<HTMLElement> {
  eventBus.emit('pin-hover-preview', {
    pin: { id: 'pin-1', kind: 'pin', notePath: 'notes/tavern.md', x: 0, y: 0 },
    screenX: 100,
    screenY: 100,
    pixiEvent: { metaKey: true, ctrlKey: true },
  });
  const previewEl = await findPreview();
  layOut(previewEl, OPENED_AT);
  return previewEl;
}

async function findPreview(): Promise<HTMLElement> {
  let previewEl: HTMLElement | null = null;
  await waitFor(() => {
    previewEl = document.querySelector<HTMLElement>('.atlas-note-preview-window');
    expect(previewEl?.textContent).toContain('Tavern notes');
  });
  return previewEl!;
}

function click(previewEl: HTMLElement, button: 'pin' | 'close'): void {
  previewEl.querySelector<HTMLButtonElement>(`.atlas-note-preview-${button}-btn`)!.click();
}

/** What the window measures: jsdom has no layout, and a hidden window measures 0 × 0 at 0, 0. */
function layOut(previewEl: HTMLElement, layout: PreviewWindowLayout): void {
  const offsets = { offsetLeft: layout.left, offsetTop: layout.top, offsetWidth: layout.width, offsetHeight: layout.height };
  for (const [key, value] of Object.entries(offsets)) {
    Object.defineProperty(previewEl, key, { configurable: true, value });
  }
}

function sizeLeaf(leafRoot: HTMLElement, width: number, height: number): void {
  Object.defineProperty(leafRoot, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(leafRoot, 'clientHeight', { configurable: true, value: height });
  LeafResizeObserver.resize();
}

/** Ends a drag of the header (`handle` omitted) or of a resize handle with the window laid out as given. */
function dragTo(previewEl: HTMLElement, layout: PreviewWindowLayout, handle?: 'se'): void {
  const selector = handle ? `.atlas-note-preview-resize-handle-${handle}` : '.atlas-note-preview-header';
  previewEl.querySelector(selector)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  layOut(previewEl, layout);
  document.dispatchEvent(new MouseEvent('mouseup'));
}

function shownLayout(previewEl: HTMLElement): string[] {
  return [previewEl.style.left, previewEl.style.top, previewEl.style.width, previewEl.style.height];
}

describe('NotePreviewUIManager pinned previews', () => {
  let harness: Harness;

  beforeEach(async () => {
    vi.stubGlobal('ResizeObserver', LeafResizeObserver);
    harness = createHarness();
    await loadMap(harness, TAVERN);
  });

  afterEach(() => {
    harness.manager.destroy();
    document.body.empty();
    vi.unstubAllGlobals();
  });

  it('reopens a pinned preview where it was left after switching to another scene and back', async () => {
    const previewEl = await openPreview(harness);
    click(previewEl, 'pin');
    dragTo(previewEl, LAYOUT, 'se');

    await loadMap(harness, CELLAR);
    expect(document.querySelector('.atlas-note-preview-window')).toBeNull();

    await loadMap(harness, TAVERN);
    const reopened = await findPreview();
    expect(harness.atlasLeafRoot.contains(reopened)).toBe(true);
    expect(reopened.querySelector('.atlas-note-preview-pin-btn')?.classList.contains('is-pinned')).toBe(true);
    expect(shownLayout(reopened)).toEqual(['321px', '54px', '480px', '300px']);
  });

  it('stacks previews in the UI layer of their map, between its bars and its overlays', async () => {
    click(await openPreview(harness), 'pin');
    await loadMap(harness, CELLAR);
    await loadMap(harness, TAVERN);

    const reopened = await findPreview();
    expect(reopened.closest('.atlas-note-preview-layer')).toBe(harness.uiLayers.notePreviews);
    expect(harness.uiLayers.notePreviews.parentElement).toBe(harness.uiLayers.container);
  });

  it('opens next to the pin when a sidebar pushes the map away from the window edge', async () => {
    const leafBox = { left: 300, top: 40, width: 1200, height: 800 };
    harness.atlasLeafRoot.getBoundingClientRect = (): DOMRect => ({ ...leafBox, right: 1500, bottom: 840, x: 300, y: 40, toJSON: () => leafBox });
    harness.eventBus.emit('pin-hover-preview', {
      pin: { id: 'pin-1', kind: 'pin', notePath: 'notes/tavern.md', x: 0, y: 0 },
      screenX: 400,
      screenY: 140,
      sourceLeaf: harness.atlasLeaf,
      pixiEvent: { metaKey: true, ctrlKey: true },
    });

    const previewEl = await findPreview();
    expect(harness.uiLayers.notePreviews.contains(previewEl)).toBe(true);
    expect([previewEl.style.left, previewEl.style.top]).toEqual(['112px', '112px']);
  });

  it('keeps the saved layout when the map unloads while the preview is hidden', async () => {
    const previewEl = await openPreview(harness);
    click(previewEl, 'pin');
    dragTo(previewEl, LAYOUT, 'se');

    previewEl.hide();
    layOut(previewEl, { left: 0, top: 0, width: 0, height: 0 });
    await loadMap(harness, CELLAR);

    await loadMap(harness, TAVERN);
    expect(shownLayout(await findPreview())).toEqual(['321px', '54px', '480px', '300px']);
  });

  it('fits a pinned preview into a smaller screen without changing the size it was pinned at', async () => {
    const previewEl = await openPreview(harness);
    click(previewEl, 'pin');
    dragTo(previewEl, LAYOUT, 'se');
    await loadMap(harness, CELLAR);

    sizeLeaf(harness.atlasLeafRoot, 600, 250);
    await loadMap(harness, TAVERN);
    const reopened = await findPreview();
    expect(shownLayout(reopened)).toEqual(['120px', '0px', '480px', '250px']);

    // Scrolling or leaving the window saves it again, as it is shown
    layOut(reopened, { left: 120, top: 0, width: 480, height: 250 });
    reopened.dispatchEvent(new MouseEvent('mouseleave'));
    expect(harness.store.getState().pinnedNotePreviews['pin-1']).toMatchObject(LAYOUT);

    // Moving it on the small screen keeps the size it was pinned at
    dragTo(reopened, { left: 40, top: 0, width: 480, height: 250 });
    expect(harness.store.getState().pinnedNotePreviews['pin-1']).toMatchObject({ ...LAYOUT, left: 40, top: 0 });

    sizeLeaf(harness.atlasLeafRoot, 1600, 900);
    expect(shownLayout(reopened)).toEqual(['40px', '0px', '480px', '300px']);
  });

  it('forgets a pinned preview the user closes', async () => {
    const previewEl = await openPreview(harness);
    click(previewEl, 'pin');
    click(previewEl, 'close');

    expect(harness.store.getState().pinnedNotePreviews).toEqual({});
    await loadMap(harness, CELLAR);
    await loadMap(harness, TAVERN);
    expect(document.querySelector('.atlas-note-preview-window')).toBeNull();
  });

  it('forgets a preview once it is unpinned', async () => {
    const previewEl = await openPreview(harness);
    click(previewEl, 'pin');
    expect(Object.keys(harness.store.getState().pinnedNotePreviews)).toEqual(['pin-1']);

    click(previewEl, 'pin');
    expect(harness.store.getState().pinnedNotePreviews).toEqual({});
  });
});

describe('NotePreviewUIManager pinned note state', () => {
  const cursor = { from: { line: 120, ch: 4 }, to: { line: 120, ch: 9 } };
  let harness: Harness;

  beforeEach(async () => {
    harness = createHarness({ noteLeaves: true });
    await loadMap(harness, TAVERN);
  });

  afterEach(() => {
    harness.manager.destroy();
    document.body.empty();
  });

  async function openPinnedNote(): Promise<{ previewEl: HTMLElement; view: MarkdownView }> {
    const previewEl = await openPreview(harness);
    click(previewEl, 'pin');
    return { previewEl, view: harness.noteViews.at(-1)! };
  }

  it('reopens a pinned note in the mode, at the scroll and cursor it was left at', async () => {
    const { view } = await openPinnedNote();
    view.setMode('preview');
    view.setEphemeralState({ cursor });
    view.currentMode.applyScroll(42.5);

    await loadMap(harness, CELLAR);
    await loadMap(harness, TAVERN);

    await waitFor(() => expect(harness.noteViews).toHaveLength(2));
    const reopened = harness.noteViews[1]!;
    await waitFor(() => expect(reopened.currentMode.getScroll()).toBe(42.5));
    expect(reopened.getEphemeralState()).toEqual({ cursor });
    expect(reopened.getMode()).toBe('preview');
  });

  it('saves the scroll with the map once scrolling pauses', async () => {
    const { previewEl, view } = await openPinnedNote();
    view.currentMode.applyScroll(17);
    previewEl.querySelector('.atlas-note-preview-content')!.dispatchEvent(new Event('scroll'));

    await waitFor(() => {
      expect(harness.store.getState().pinnedNotePreviews['pin-1']?.view?.eState.scroll).toBe(17);
    });
  });
});
