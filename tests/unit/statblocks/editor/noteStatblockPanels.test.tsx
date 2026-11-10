// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkdownView, TFile, type App, type Scope, type WorkspaceLeaf } from 'obsidian';
import { SettingsService } from '../../../../src/app/services/SettingsService';
import { NoteStatblockPanels } from '../../../../src/app/statblocks/editor/note-panel/noteStatblockPanels';
import {
  DEFAULT_MAX_WIDTH, MIN_PANEL_WIDTH, NOTE_MIN_WIDTH, clampPanelWidth, defaultPanelWidth, loadPanelPrefs, panelWidth,
} from '../../../../src/app/statblocks/editor/note-panel/panelPrefs';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { FakeSource, FakeWriter } from './paneKit';

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const WARDEN = 'Bestiary/Marsh Warden.md';
const HAG = 'Bestiary/Bog Hag.md';
const GOBLIN = 'Bestiary/Goblin.md';
const PLAIN = 'Notes/Marsh.md';
const NATIVE = (name: string): Record<string, unknown> => ({ statblock: true, 'atlas-template': 'builtin:generic-creature', name, hp: 14 });

type Listener = (...args: unknown[]) => unknown;

/** A Markdown view as Obsidian builds one: the content (editor and reader) inside the view's container. */
class NoteView extends MarkdownView {
  constructor(leaf: WorkspaceLeaf, path: string) {
    super(leaf);
    this.containerEl.classList.add('workspace-leaf-content');
    this.contentEl.classList.add('view-content');
    this.contentEl.createDiv({ cls: 'markdown-source-view' });
    this.containerEl.appendChild(this.contentEl);
    document.body.appendChild(this.containerEl);
    this.file = new TFile(path);
  }
}

interface Harness {
  app: App;
  panels: NoteStatblockPanels;
  source: FakeSource;
  writer: FakeWriter;
  leaves: Array<{ view: unknown }>;
  frontmatter: Map<string, Record<string, unknown> | undefined>;
  settings: SettingsService;
  trigger: (name: string, ...args: unknown[]) => void;
  /** Opens a note in a new leaf. */
  open: (path: string) => NoteView;
}

const harnesses: Harness[] = [];

async function setup({ switchedOn = true } = {}): Promise<Harness> {
  const { app } = createInMemoryApp({ files: { [WARDEN]: '', [HAG]: '', [GOBLIN]: '', [PLAIN]: '' } });
  const settings = new SettingsService(app);
  if (switchedOn) settings.setExperimental('statblockEditor', true);
  const listeners = new Map<string, Set<Listener>>();
  const on = (name: string, listener: Listener): { name: string; listener: Listener } => {
    const set = listeners.get(name) ?? new Set();
    set.add(listener);
    listeners.set(name, set);
    return { name, listener };
  };
  const offref = (ref: { name: string; listener: Listener }): void => void listeners.get(ref.name)?.delete(ref.listener);
  const trigger = (name: string, ...args: unknown[]): void => { for (const listener of listeners.get(name) ?? []) listener(...args); };
  const leaves: Array<{ view: unknown }> = [];
  app.workspace = {
    iterateAllLeaves: (callback: (leaf: unknown) => void) => { for (const leaf of [...leaves]) callback(leaf); },
    on, offref, trigger,
    onLayoutReady: (callback: () => void) => callback(),
    getActiveViewOfType: () => null,
  };
  const frontmatter = new Map<string, Record<string, unknown> | undefined>([
    [WARDEN, NATIVE('Marsh Warden')], [HAG, NATIVE('Bog Hag')], [GOBLIN, { statblock: true, name: 'Goblin' }], [PLAIN, { tags: 'marsh' }],
  ]);
  app.metadataCache = { ...app.metadataCache, on, offref, getFileCache: (file: TFile) => ({ frontmatter: frontmatter.get(file.path) }) };
  const source = new FakeSource();
  const writer = new FakeWriter();
  for (const [path, values] of frontmatter) if (values) source.set(path, values);
  const panels = new NoteStatblockPanels(app, { services: () => ({ source, writer }), actions: {} });
  const harness: Harness = {
    app, panels, source, writer, leaves, frontmatter, settings, trigger,
    open: (path) => {
      const leaf = { view: null as unknown, app };
      const view = new NoteView(leaf as unknown as WorkspaceLeaf, path);
      leaf.view = view;
      leaves.push(leaf);
      return view;
    },
  };
  harnesses.push(harness);
  return harness;
}

