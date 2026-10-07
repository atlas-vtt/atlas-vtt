import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtlasApiHost } from '../../src/api/AtlasApiHost';
import { buildExtension } from '../../src/api/extension';
import {
  assetTabSlot, collectionSettingsTabSlot, dashboardSlot, paletteSlot, panelSlot, sceneTabMenuSlot, tokenMenuSlot, toolbarSlot, viewMenuSlot,
} from '../../src/app/extensions/slots';
import { isPanelOpen, panelState } from '../../src/app/extensions/panelState';
import { LANDED_CAPABILITIES } from '../../src/api/capabilities';
import { fakeApp, fakePlugin, fakeServices, fakeView, loadMap, trackerWith, type FakeView, type FakePlugin } from './apiFakes';
import type { AtlasExtension } from '../../src/api/types/api';

/** The host built as lifecycle.test.ts does, with a view tracker over `views` (none by default). */
function hostWithUi(views: FakeView[] = [], active: () => FakeView | null = () => null): { host: AtlasApiHost } {
  const { app } = fakeApp();
  const tracker = trackerWith(views, active).tracker;
  const host = new AtlasApiHost({
    app,
    capabilities: LANDED_CAPABILITIES,
    build: (scope) => buildExtension(scope, { ...fakeServices(app), views: tracker }),
  });
  return { host };
}

const slotCounts = (): Record<string, number> => ({
  toolbar: toolbarSlot.list().length,
  palette: paletteSlot.list().length,
  dashboard: dashboardSlot.list().length,
  viewMenu: viewMenuSlot.list().length,
  tokenMenu: tokenMenuSlot.list().length,
  panel: panelSlot.list().length,
});

const NONE = { toolbar: 0, palette: 0, dashboard: 0, viewMenu: 0, tokenMenu: 0, panel: 0 };

afterEach(() => {
  vi.restoreAllMocks();
  expect(slotCounts()).toEqual(NONE);
  expect(sceneTabMenuSlot.list()).toHaveLength(0);
  expect(assetTabSlot.list()).toHaveLength(0);
  expect(collectionSettingsTabSlot.list()).toHaveLength(0);
  expect(panelState.getState().open).toEqual([]);
});

describe('ui lifecycle', () => {
  it('C-ui-1: everything an extension registers is gone when it unloads', () => {
    const { host } = hostWithUi();
    const plugin = fakePlugin('ext');
    const ui = host.api.connect(plugin).ui;
    ui.addToolbarItem({ id: 't', icon: 'network', label: 'T', onClick: () => undefined });
    ui.addPaletteSection({ id: 'p', title: 'P', commands: () => [] });
    ui.addDashboardTile({ id: 'd', icon: 'users', title: 'D', description: '', onClick: () => undefined });
    ui.addViewMenuItems(() => []);
    ui.addTokenMenuItems(() => []);
    const panel = ui.addPanel({ id: 'panel', title: 'Panel', mount: () => () => undefined });
    expect(slotCounts()).toEqual({ toolbar: 1, palette: 1, dashboard: 1, viewMenu: 1, tokenMenu: 1, panel: 1 });
    plugin.unload();
    expect(slotCounts()).toEqual(NONE);
    expect(() => panel.dispose()).not.toThrow();
  });

  it('C-tabmenu-1: a scene tab menu section is read again after invalidate and removed when the extension unloads', () => {
    const { host } = hostWithUi();
    const plugin = fakePlugin('ext');
    const ui = host.api.connect(plugin).ui;
    let on = false;
    ui.addSceneTabMenuSection!({ heading: ' Present to ', items: () => [{ label: 'Anna', checked: on }] });
    const [entry] = sceneTabMenuSlot.list();
    expect(entry).toMatchObject({ owner: 'ext', item: { heading: 'Present to' } });
    const reads = vi.fn();
    const stop = sceneTabMenuSlot.subscribe(reads);
    on = true;
    ui.invalidate();
    expect(reads).toHaveBeenCalledTimes(1);
    expect(entry!.item.items({} as never)).toEqual([{ label: 'Anna', checked: true }]);
    stop();
    plugin.unload();
    expect(sceneTabMenuSlot.list()).toHaveLength(0);
  });

  it('C-ui-2: Atlas unloading removes every extension slot', () => {
    const { host } = hostWithUi();
    host.api.connect(fakePlugin('a')).ui.addToolbarItem({ id: 't', icon: 'x', label: 'T', onClick: () => undefined });
    host.dispose();
    expect(slotCounts().toolbar).toBe(0);
  });

  it('C-ui-3: invalidate bumps every slot version', () => {
    const before = toolbarSlot.version();
    const plugin = fakePlugin('a');
    hostWithUi().host.api.connect(plugin).ui.invalidate();
    expect(toolbarSlot.version()).toBeGreaterThan(before);
    plugin.unload();
  });

  it('connecting again with the same id removes what the first connection registered', () => {
    const { host } = hostWithUi();
    const plugin = fakePlugin('ext');
    host.api.connect(plugin).ui.addToolbarItem({ id: 't', icon: 'x', label: 'T', onClick: () => undefined });
    const second = host.api.connect(plugin).ui;
    expect(slotCounts().toolbar).toBe(0);
    expect(() => second.addToolbarItem({ id: 't', icon: 'x', label: 'T', onClick: () => undefined })).not.toThrow();
    plugin.unload();
  });

  it('the capability is announced', () => {
    expect(hostWithUi().host.api.has('ui')).toBe(true);
  });
});

