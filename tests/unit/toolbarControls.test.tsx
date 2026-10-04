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

const GROUPS: readonly ToolMenu[] = ['move', 'fog', 'draw', 'text', 'measure', 'wall'];

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
    expect(placement(item('fog', context()))).toEqual({ pinned: false, active: false });
    expect(placement(item('fog', context({ activeTool: 'eraser' })))).toEqual({ pinned: true, active: true });
    expect(placement(item('fog', context({ openMenu: 'fog' })))).toEqual({ pinned: true, active: true });
    expect(placement(item('measure', context({ activeTool: 'measure-cone' })))).toEqual({ pinned: true, active: true });
  });

  it('pins and activates the note pin while it is in use, and the dice while their tray is open', () => {
    expect(placement(item('pin', context()))).toEqual({ pinned: false, active: false });
    expect(placement(item('pin', context({ activeTool: 'note-pin' })))).toEqual({ pinned: true, active: true });
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

  it('keeps a hidden tool group mounted, so its options are set up only once', () => {
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

    const { rerender } = render(bar(new Set()));
    rerender(bar(new Set(['fog'])));
    rerender(bar(new Set()));
    expect(emit.mock.calls.filter(([event]) => event === 'fog-mode-changed')).toHaveLength(1);
  });
});
