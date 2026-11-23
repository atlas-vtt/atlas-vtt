// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Viewport } from 'pixi-viewport';
import { canRunMapHotkeys } from '../../../src/app/keyboard/mapHotkeys';
import { SettingsService } from '../../../src/app/services/SettingsService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { TABLE_BODY_CLASS, TABLE_PATH_CLASS, TABLE_VIEW_CLASS, TableMode } from '../../../src/app/tableMode/TableMode';
import { CHIP_HOLD_MS } from '../../../src/app/tableMode/holdToLeave';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

vi.mock('../../../src/app/tableMode/table-mode.scss', () => ({}));

interface Scene {
  store: ViewAtlasStore;
  root: HTMLElement;
  table: TableMode;
  camera: { x: number; y: number; scale: number };
  events: string[];
  /** Another Obsidian tab comes to the front. */
  leaveLeaf: () => void;
  wake: { requests: number; released: number };
}

function scene(): Scene {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `table-mode-view-${Math.random()}`);
  store.setState({ mapLoaded: true, isMapLoading: false, mapPath: 'maps/tavern.atlasmap' });
  const root = document.body.createDiv({ cls: 'atlas-vtt-view' });
  root.createEl('canvas');
  root.createDiv({ cls: 'atlas-react-ui-container' });
  const camera = { x: 500, y: 400, scale: 1 };
  const events: string[] = [];
  const viewport = {
    get center() { return { x: camera.x, y: camera.y }; },
    scale: { get x() { return camera.scale; } },
    setZoom: (scale: number) => { camera.scale = scale; },
    moveCenter: (x: number, y: number) => { camera.x = x; camera.y = y; },
    emit: (name: string) => { events.push(name); },
  } as unknown as Viewport;
  const wake = { requests: 0, released: 0 };
  Object.defineProperty(window.navigator, 'wakeLock', {
    configurable: true,
    value: { request: async () => { wake.requests++; return { release: async () => { wake.released++; } }; } },
  });
  let left: (() => void) | null = null;
  const table = new TableMode({
    app, root, store, settings: new SettingsService(app),
    viewport: () => viewport,
    overlaySources: () => null,
    onLeafLeft: (leave) => { left = leave; return () => { left = null; }; },
  });
  tables.push(table);
  return { store, root, table, camera, events, wake, leaveLeaf: () => left?.() };
}

const tables: TableMode[] = [];

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const key = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });

afterEach(() => {
  tables.splice(0).forEach((table) => table.destroy());
  document.body.empty();
  document.body.className = '';
  vi.useRealTimers();
});

