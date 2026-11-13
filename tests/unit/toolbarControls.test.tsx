// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { ResponsiveToolbar } from '../../src/app/packages/components/toolbar/ResponsiveToolbar';
import { TOOLBAR_CONTROL_ITEMS } from '../../src/app/packages/components/toolbar/toolbarControls';
import type { ToolbarContext, ToolMenu } from '../../src/app/packages/components/toolbar/toolbarContext';
import type { ToolbarItemBody } from '../../src/app/packages/components/toolbar/toolbarItems';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { TOOLBAR_CONTROLS, type ToolbarControlId } from '../../src/app/toolbar/toolbarCatalog';
import { createInMemoryApp } from '../mocks/inMemoryVault';

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

function context(overrides: Partial<ToolbarContext> = {}): ToolbarContext {
  const activeTool = overrides.activeTool ?? 'move';
  return {
    activeTool,
    measureMode: 'ruler',
    drawMode: 'pen',
    selectTool: vi.fn(),
    hotkeyLabel: (id) => id,
    openMenu: null,
    groupControls: () => ({ activeTool, selectTool: vi.fn(), menuOpen: false, toggleMenu: vi.fn(), closeMenu: vi.fn() }),
    dice: { open: false, toggle: vi.fn(), tool: null, buttonRef: { current: null } },
    loot: { open: false, setOpen: vi.fn() },
    assets: { open: false, toggle: vi.fn() },
    palette: { open: false, setOpen: vi.fn() },
    ...overrides,
  };
}

const item = (id: ToolbarControlId, ctx: ToolbarContext): ToolbarItemBody => TOOLBAR_CONTROL_ITEMS[id](ctx);
const placement = ({ pinned, active }: ToolbarItemBody): { pinned: boolean; active: boolean } => ({ pinned, active });

const GROUPS: readonly ToolMenu[] = ['move', 'measure', 'wall', 'pin'];

