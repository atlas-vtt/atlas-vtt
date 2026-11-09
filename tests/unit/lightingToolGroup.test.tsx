// @vitest-environment jsdom
import React from 'react';
import { EventEmitter } from 'events';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import type { Tool } from '../../src/app/packages/components/toolbar/toolFaces';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { LightingToolOptions } from '../../src/app/lighting/lightingTool';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const bus = vi.hoisted(() => ({ current: null as EventEmitter | null }));

vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({ view: { serviceManager: { getEventBus: () => bus.current } } }),
}));

const lights = vi.hoisted(() => ({ current: null as readonly unknown[] | null }));

// Without an Obsidian app the hook gives the generic presets; a test sets a game system's.
vi.mock('../../src/app/react/hooks/useMapLightPresets', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/app/react/hooks/useMapLightPresets')>();
  return { useMapLightPresets: () => lights.current ?? original.useMapLightPresets() };
});

vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({
  useHotkeyLabels: () => (id: string) => `key:${id}`,
  // No settings: the lighting quality section renders nothing here.
  useAtlasSettings: () => undefined,
}));

import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { LightingToolGroup } from '../../src/app/packages/components/toolbar/LightingToolGroup';

afterEach(() => {
  cleanup();
  lights.current = null;
});

interface Rendered {
  store: ViewAtlasStore;
  selectTool: ReturnType<typeof vi.fn>;
  closeMenu: ReturnType<typeof vi.fn>;
  events: [string, unknown][];
  rerender: (activeTool: Tool) => void;
}