describe('ui registration', () => {
  function connected(): { ui: AtlasExtension['ui']; plugin: FakePlugin } {
    const plugin = fakePlugin('ext');
    return { ui: hostWithUi().host.api.connect(plugin).ui, plugin };
  }

  it('removes one registration with its disposer, however often it is called', () => {
    const { ui, plugin } = connected();
    const remove = ui.addToolbarItem({ id: 't', icon: 'x', label: 'T', onClick: () => undefined });
    ui.addDashboardTile({ id: 'd', icon: 'x', title: 'D', description: '', onClick: () => undefined });
    remove();
    remove();
    expect(slotCounts()).toMatchObject({ toolbar: 0, dashboard: 1 });
    plugin.unload();
  });

  it('refuses a malformed registration with an error naming the call and the field', () => {
    const { ui, plugin } = connected();
    expect(() => ui.addToolbarItem(undefined as never)).toThrow(/addToolbarItem needs an object/);
    expect(() => ui.addToolbarItem({ id: '', icon: 'x', label: 'T', onClick: () => undefined })).toThrow(/"id" must be a non-empty string/);
    expect(() => ui.addToolbarItem({ id: 't', icon: 'x', label: 'T' } as never)).toThrow(/"onClick" must be a function/);
    expect(() => ui.addToolbarItem({ id: 't', icon: 'x', label: 'T', onClick: () => undefined, priority: Number.NaN })).toThrow(/"priority" must be a number/);
    expect(() => ui.addToolbarItem({ id: 't', icon: 'x', label: 'T', onClick: () => undefined, isVisible: true as never })).toThrow(/"isVisible" must be a function/);
    expect(() => ui.addPaletteSection({ id: 'p', title: 'P' } as never)).toThrow(/"commands" must be a function/);
    expect(() => ui.addDashboardTile({ id: 'd', icon: 'x', title: 'D', onClick: () => undefined } as never)).toThrow(/"description" must be a string/);
    expect(() => ui.addViewMenuItems('x' as never)).toThrow(/needs a function/);
    expect(() => ui.addTokenMenuItems(undefined as never)).toThrow(/needs a function/);
    expect(() => ui.addPanel({ id: 'p', title: 'P' } as never)).toThrow(/"mount" must be a function/);
    expect(slotCounts()).toEqual(NONE);
    plugin.unload();
  });

  it('refuses a second item with the same id from one extension, but not from another', () => {
    const { host } = hostWithUi();
    const first = fakePlugin('a');
    const second = fakePlugin('b');
    const item = { id: 't', icon: 'x', label: 'T', onClick: () => undefined };
    host.api.connect(first).ui.addToolbarItem(item);
    expect(() => host.api.connect(second).ui.addToolbarItem(item)).not.toThrow();
    const again = host.api.connect(first);
    again.ui.addPanel({ id: 'p', title: 'P', mount: () => () => undefined });
    expect(() => again.ui.addPanel({ id: 'p', title: 'P', mount: () => () => undefined })).toThrow(/already registered/);
    first.unload();
    second.unload();
  });

  it('keeps its own copy of what it was given, frozen', () => {
    const { ui, plugin } = connected();
    const item = { id: 't', icon: 'x', label: 'T', onClick: () => undefined };
    ui.addToolbarItem(item);
    item.label = 'Changed';
    const registered = toolbarSlot.list()[0]?.item;
    expect(registered?.label).toBe('T');
    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(ui)).toBe(true);
    plugin.unload();
  });
});