describe('toolbar control items', () => {
  it('builds an item for every control of the catalog', () => {
    for (const { id } of TOOLBAR_CONTROLS) {
      const body = item(id, context());
      expect(body.element, id).toBeTruthy();
      expect(body.menuEntry.label, id).not.toBe('');
      expect(body.kind, id).toBe((GROUPS as readonly string[]).includes(id) ? 'group' : 'button');
    }
  });

  it('pins and activates a tool group while its tool is in use or its options are open', () => {
    expect(placement(item('wall', context()))).toEqual({ pinned: false, active: false });
    expect(placement(item('wall', context({ activeTool: 'wall' })))).toEqual({ pinned: true, active: true });
    expect(placement(item('wall', context({ openMenu: 'wall' })))).toEqual({ pinned: true, active: true });
    expect(placement(item('measure', context({ activeTool: 'measure' })))).toEqual({ pinned: true, active: true });
  });

  it('shows the fog tool as a button without a menu, by the tool in use, and selects that tool', () => {
    expect(item('fog', context())).toMatchObject({ kind: 'button', pinned: false, active: false });
    expect(item('fog', context()).menuEntry).toMatchObject({ label: 'Fog Tool', shortcut: 'fog', isActive: false });
    for (const tool of ['fog', 'eraser'] as const) {
      const ctx = context({ activeTool: tool });
      const body = item('fog', ctx);
      expect(placement(body)).toEqual({ pinned: true, active: true });
      expect(body.menuEntry).toMatchObject({ label: tool === 'eraser' ? 'Fog Eraser' : 'Fog Tool', isActive: true });
      body.menuEntry.onSelect();
      expect(ctx.selectTool).toHaveBeenCalledWith(tool);
    }
  });

  it('shows the measure tool by the mode it measures in, whichever tool is in use, and selects the one tool', () => {
    expect(item('measure', context()).menuEntry.label).toBe('Ruler');
    expect(item('measure', context({ measureMode: 'cone' })).menuEntry).toMatchObject({ label: 'Cone', isActive: false });
    const ctx = context({ activeTool: 'measure', measureMode: 'circle' });
    const { menuEntry } = item('measure', ctx);
    expect(menuEntry).toMatchObject({ label: 'Circle', isActive: true });
    menuEntry.onSelect();
    expect(ctx.selectTool).toHaveBeenCalledWith('measure');
    // Ranges, which measures nothing by a press, shows by its own name too.
    expect(item('measure', context({ measureMode: 'ranges' })).menuEntry.label).toBe('Ranges');
  });

  it('shows the Draw tool by the mode it draws in, as a button without a menu that selects the one tool', () => {
    expect(item('draw', context())).toMatchObject({ kind: 'button', pinned: false, active: false });
    expect(item('draw', context()).menuEntry).toMatchObject({ label: 'Pen', shortcut: 'draw', isActive: false });
    expect(item('draw', context({ drawMode: 'text' })).menuEntry.label).toBe('Text');
    const ctx = context({ activeTool: 'draw', drawMode: 'eraser' });
    const body = item('draw', ctx);
    expect(placement(body)).toEqual({ pinned: true, active: true });
    expect(body.menuEntry).toMatchObject({ label: 'Eraser', isActive: true });
    body.menuEntry.onSelect();
    expect(ctx.selectTool).toHaveBeenCalledWith('draw');
    // A mode the bar does not offer shows as the pen.
    expect(item('draw', context({ drawMode: 'cells' })).menuEntry.label).toBe('Pen');
  });

  it('pins and activates the note pin while it is in use, and the dice while their tray is open', () => {
    expect(placement(item('pin', context()))).toEqual({ pinned: false, active: false });
    expect(placement(item('pin', context({ activeTool: 'note-pin' })))).toEqual({ pinned: true, active: true });
    expect(placement(item('pin', context({ activeTool: 'stairs' })))).toEqual({ pinned: true, active: true });
    expect(placement(item('dice', context({ dice: { open: true, toggle: vi.fn(), tool: null, buttonRef: { current: null } } }))))
      .toEqual({ pinned: true, active: true });
  });

  it('activates the loot roller and the asset manager while open without pinning them', () => {
    expect(placement(item('loot', context({ loot: { open: true, setOpen: vi.fn() } })))).toEqual({ pinned: false, active: true });
    expect(placement(item('assets', context({ assets: { open: true, toggle: vi.fn() } })))).toEqual({ pinned: false, active: true });
  });

  it('always pins the Command palette', () => {
    expect(placement(item('palette', context()))).toEqual({ pinned: true, active: false });
    expect(placement(item('palette', context({ palette: { open: true, setOpen: vi.fn() } })))).toEqual({ pinned: true, active: true });
  });

  it('keeps a hidden control mounted, so what it holds is set up only once', () => {
    const emit = vi.fn();
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, `toolbar-controls-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    const view = { serviceManager: { getEventBus: () => ({ emit }) } };
    const ui = { app, view, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
    const ctx = context();
    const bar = (hidden: ReadonlySet<string>): React.ReactElement => (
      <AtlasUIContext.Provider value={ui}>
        <ViewStoreProvider store={store}>
          <TooltipProvider>
            <ResponsiveToolbar items={(['move', 'fog'] as const).map((id) => ({ id, ...item(id, ctx) }))} hiddenIds={hidden} />
          </TooltipProvider>
        </ViewStoreProvider>
      </AtlasUIContext.Provider>
    );

    const { container, rerender } = render(bar(new Set()));
    const slot = (): Element | null => container.querySelector('[data-toolbar-item="fog"]');
    const button = (): Element | null => slot()?.querySelector('button') ?? null;
    const first = button();
    expect(first).not.toBeNull();
    rerender(bar(new Set(['fog'])));
    expect(slot()?.hasAttribute('hidden')).toBe(true);
    // The same element: a control that was unmounted would come back as a new one.
    expect(button()).toBe(first);
    rerender(bar(new Set()));
    expect(slot()?.hasAttribute('hidden')).toBe(false);
    expect(button()).toBe(first);
  });
});