const start = async (harness: Harness): Promise<void> => {
  await act(async () => { harness.panels.start(); });
  await waitFor(() => expect(TemplateLibrary.forApp(harness.app).isLoading()).toBe(false));
};
const refresh = async (harness: Harness): Promise<void> => { await act(async () => { harness.trigger('layout-change'); }); };
const panelOf = (view: NoteView): HTMLElement | null => view.contentEl.querySelector('.atlas-sb-note-panel');
const action = (view: NoteView): HTMLElement | null => view.containerEl.querySelector('.view-action');


afterEach(async () => {
  for (const harness of harnesses.splice(0)) {
    harness.panels.release();
    TemplateLibrary.release(harness.app);
    await harness.settings.saveSettingsNow();
  }
  await act(async () => { await Promise.resolve(); });
  cleanup();
  document.body.replaceChildren();
});

describe('the statblock beside its note', () => {
  it('decorates a native statblock\'s view with one panel, a row layout and hidden Properties, and adds no header action', async () => {
    const harness = await setup();
    const view = harness.open(WARDEN);
    await start(harness);

    expect(view.contentEl.querySelectorAll('.atlas-sb-note-panel')).toHaveLength(1);
    expect(view.contentEl.firstElementChild?.className).toBe('markdown-source-view');
    expect(view.containerEl.classList.contains('atlas-sb-note')).toBe(true);
    expect(view.containerEl.classList.contains('atlas-sb-note--hide-properties')).toBe(true);
    expect(action(view)).toBeNull();
    await waitFor(() => expect(panelOf(view)!.querySelector('[data-block-id="header-hp"]')).not.toBeNull());
    expect(within(panelOf(view)!).getByRole('separator', { name: 'Statblock width' })).toBeTruthy();
  });

  it('leaves Fantasy Statblocks\' notes, plain notes and deferred leaves alone, and everything while the switch is off', async () => {
    const harness = await setup({ switchedOn: false });
    const native = harness.open(WARDEN);
    const fantasy = harness.open(GOBLIN);
    const plain = harness.open(PLAIN);
    harness.leaves.push({ view: { getViewType: () => 'markdown' } });
    await start(harness);
    for (const view of [native, fantasy, plain]) {
      expect(panelOf(view)).toBeNull();
      expect(action(view)).toBeNull();
      expect(view.containerEl.classList.contains('atlas-sb-note')).toBe(false);
    }

    await act(async () => { harness.settings.setExperimental('statblockEditor', true); });
    expect(panelOf(native)).not.toBeNull();
    expect(panelOf(fantasy)).toBeNull();
    expect(panelOf(plain)).toBeNull();

    await act(async () => { harness.settings.setExperimental('statblockEditor', false); });
    expect(panelOf(native)).toBeNull();
    expect(native.containerEl.className).toBe('workspace-leaf-content');
  });

  it('follows the note a leaf shows, and a note that gains or loses its template', async () => {
    const harness = await setup();
    const view = harness.open(WARDEN);
    await start(harness);
    const first = panelOf(view);
    view.file = new TFile(HAG);
    await refresh(harness);
    expect(panelOf(view)).toBe(first);
    await waitFor(() => expect(panelOf(view)!.querySelector('[data-block-id="header-name"]')?.textContent).toBe('Bog Hag'));

    view.file = new TFile(PLAIN);
    await refresh(harness);
    expect(panelOf(view)).toBeNull();
    expect(action(view)).toBeNull();
    expect(view.containerEl.className).toBe('workspace-leaf-content');
    harness.frontmatter.set(PLAIN, NATIVE('Marsh'));
    await act(async () => { harness.trigger('changed', new TFile(PLAIN)); });
    expect(panelOf(view)).not.toBeNull();

    // Properties being typed (nothing the cache can read) keep the panel; a note without a template loses it.
    harness.frontmatter.set(PLAIN, undefined);
    await act(async () => { harness.trigger('changed', new TFile(PLAIN)); });
    expect(panelOf(view)).not.toBeNull();
    harness.frontmatter.set(PLAIN, { statblock: true });
    await act(async () => { harness.trigger('changed', new TFile(PLAIN)); });
    expect(panelOf(view)).toBeNull();
  });

  it('undecorates a closed view cleanly, writing the text being typed first', async () => {
    const harness = await setup();
    const view = harness.open(WARDEN);
    await start(harness);
    const panel = panelOf(view)!;
    await waitFor(() => expect(panel.querySelector('[data-block-id="header-hp"]')).not.toBeNull());
    fireEvent.focusIn(panel);
    expect((harness.app.keymap as unknown as { scopes: Scope[] }).scopes).toHaveLength(1);
    fireEvent.click(panel.querySelector('[data-block-id="header-hp"]')!);
    const input = within(panel).getByRole('textbox', { name: 'Hit Points' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '31' } });
    expect(harness.writer.pending.size).toBe(1);
    harness.leaves.splice(0);
    await refresh(harness);
    await waitFor(() => expect(harness.writer.flush).toHaveBeenCalledWith(WARDEN));
    expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['hp'], base: 14, next: 31 }]);
    expect(panel.isConnected).toBe(false);
    expect(harness.writer.pending.size).toBe(0);
    expect((harness.app.keymap as unknown as { scopes: Scope[] }).scopes).toHaveLength(0);
    expect(view.containerEl.className).toBe('workspace-leaf-content');
  });

  it('undoes in the note with Mod+Z only while focus is in the panel, and leaves the key to its text fields', async () => {
    const harness = await setup();
    const view = harness.open(WARDEN);
    await start(harness);
    const panel = panelOf(view)!;
    const keymap = harness.app.keymap as unknown as { scopes: Array<{ keys: Array<{ modifiers: string[]; key: string; func: () => unknown }> }> };
    expect(keymap.scopes).toHaveLength(0);

    fireEvent.focusIn(panel);
    const undo = keymap.scopes[0]!.keys.find((handler) => handler.key === 'z' && handler.modifiers.join() === 'Mod')!;
    let handled: unknown;
    act(() => { handled = undo.func(); });
    expect(handled).toBe(false);
    expect(harness.writer.undo).toHaveBeenCalledWith(WARDEN);
    expect(panel.querySelector('.atlas-sb-pane-live')?.textContent).toBe('Undid in Marsh Warden.');

    await waitFor(() => expect(panel.querySelector('[data-block-id="header-hp"]')).not.toBeNull());
    fireEvent.click(panel.querySelector('[data-block-id="header-hp"]')!);
    within(panel).getByRole('textbox', { name: 'Hit Points' }).focus();
    harness.writer.undo.mockClear();
    expect(undo.func()).toBe(true);
    expect(harness.writer.undo).not.toHaveBeenCalled();

    // A menu the panel opened is still the panel's: its scope stays while focus is in it.
    const surface = panel.querySelector('[data-atlas-surface]')!.getAttribute('data-atlas-surface')!;
    const menu = document.body.appendChild(document.createElement('div'));
    menu.setAttribute('data-atlas-owner', surface);
    fireEvent.focusIn(menu);
    expect(keymap.scopes).toHaveLength(1);
    menu.remove();

    fireEvent.focusIn(view.contentEl.firstElementChild!);
    expect(keymap.scopes).toHaveLength(0);
  });

  it('resizes from its edge, remembers the width on the device, and takes the default again on a double click', async () => {
    const harness = await setup();
    const view = harness.open(WARDEN);
    Object.defineProperty(view.contentEl, 'clientWidth', { value: 1200, configurable: true });
    await start(harness);
    const panel = panelOf(view)!;
    // Half of the view, as nobody chose a width.
    expect(panel.style.getPropertyValue('--atlas-sb-panel-width')).toBe('600px');

    const handle = within(panel).getByRole('separator', { name: 'Statblock width' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true });
    expect(panel.style.getPropertyValue('--atlas-sb-panel-width')).toBe('680px');
    expect(handle.getAttribute('aria-valuenow')).toBe('680');
    expect(loadPanelPrefs(harness.app).width).toBe(680);

    await act(async () => { fireEvent.doubleClick(handle); });
    expect(loadPanelPrefs(harness.app).width).toBeNull();
    expect(panel.style.getPropertyValue('--atlas-sb-panel-width')).toBe('600px');
    expect(handle.getAttribute('aria-valuenow')).toBe('600');
  });

  it('chooses no width when the edge is only clicked', async () => {
    const harness = await setup();
    const view = harness.open(WARDEN);
    Object.defineProperty(view.contentEl, 'clientWidth', { value: 1200, configurable: true });
    await start(harness);
    const handle = within(panelOf(view)!).getByRole('separator', { name: 'Statblock width' });
    // jsdom has no PointerEvent: a mouse event carrying a pointer id stands in.
    const pointer = (type: string): MouseEvent => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 600 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      return event;
    };
    await act(async () => {
      handle.dispatchEvent(pointer('pointerdown'));
      window.dispatchEvent(pointer('pointerup'));
    });
    expect(loadPanelPrefs(harness.app).width).toBeNull();
  });

  it('gives the room a readable line leaves empty to the statblock', async () => {
    const harness = await setup();
    const view = harness.open(WARDEN);
    Object.defineProperty(view.contentEl, 'clientWidth', { value: 1600, configurable: true });
    const source = view.contentEl.querySelector<HTMLElement>('.markdown-source-view')!;
    source.addClass('is-readable-line-width');
    source.style.setProperty('--file-line-width', '700px');
    source.style.setProperty('--file-margins', '32px');
    await start(harness);
    // 1600 - (700 + 2 × 32): more than half the view.
    expect(panelOf(view)!.style.getPropertyValue('--atlas-sb-panel-width')).toBe('836px');

    // Switching readable line width off gives the note back its half.
    await act(async () => {
      source.removeClass('is-readable-line-width');
      await Promise.resolve();
    });
    expect(panelOf(view)!.style.getPropertyValue('--atlas-sb-panel-width')).toBe('800px');
  });

  it('stands above the note in a narrow view', async () => {
    const harness = await setup();
    const view = harness.open(WARDEN);
    Object.defineProperty(view.contentEl, 'clientWidth', { value: 600, configurable: true });
    await start(harness);
    expect(view.containerEl.classList.contains('atlas-sb-note--stacked')).toBe(true);
    expect(within(panelOf(view)!).queryByRole('separator')).toBeNull();
  });
});