describe('ui items an extension builds its own way', () => {
  it('keeps the methods of a class instance and their this, and reads each field once', () => {
    const plugin = fakePlugin('ext');
    const ui = hostWithUi().host.api.connect(plugin).ui;
    const ctx = { viewId: 'v1', kind: 'map' as const, isPlayerView: false };
    class Button {
      readonly id = 't';
      readonly icon = 'x';
      readonly label = 'T';
      clicks = 0;
      onClick(): void { this.clicks++; }
      isActive(): boolean { return this.clicks > 0; }
    }
    const button = new Button();
    ui.addToolbarItem(button);
    const registered = toolbarSlot.list()[0]!.item;
    registered.onClick(ctx);
    expect(button.clicks).toBe(1);
    expect(registered.isActive?.(ctx)).toBe(true);
    let reads = 0;
    const tile = { id: 'd', icon: 'x', description: '', onClick: (): void => undefined, get title(): string { reads++; return reads === 1 ? 'Tile' : ''; } };
    ui.addDashboardTile(tile);
    expect(reads).toBe(1);
    expect(dashboardSlot.list()[0]!.item.title).toBe('Tile');
    const section = { id: 'p', title: 'P', items: [{ id: 'c', icon: 'x', label: 'C', run: (): void => undefined }], commands(): typeof this.items { return this.items; } };
    ui.addPaletteSection(section);
    expect(paletteSlot.list()[0]!.item.commands(ctx)).toHaveLength(1);
    plugin.unload();
  });
});

describe('ui panels', () => {
  function withView(): { ui: AtlasExtension['ui']; plugin: FakePlugin; view: FakeView } {
    const view = fakeView('v1');
    loadMap(view);
    const plugin = fakePlugin('ext');
    const ui = hostWithUi([view], () => view).host.api.connect(plugin).ui;
    return { ui, plugin, view };
  }

  it('opens, toggles and closes in the active map view, or in the view named', () => {
    const { ui, plugin } = withView();
    const handle = ui.addPanel({ id: 'p', title: 'P', mount: () => () => undefined });
    expect(handle.isOpen()).toBe(false);
    handle.open();
    expect(handle.isOpen()).toBe(true);
    expect(handle.isOpen('v1')).toBe(true);
    handle.toggle();
    expect(handle.isOpen()).toBe(false);
    handle.toggle('v1');
    expect(handle.isOpen('v1')).toBe(true);
    handle.close();
    expect(handle.isOpen()).toBe(false);
    handle.open('v1');
    expect(handle.isOpen()).toBe(true);
    plugin.unload();
  });

  it('close() closes the panel in every view, and close(viewId) only in that view', () => {
    const v1 = fakeView('v1');
    const v2 = fakeView('v2');
    loadMap(v1);
    loadMap(v2);
    const plugin = fakePlugin('ext');
    const handle = hostWithUi([v1, v2], () => v1).host.api.connect(plugin).ui.addPanel({ id: 'p', title: 'P', mount: () => () => undefined });
    handle.open('v1');
    handle.open('v2');
    handle.close('v2');
    expect(handle.isOpen('v1')).toBe(true);
    expect(handle.isOpen('v2')).toBe(false);
    handle.open('v2');
    handle.close();
    expect(handle.isOpen('v1')).toBe(false);
    expect(handle.isOpen('v2')).toBe(false);
    expect(panelState.getState().open).toEqual([]);
    plugin.unload();
  });

  it('does nothing for a view that is not open, or when no map view is active', () => {
    const view = fakeView('v1');
    loadMap(view);
    const plugin = fakePlugin('ext');
    const handle = hostWithUi([view]).host.api.connect(plugin).ui.addPanel({ id: 'p', title: 'P', mount: () => () => undefined });
    handle.open();
    handle.open('nope');
    handle.toggle('nope');
    expect(panelState.getState().open).toEqual([]);
    expect(handle.isOpen('v1')).toBe(false);
    plugin.unload();
  });

  it('dispose closes the panel everywhere and makes the handle inert', () => {
    const { ui, plugin } = withView();
    const handle = ui.addPanel({ id: 'p', title: 'P', mount: () => () => undefined });
    handle.open();
    const panel = panelSlot.list()[0]?.item;
    expect(panel && isPanelOpen(panel, 'v1')).toBe(true);
    handle.dispose();
    expect(slotCounts().panel).toBe(0);
    expect(panelState.getState().open).toEqual([]);
    handle.open();
    expect(handle.isOpen()).toBe(false);
    expect(panelState.getState().open).toEqual([]);
    expect(Object.isFrozen(handle)).toBe(true);
    plugin.unload();
  });

  it('unloading the extension closes its open panels', () => {
    const { ui, plugin } = withView();
    ui.addPanel({ id: 'p', title: 'P', mount: () => () => undefined }).open();
    expect(panelState.getState().open).toHaveLength(1);
    plugin.unload();
    expect(panelState.getState().open).toEqual([]);
  });
});
