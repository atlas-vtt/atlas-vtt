import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { presentTabInPlayerWindow } = vi.hoisted(() => ({ presentTabInPlayerWindow: vi.fn(() => Promise.resolve()) }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentTabInPlayerWindow }));
vi.mock('../../src/app/services/presentToPlayers', () => ({ presentTabToPlayers: vi.fn(() => Promise.resolve()) }));

import { LANDED_CAPABILITIES } from '../../src/api/capabilities';
import { DisposerSet } from '../../src/api/disposers';
import { ApiEvents } from '../../src/api/events';
import { uiApi } from '../../src/api/ui';
import type { MenuItem, SceneTabMenuContext, SceneTabMenuSection, UiApi } from '../../src/api/types/ui';
import { sceneTabMenuSlot } from '../../src/app/extensions/slots';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SceneTabBar } from '../../src/app/react/components/SceneTabBar';
import { ContextMenuProvider } from '../../src/app/react/root/ContextMenuContext';
import { openSceneTabMenu } from '../../src/app/react/tabPresenting';
import { presentedScene } from '../../src/app/services/PresentedScene';
import { addPresentationTarget } from '../../src/app/services/presentationTargets';
import { createTabMetaStore, type TabMetaStore } from '../../src/app/stores/tabMetaStore';

interface MenuView { viewId: string; tabMetaStore: TabMetaStore }

const app = {} as never;
let disposers: DisposerSet;
let ui: UiApi;

function uiFor(capabilities = LANDED_CAPABILITIES): UiApi {
  return uiApi({ id: 'ext', disposers, events: new ApiEvents(), capabilities: new Set(capabilities) }, {} as never);
}

function mapView(): { view: MenuView; tavern: string; cellar: string } {
  const tabMetaStore = createTabMetaStore();
  const tavern = tabMetaStore.getState().addTab('maps/Tavern.atlasmap', 'Tavern');
  const cellar = tabMetaStore.getState().addTab('maps/Cellar.atlasmap', 'Cellar');
  tabMetaStore.getState().setActiveTab(tavern);
  return { view: { viewId: 'view-1', tabMetaStore }, tavern, cellar };
}

function open(view: MenuView, tabId: string): boolean {
  let opened = false;
  act(() => { opened = openSceneTabMenu(app, view as never, tabId, { x: 10, y: 20 }); });
  return opened;
}

const menu = (): HTMLElement | null => document.body.querySelector('.atlas-ctx-menu');

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  disposers = new DisposerSet();
  ui = uiFor();
  render(<ContextMenuProvider><div>Map</div></ContextMenuProvider>);
});

afterEach(() => {
  cleanup();
  disposers.disposeAll();
  presentedScene.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(sceneTabMenuSlot.list()).toHaveLength(0);
});