describe('the panel\'s width', () => {
  it('keeps the panel and the note their minimum widths', () => {
    expect(clampPanelWidth(100, 1200)).toBe(MIN_PANEL_WIDTH);
    expect(clampPanelWidth(1000, 1200)).toBe(1200 - NOTE_MIN_WIDTH);
    expect(clampPanelWidth(500, 500)).toBe(MIN_PANEL_WIDTH);
  });

  it('reads what this version did not store as the defaults', () => {
    const { app } = createInMemoryApp();
    expect(loadPanelPrefs(app)).toEqual({ width: null });
    // A statblock hidden by an earlier build shows: there is nothing that hides it any more.
    app.saveLocalStorage('atlas-vtt-statblock-panel', { chosenWidth: 'wide', hidden: true });
    expect(loadPanelPrefs(app)).toEqual({ width: null });
    // Earlier builds stored their default as `width` whether or not anybody dragged.
    app.saveLocalStorage('atlas-vtt-statblock-panel', { width: 440 });
    expect(loadPanelPrefs(app)).toEqual({ width: null });
  });

  it('starts at half the view or what a readable line leaves, within its bounds', () => {
    expect(defaultPanelWidth({ available: 1200, readableLine: null })).toBe(600);
    expect(defaultPanelWidth({ available: 1200, readableLine: 764 })).toBe(600);
    expect(defaultPanelWidth({ available: 1600, readableLine: 764 })).toBe(836);
    expect(defaultPanelWidth({ available: 1900, readableLine: 764 })).toBe(DEFAULT_MAX_WIDTH);
    expect(defaultPanelWidth({ available: 2560, readableLine: null })).toBe(DEFAULT_MAX_WIDTH);
    expect(defaultPanelWidth({ available: 700, readableLine: null })).toBe(MIN_PANEL_WIDTH);
  });

  it('lets a chosen width win over the default, clamped to the room', () => {
    expect(panelWidth({ width: 500 }, { available: 1900, readableLine: 764 })).toBe(500);
    expect(panelWidth({ width: 5000 }, { available: 1900, readableLine: 764 })).toBe(1900 - NOTE_MIN_WIDTH);
    expect(panelWidth({ width: null }, { available: 1900, readableLine: null })).toBe(950);
  });
});