describe('a map view in Table mode', () => {
  it('marks the view and the window, and puts the players\' surface with its GM chip over the map', () => {
    const { store, root } = scene();
    expect(root.querySelector('.atlas-table-surface')).toBeNull();

    store.getState().enterTableMode();

    expect(root.hasClass(TABLE_VIEW_CLASS)).toBe(true);
    expect(document.body.hasClass(TABLE_BODY_CLASS)).toBe(true);
    const surface = root.querySelector('.atlas-table-surface');
    expect(surface?.querySelector('.atlas-table-chip')?.textContent).toBe('GM');
    // What the player window shows over the map: widgets, initiative list, dice rolls, turn banner
    for (const overlay of ['#atlas-player-widgets', '.atlas-player-initiative-container', '.atlas-player-dice-rolls', '.atlas-player-turn-banner']) {
      expect(surface?.querySelector(overlay), overlay).not.toBeNull();
    }
  });

  it('marks the panes that hold the view, so only the others are hidden, and takes the marks off again', () => {
    const { store, root } = scene();
    const workspace = document.body.createDiv({ cls: 'workspace-split mod-root' });
    const split = workspace.createDiv({ cls: 'workspace-split mod-vertical' });
    const tabs = split.createDiv({ cls: 'workspace-tabs' });
    const other = split.createDiv({ cls: 'workspace-tabs' });
    tabs.createDiv({ cls: 'workspace-leaf' }).appendChild(root);

    store.getState().enterTableMode();
    expect([workspace, split, tabs, other].map((pane) => pane.hasClass(TABLE_PATH_CLASS))).toEqual([false, true, true, false]);
    store.getState().leaveTableMode();
    expect(document.querySelector(`.${TABLE_PATH_CLASS}`)).toBeNull();
  });

  it('gives the GM\'s view back whole when it ends: marks and surface gone, the camera where it was', () => {
    const { store, root, camera, events } = scene();
    store.getState().enterTableMode();
    // The table pans and zooms the map
    Object.assign(camera, { x: 1200, y: 90, scale: 3 });

    store.getState().leaveTableMode();

    expect(root.hasClass(TABLE_VIEW_CLASS)).toBe(false);
    expect(document.body.hasClass(TABLE_BODY_CLASS)).toBe(false);
    expect(root.querySelector('.atlas-table-surface')).toBeNull();
    expect(camera).toEqual({ x: 500, y: 400, scale: 1 });
    expect(events).toEqual(['zoomed', 'moved']);
  });

  it('keeps the camera the table left where the view shows another scene by then', () => {
    const { store, camera } = scene();
    store.getState().enterTableMode();
    Object.assign(camera, { x: 1200, y: 90, scale: 3 });
    store.setState({ mapPath: 'maps/dungeon.atlasmap' });
    store.getState().leaveTableMode();
    expect(camera).toEqual({ x: 1200, y: 90, scale: 3 });
  });

  it('ends when its chip is held', () => {
    vi.useFakeTimers();
    const { store, root } = scene();
    store.getState().enterTableMode();
    const chip = root.querySelector('.atlas-table-chip')!;
    chip.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), { button: 0, pointerId: 1, clientX: 30, clientY: 700 }));
    vi.advanceTimersByTime(CHIP_HOLD_MS - 1);
    expect(store.getState().tableMode).not.toBeNull();
    // Its time is up; the hold is asked once more a turn later, so that a release that waited is heard first (`LongPress`)
    vi.advanceTimersByTime(2);
    expect(store.getState().tableMode).toBeNull();
    expect(root.querySelector('.atlas-table-surface')).toBeNull();
  });

  it('ends when another Obsidian tab comes to the front, whose chrome would stay hidden', () => {
    const { store, leaveLeaf } = scene();
    store.getState().enterTableMode();
    leaveLeaf();
    expect(store.getState().tableMode).toBeNull();
    expect(document.body.hasClass(TABLE_BODY_CLASS)).toBe(false);
  });

  it('shows black while its scene is loading, and the scene again once it is whole', () => {
    const { store, root } = scene();
    store.getState().enterTableMode();
    const surface = root.querySelector('.atlas-table-surface')!;
    expect(surface.hasClass('atlas-table-surface--covered')).toBe(false);
    store.setState({ isMapLoading: true });
    expect(surface.hasClass('atlas-table-surface--covered')).toBe(true);
    store.setState({ isMapLoading: false, mapLoaded: false });
    expect(surface.hasClass('atlas-table-surface--covered')).toBe(true);
    store.setState({ mapLoaded: true });
    expect(surface.hasClass('atlas-table-surface--covered')).toBe(false);
  });

  it('keeps the screen awake while it lasts', async () => {
    const { store, wake } = scene();
    store.getState().enterTableMode();
    await settle();
    expect(wake).toEqual({ requests: 1, released: 0 });
    store.getState().leaveTableMode();
    await settle();
    expect(wake).toEqual({ requests: 1, released: 1 });
  });

  it('keeps the keyboard off the map: its shortcuts rest, and no key reaches a listener of the map', () => {
    const { store } = scene();
    const heard: string[] = [];
    const listener = (event: KeyboardEvent): void => { heard.push(event.key); };
    window.addEventListener('keydown', listener);
    document.body.dispatchEvent(key({ key: 'f' }));

    store.getState().enterTableMode();
    document.body.dispatchEvent(key({ key: 'Delete' }));
    expect(canRunMapHotkeys(key({ key: 'f' }))).toBe(false);
    // What Obsidian opens over the table still takes its keys
    const prompt = document.body.createDiv({ cls: 'prompt' }).createEl('input');
    prompt.dispatchEvent(key({ key: 'a' }));
    prompt.remove();

    store.getState().leaveTableMode();
    document.body.dispatchEvent(key({ key: 'z' }));
    window.removeEventListener('keydown', listener);
    expect(heard).toEqual(['f', 'a', 'z']);
  });

  it('leaves nothing behind when its view closes in Table mode', () => {
    const { store, root, table } = scene();
    store.getState().enterTableMode();
    table.destroy();
    expect(document.body.hasClass(TABLE_BODY_CLASS)).toBe(false);
    expect(root.querySelector('.atlas-table-surface')).toBeNull();
    // Nothing follows the store any more
    store.getState().leaveTableMode();
    store.getState().enterTableMode();
    expect(root.querySelector('.atlas-table-surface')).toBeNull();
  });
});