describe('the scene tab eye menu', () => {
  it('opens with an extension section while no target is active', async () => {
    const { view, cellar } = mapView();
    ui.addSceneTabMenuSection!({ heading: 'Present to', items: () => [{ label: 'Anna', checked: false, keepOpen: true }] });
    expect(open(view, cellar)).toBe(true);
    await waitFor(() => expect(menu()).not.toBeNull());
    expect(screen.getByText('Present to')).toBeTruthy();
    expect(screen.getByRole('menuitemcheckbox', { name: 'Anna' })).toBeTruthy();
    // No Atlas entry above it, so no separator at the top.
    expect(menu()!.querySelector('[role="separator"]')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Open player window' })).toBeNull();
  });

  it('does not open with nothing to show', () => {
    const { view, cellar } = mapView();
    ui.addSceneTabMenuSection!({ heading: 'Present to', items: () => [] });
    expect(open(view, cellar)).toBe(false);
    expect(menu()).toBeNull();
  });

  it('puts Atlas\'s own entry first while a target is active, then a separator and the section', async () => {
    const stop = addPresentationTarget({ id: 't', label: 'the second screen', isActive: () => true });
    const { view, cellar } = mapView();
    ui.addSceneTabMenuSection!({ heading: 'Present to', items: () => [{ label: 'Anna' }] });
    expect(open(view, cellar)).toBe(true);
    await waitFor(() => expect(menu()).not.toBeNull());
    const rows = [...menu()!.children].map((row) => (row.getAttribute('role') === 'menuitem' ? `item:${row.textContent}` : row.getAttribute('role') ?? `text:${row.textContent}`));
    expect(rows).toEqual(['item:Open player window', 'separator', 'text:Present to', 'item:Anna']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open player window' }));
    expect(presentTabInPlayerWindow).toHaveBeenCalledWith(app, view, cellar);
    stop();
  });

  it('checkmarks follow invalidate in the top-level menu (C-tabmenu-1)', async () => {
    const { view, cellar } = mapView();
    let on = false;
    ui.addSceneTabMenuSection!({ heading: 'Present to', items: () => [{ label: 'Anna', checked: on, keepOpen: true, onClick: () => { on = !on; ui.invalidate(); } }] });
    open(view, cellar);
    await waitFor(() => expect(menu()).not.toBeNull());
    act(() => { fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Anna' })); });
    expect(screen.getByRole('menuitemcheckbox', { name: 'Anna' }).getAttribute('aria-checked')).toBe('true');
    act(() => { fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Anna' })); });
    expect(screen.getByRole('menuitemcheckbox', { name: 'Anna' }).getAttribute('aria-checked')).toBe('false');
  });

  it('arrow keys still move after a rebuild', async () => {
    const { view, cellar } = mapView();
    const ticked = new Set<string>();
    const row = (name: string): MenuItem => ({ label: name, checked: ticked.has(name), keepOpen: true, onClick: () => { ticked.add(name); ui.invalidate(); } });
    ui.addSceneTabMenuSection!({ heading: 'Present to', items: () => [row('Anna'), row('Ben')] });
    open(view, cellar);
    await waitFor(() => expect(menu()).not.toBeNull());
    const anna = screen.getByRole('menuitemcheckbox', { name: 'Anna' });
    act(() => { anna.focus(); fireEvent.click(anna); });
    // The rows are the same elements after the rebuild, so focus stays and the arrow moves on.
    expect(screen.getByRole('menuitemcheckbox', { name: 'Anna' })).toBe(anna);
    expect(document.activeElement).toBe(anna);
    act(() => { fireEvent.keyDown(anna, { key: 'ArrowDown' }); });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('menuitemcheckbox', { name: 'Ben' })));
  });

  it('stays open while its tab becomes active', async () => {
    const { view, cellar } = mapView();
    const contexts: SceneTabMenuContext[] = [];
    ui.addSceneTabMenuSection!({
      heading: 'Present to',
      items: (ctx) => {
        contexts.push(ctx);
        return [{ label: 'Anna', checked: false, keepOpen: true, onClick: () => { view.tabMetaStore.getState().setActiveTab(cellar); } }];
      },
    });
    open(view, cellar);
    await waitFor(() => expect(menu()).not.toBeNull());
    expect(contexts.at(-1)!.active).toBe(false);
    act(() => { fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Anna' })); });
    expect(menu()).not.toBeNull();
    expect(contexts.at(-1)!.active).toBe(true);
  });

  it('closes once a rebuild leaves nothing to show, as when its tab closes', async () => {
    const { view, cellar } = mapView();
    ui.addSceneTabMenuSection!({ heading: 'Present to', items: () => [{ label: 'Anna' }] });
    open(view, cellar);
    await waitFor(() => expect(menu()).not.toBeNull());
    act(() => { view.tabMetaStore.getState().removeTab(cellar); });
    await waitFor(() => expect(menu()).toBeNull());
  });

  it('leaves a throwing section out and logs once', async () => {
    const { view, cellar } = mapView();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    ui.addSceneTabMenuSection!({ heading: 'Broken', items: () => { throw new Error('boom'); } });
    ui.addSceneTabMenuSection!({ heading: 'Present to', items: () => [{ label: 'Anna' }] });
    expect(open(view, cellar)).toBe(true);
    await waitFor(() => expect(menu()).not.toBeNull());
    act(() => { ui.invalidate(); });
    act(() => { ui.invalidate(); });
    expect(screen.queryByText('Broken')).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Anna' })).toBeTruthy();
    const logged = error.mock.calls.filter(([message]) => String(message).startsWith('[Atlas API] ui.addSceneTabMenuSection:'));
    expect(logged).toHaveLength(1);
  });

  it('passes name, mapPath, active and presented for the right-clicked tab, frozen', () => {
    const { view, tavern, cellar } = mapView();
    const items = vi.fn((): MenuItem[] => []);
    ui.addSceneTabMenuSection!({ heading: 'Present to', items });
    const tracked = { ...view, atlasStore: { getState: () => ({}), subscribe: () => () => undefined }, register: () => undefined };
    presentedScene.present(tracked as never, tavern);
    open(view, cellar);
    open(view, tavern);
    const [cellarCtx, tavernCtx] = items.mock.calls.map(([ctx]) => ctx as SceneTabMenuContext);
    expect(cellarCtx).toEqual({ viewId: 'view-1', tabId: cellar, mapPath: 'maps/Cellar.atlasmap', name: 'Cellar', active: false, presented: false });
    expect(tavernCtx).toEqual({ viewId: 'view-1', tabId: tavern, mapPath: 'maps/Tavern.atlasmap', name: 'Tavern', active: true, presented: true });
    expect(Object.isFrozen(cellarCtx)).toBe(true);
  });
});

describe('ui.addSceneTabMenuSection', () => {
  it('trims the heading and cuts it at 40 characters', async () => {
    const { view, cellar } = mapView();
    ui.addSceneTabMenuSection!({ heading: `  ${'x'.repeat(50)}  `, items: () => [{ label: 'Anna' }] });
    open(view, cellar);
    await waitFor(() => expect(menu()).not.toBeNull());
    expect(screen.getByText('x'.repeat(40))).toBeTruthy();
  });

  it('throws for an empty heading or items that is not a function, and registers nothing', () => {
    expect(() => ui.addSceneTabMenuSection!({ heading: '   ', items: () => [] })).toThrow('[Atlas API] ui.addSceneTabMenuSection: "heading" must be a non-empty string.');
    expect(() => ui.addSceneTabMenuSection!({ heading: 'Present to', items: 'no' } as unknown as SceneTabMenuSection)).toThrow('[Atlas API] ui.addSceneTabMenuSection: "items" must be a function.');
    expect(sceneTabMenuSlot.list()).toHaveLength(0);
  });

  it('reads the section once and calls items on the extension\'s object; the disposer removes it', () => {
    class Section { heading = 'Present to'; label = 'Anna'; items(): MenuItem[] { return [{ label: this.label }]; } }
    const section = new Section();
    const dispose = ui.addSceneTabMenuSection!(section);
    section.heading = 'Changed';
    expect(sceneTabMenuSlot.list()[0]!.item.heading).toBe('Present to');
    expect(sceneTabMenuSlot.list()[0]!.item.items({} as never)).toEqual([{ label: 'Anna' }]);
    dispose();
    dispose();
    expect(sceneTabMenuSlot.list()).toHaveLength(0);
  });

  it('is attached only with the scene-tabs capability', () => {
    expect(typeof ui.addSceneTabMenuSection).toBe('function');
    expect(uiFor(LANDED_CAPABILITIES.filter((name) => name !== 'scene-tabs'))).not.toHaveProperty('addSceneTabMenuSection');
  });
});

describe('the eye from the keyboard', () => {
  it('opens its menu with the context-menu key and Shift+F10, below the eye, with focus to go back to', () => {
    Element.prototype.scrollIntoView = vi.fn();
    const { view, tavern } = mapView();
    const onPresentTabMenu = vi.fn((_tabId: string, _position: { x: number; y: number }, _returnFocus?: HTMLElement) => true);
    render(<AtlasUIContext.Provider value={{ app: {}, view, pixiApp: null, renderer: null } as never}>
      <SceneTabBar onSwitchTab={vi.fn()} onCloseTab={vi.fn()} onAddTab={vi.fn()} onPresentTab={vi.fn()} onPresentTabMenu={onPresentTabMenu} onShowAllTabs={vi.fn()} />
    </AtlasUIContext.Provider>);
    const eye = screen.getByRole('button', { name: 'Show Tavern on the player view' });
    expect(fireEvent.keyDown(eye, { key: 'ContextMenu' })).toBe(false);
    expect(fireEvent.keyDown(eye, { key: 'F10', shiftKey: true })).toBe(false);
    expect(fireEvent.keyDown(eye, { key: 'F10' })).toBe(true);
    expect(onPresentTabMenu).toHaveBeenCalledTimes(2);
    const rect = eye.getBoundingClientRect();
    expect(onPresentTabMenu).toHaveBeenCalledWith(tavern, { x: rect.left, y: rect.bottom }, eye);
  });
});
