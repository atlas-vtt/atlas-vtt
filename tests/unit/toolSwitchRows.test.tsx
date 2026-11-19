// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import type { Tool } from '../../src/app/packages/components/toolbar/toolFaces';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { GridState } from '../../src/app/types/gridTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/react/root/AtlasUIContext', () => ({ useAtlasUI: () => ({ view: null }) }));
vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({
  useHotkeyLabels: () => (id: string) => `key:${id}`,
  useAtlasSettings: () => undefined,
}));

import { MoveToolGroup } from '../../src/app/packages/components/toolbar/MoveToolGroup';
import { PinToolGroup } from '../../src/app/packages/components/toolbar/PinToolGroup';

afterEach(cleanup);

function mount(Group: typeof PinToolGroup, activeTool: Tool, grid: Partial<GridState> = {}): ViewAtlasStore {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `switch-rows-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setGrid({ ...store.getState().grid, ...grid } as GridState);
  render(
    <TooltipProvider>
      <ViewStoreProvider store={store}>
        <Group activeTool={activeTool} selectTool={vi.fn()} menuOpen toggleMenu={vi.fn()} closeMenu={vi.fn()} />
      </ViewStoreProvider>
    </TooltipProvider>,
  );
  return store;
}

const toggle = (name: string): HTMLElement => screen.getByRole('switch', { name });
const press = (name: string): void => { fireEvent.keyDown(toggle(name), { key: ' ' }); };

describe('the pin tool\'s switch for what Shift does', () => {
  it('is Link to hex on a hex grid, off until asked for', () => {
    const store = mount(PinToolGroup, 'note-pin', { type: 'hex-vertical', size: 70, enabled: true });
    expect(toggle('Link to hex').getAttribute('aria-checked')).toBe('false');
    press('Link to hex');
    expect(store.getState().toolSwitches.pinCell).toBe(true);
    expect(toggle('Link to hex').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('switch', { name: 'Snap' })).toBeNull();
  });

  it('is Snap on a square grid, the same switch: the pin goes to its square\'s centre', () => {
    const store = mount(PinToolGroup, 'note-pin', { type: 'square', size: 70, enabled: true });
    press('Snap');
    expect(store.getState().toolSwitches.pinCell).toBe(true);
    expect(screen.queryByRole('switch', { name: 'Link to hex' })).toBeNull();
  });

  it('stays in its place, disabled, on a map without a grid', () => {
    const store = mount(PinToolGroup, 'note-pin', { enabled: false });
    expect(toggle('Snap').getAttribute('aria-disabled')).toBe('true');
    press('Snap');
    expect(store.getState().toolSwitches.pinCell).toBe(false);
  });

  it('is the stairs\' own Snap while the stairs tool is in hand', () => {
    const store = mount(PinToolGroup, 'stairs', { type: 'hex-vertical', size: 70, enabled: true });
    expect(toggle('Snap').getAttribute('aria-checked')).toBe('true');
    press('Snap');
    expect(store.getState().toolSwitches).toMatchObject({ stairsSnap: false, pinCell: false });
  });
});

describe('the select tool\'s Snap switch', () => {
  it('is on, and switches off what lands tokens on the grid and turns them in steps', () => {
    const store = mount(MoveToolGroup, 'move');
    expect(toggle('Snap').getAttribute('aria-checked')).toBe('true');
    press('Snap');
    expect(store.getState().toolSwitches.selectSnap).toBe(false);
    act(() => { store.getState().setToolSwitch('selectSnap', true); });
    expect(toggle('Snap').getAttribute('aria-checked')).toBe('true');
  });
});