function renderGroup(activeTool: Tool = 'move'): Rendered {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `lighting-menu-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const events: [string, unknown][] = [];
  bus.current = new EventEmitter();
  const emit = bus.current.emit.bind(bus.current);
  bus.current.emit = (event: string, ...args: unknown[]): boolean => {
    events.push([event, args[0]]);
    return emit(event, ...args);
  };
  const selectTool = vi.fn();
  const closeMenu = vi.fn();
  const ui = (tool: Tool): React.ReactElement => (
    <TooltipProvider>
      <ViewStoreProvider store={store}>
        <LightingToolGroup activeTool={tool} selectTool={selectTool} menuOpen toggleMenu={vi.fn()} closeMenu={closeMenu} />
      </ViewStoreProvider>
    </TooltipProvider>
  );
  const view = render(ui(activeTool));
  return { store, selectTool, closeMenu, events, rerender: (tool) => view.rerender(ui(tool)) };
}

/** A menu row, as the fog and draw menus build theirs. */
function row(label: string): HTMLButtonElement {
  const button = screen.getByText(label).closest('button');
  if (!button) throw new Error(`No row "${label}"`);
  expect(button.classList.contains('atlas-dropdown-menu-item')).toBe(true);
  return button;
}

function checked(label: string): boolean {
  return row(label).querySelector('.atlas-dropdown-menu-item__check svg') !== null;
}

/** Chooses the tool's mode, as the bar above the toolbar does. */
const mode = (store: ViewAtlasStore, value: LightingToolOptions['mode']): void => act(() => store.getState().setLightingTool({ mode: value }));

describe('LightingToolGroup', () => {
  it('holds no modes and no ways of drawing: those are the bar above the toolbar', () => {
    renderGroup('wall');
    for (const name of ['Walls', 'Rooms', 'Point to point', 'Freehand', 'Carve', 'Reveal']) expect(screen.queryByText(name)).toBeNull();
    row('Lighting settings…');
  });

  it('offers the light presets in the lights mode and keeps the chosen one in the store', () => {
    const { store } = renderGroup('wall');
    expect(screen.queryByText('Torch')).toBeNull();
    mode(store, 'place-light');
    for (const label of ['Candle', 'Torch', 'Lantern', 'Magical light']) row(label);
    expect(checked('Torch')).toBe(true);
    fireEvent.click(row('Lantern'));
    expect(store.getState().lightingTool.lightPreset).toBe('lantern');
    expect(checked('Lantern')).toBe(true);
    expect(checked('Torch')).toBe(false);
  });

  it('offers the light presets of the map\'s collection, its torch chosen until another is', () => {
    const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!.rules.lightPresets!;
    lights.current = dnd5e;
    const { store } = renderGroup('wall');
    mode(store, 'place-light');
    for (const preset of dnd5e) row(preset.name);
    expect(screen.queryByText('Magical light')).toBeNull();
    expect(checked('Torch')).toBe(true);
    fireEvent.click(row('Daylight'));
    expect(store.getState().lightingTool.lightPreset).toBe('dnd5e-daylight');
    expect(checked('Daylight')).toBe(true);
  });

  it('goes back to the collection\'s torch when the chosen preset is no longer one of its lights', () => {
    const systems = BUILT_IN_SYSTEM_PRESETS.filter((preset) => preset.name === 'D&D 5e' || preset.name === 'Cairn');
    lights.current = systems.find((preset) => preset.name === 'D&D 5e')!.rules.lightPresets!;
    const { store, rerender } = renderGroup('wall');
    mode(store, 'place-light');
    fireEvent.click(row('Daylight'));
    lights.current = systems.find((preset) => preset.name === 'Cairn')!.rules.lightPresets!;
    rerender('wall');
    expect(screen.queryByText('Daylight')).toBeNull();
    expect(checked('Torch')).toBe(true);
  });

  it('switches the scene\'s lighting with a named switch and has no preview of its own', () => {
    const { store, events } = renderGroup('wall');
    const toggle = screen.getByRole('switch', { name: 'Dynamic lighting' });
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(store.getState().lighting.enabled).toBe(true);
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.queryByText('Preview player view')).toBeNull();
    expect(events.some(([event]) => event === 'lighting-preview')).toBe(false);
  });

  it('keeps forgetting explored areas and the graphics settings out of the menu, behind Lighting settings', () => {
    const { store, closeMenu } = renderGroup('wall');
    act(() => store.getState().setSceneLighting({ enabled: true }));
    expect(screen.queryByText('Forget explored areas')).toBeNull();
    expect(screen.queryByText('Graphics settings…')).toBeNull();
    fireEvent.click(row('Lighting settings…'));
    expect(store.getState().isSceneLightingPanelOpen).toBe(true);
    expect(closeMenu).toHaveBeenCalledTimes(1);
  });

  it('keeps its rows when the scene\'s lighting is switched on or off: only what can be used changes', () => {
    const { store } = renderGroup('wall');
    const rows = (): string[] => [...document.querySelectorAll('.atlas-dropdown-menu-item, .atlas-dropdown-toggle-row, .atlas-segmented, .atlas-dropdown-slider-row')]
      .map((item) => `${item.className.replace(/\s*\S+--disabled/g, '')}: ${item.querySelectorAll('button, [role="switch"], [role="slider"]').length}`);
    const off = rows();
    expect(row('Lighting settings…').disabled).toBe(true);
    act(() => store.getState().setSceneLighting({ enabled: true }));
    expect(rows()).toEqual(off);
    expect(row('Lighting settings…').disabled).toBe(false);
  });

  it('sizes the memory brush, and only the brush', () => {
    const { store } = renderGroup('wall');
    act(() => store.getState().setSceneLighting({ enabled: true }));
    mode(store, 'explored-memory');
    expect(screen.getByText('50px')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Brush size' }), { key: 'ArrowRight' });
    expect(store.getState().exploredBrush.brushSize).toBe(51);
    act(() => store.getState().setExploredBrush({ shape: 'lasso' }));
    expect(screen.queryByText('Brush size')).toBeNull();
  });

  it('sizes the rooms brush, disabled while doors are placed', () => {
    const { store } = renderGroup('wall');
    mode(store, 'rooms');
    expect(screen.queryByText('Brush size')).toBeNull();
    act(() => store.getState().setRoomTool({ shape: 'brush' }));
    const slider = screen.getByRole('slider', { name: 'Brush size' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(store.getState().roomTool.brushSize).toBeGreaterThan(0);
    act(() => store.getState().setRoomTool({ action: 'door' }));
    expect(document.querySelector('.atlas-dropdown-slider-row--disabled')).not.toBeNull();
    expect(screen.queryByText('Join all rooms')).toBeNull();
  });

  it('leaves the memory mode for drawing walls when the scene stops remembering or its lighting goes off', () => {
    for (const off of [{ exploredMemory: false }, { enabled: false }]) {
      const { store } = renderGroup('wall');
      act(() => store.getState().setSceneLighting({ enabled: true }));
      mode(store, 'explored-memory');
      expect(store.getState().lightingTool.mode).toBe('explored-memory');
      act(() => store.getState().setSceneLighting(off));
      expect(store.getState().lightingTool.mode).toBe('draw');
      cleanup();
    }
  });

  it('leaves the openings mode for drawing walls in a scene of one level', () => {
    const { store } = renderGroup('wall');
    mode(store, 'level-surface');
    expect(store.getState().lightingTool.mode).toBe('draw');
  });

  it('marks all areas explored from a row offered in the memory mode alone', () => {
    const { store, closeMenu, events } = renderGroup('wall');
    act(() => store.getState().setSceneLighting({ enabled: true }));
    expect(screen.queryByText('Mark all areas explored')).toBeNull();
    mode(store, 'explored-memory');
    const rows = [...document.querySelectorAll('.atlas-dropdown-menu-item')].map((item) => item.textContent);
    expect(rows.slice(-2)).toEqual(['Mark all areas explored', 'Lighting settings…']);
    fireEvent.click(row('Mark all areas explored'));
    expect(events).toContainEqual(['lighting-reveal-explored', undefined]);
    expect(closeMenu).toHaveBeenCalledTimes(1);
  });
});
