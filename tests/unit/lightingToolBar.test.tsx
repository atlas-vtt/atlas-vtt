// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const lights = vi.hoisted(() => ({ current: null as readonly unknown[] | null }));

// The bars are mounted inside the map's UI; no Obsidian app here.
vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ app: undefined, view: null }),
}));

// Without an Obsidian app the hook gives the generic presets; a test sets a game system's.
vi.mock('../../src/app/react/hooks/useMapLightPresets', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/app/react/hooks/useMapLightPresets')>();
  return { useMapLightPresets: () => lights.current ?? original.useMapLightPresets() };
});

import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { LightingToolBar } from '../../src/app/packages/components/toolbar/LightingToolBar';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// The bars' motion is measured in the browser (tests/gpu/lightingToolBar.gpu.test.ts); here a mode's tools follow at once.
beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(() => {
  cleanup();
  lights.current = null;
});

function renderBar(): ViewAtlasStore {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `lighting-bar-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ activeTool: 'wall', isMapLoading: false });
  // No tooltip provider around it: the map's bottom row has none, so the bars bring their own.
  render(<ViewStoreProvider store={store}><LightingToolBar /></ViewStoreProvider>);
  return store;
}

const modesBar = (): HTMLElement => screen.getByRole('toolbar', { name: 'Lighting modes' });
const toolsBar = (mode: string): HTMLElement => screen.getByRole('toolbar', { name: `${mode} tools` });
/** A mode's tools come once the last mode's have gone. */
const toolsOf = (mode: string): Promise<HTMLElement> => waitFor(() => toolsBar(mode));
const names = (bar: HTMLElement): string[] => within(bar).getAllByRole('button').map((item) => item.textContent ?? '');
const button = (name: string): HTMLElement => screen.getByRole('button', { name });
const pressed = (name: string): boolean => button(name).getAttribute('aria-pressed') === 'true';
const inert = (name: string): boolean => button(name).getAttribute('aria-disabled') === 'true';
const MODES = ['Draw rooms', 'Draw walls', 'Place lights', 'Light zones', 'Openings', 'Explored memory'];

describe('LightingToolBar', () => {
  it('shows while the lighting tool is chosen, and not while the toolbar is arranged or in the players\' view', async () => {
    const store = renderBar();
    const gone = (): Promise<void> => waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
    modesBar();
    act(() => store.setState({ isToolbarEditing: true }));
    await gone();
    act(() => store.setState({ isToolbarEditing: false, isPlayerView: true }));
    await gone();
    act(() => store.setState({ isPlayerView: false, activeTool: 'move' }));
    await gone();
    act(() => store.setState({ activeTool: 'wall' }));
    modesBar();
  });

  it('stays in the session view, where no button takes a choice', () => {
    const store = renderBar();
    act(() => store.setState({ isGMView: false }));
    expect(names(modesBar())).toEqual(MODES);
    expect([...MODES, 'Carve', 'Fill in', 'Rectangle'].every(inert)).toBe(true);
    // The chosen mode and tool still show as chosen.
    expect(pressed('Draw rooms')).toBe(true);
    fireEvent.click(button('Draw walls'));
    fireEvent.click(button('Fill in'));
    expect(store.getState().lightingTool.mode).toBe('rooms');
    expect(store.getState().roomTool.action).toBe('carve');
    act(() => store.setState({ isGMView: true }));
    expect(MODES.slice(0, 3).some(inert)).toBe(false);
    fireEvent.click(button('Fill in'));
    expect(store.getState().roomTool.action).toBe('fill');
  });

  it('keeps the modes in a bar of their own, the same in every mode, and the tools in another', async () => {
    const store = renderBar();
    act(() => store.getState().setSceneLighting({ enabled: true }));
    expect(names(modesBar())).toEqual(MODES);
    // The tool opens on rooms, the first of its modes; single walls come second.
    expect(store.getState().lightingTool.mode).toBe('rooms');
    expect(names(toolsBar('Draw rooms'))).toEqual(['Carve', 'Fill in', 'Door', 'Rectangle', 'Points', 'Lasso', 'Brush']);
    fireEvent.click(button('Draw walls'));
    expect(names(await toolsOf('Draw walls'))).toEqual(['Point to point', 'Freehand']);
    expect(names(modesBar())).toEqual(MODES);
    fireEvent.click(button('Explored memory'));
    expect(names(await toolsOf('Explored memory'))).toEqual(['Reveal', 'Forget', 'Brush', 'Lasso', 'Rectangle']);
    expect(names(modesBar())).toEqual(MODES);
  });

  it('chooses how walls are drawn and keeps it in the store, tinted where a mode is filled', async () => {
    const store = renderBar();
    fireEvent.click(button('Draw walls'));
    await toolsOf('Draw walls');
    expect(pressed('Draw walls')).toBe(true);
    expect(pressed('Point to point')).toBe(true);
    fireEvent.click(button('Freehand'));
    expect(store.getState().lightingTool.drawMode).toBe('freeform');
    expect(pressed('Freehand')).toBe(true);
    expect(button('Freehand').classList.contains('atlas-lighting-bar__choice')).toBe(true);
    expect(button('Draw walls').classList.contains('atlas-lighting-bar__choice')).toBe(false);
  });

  it('leaves the tools bar out for zones, where a click places a corner and there is nothing to choose', async () => {
    const store = renderBar();
    fireEvent.click(button('Light zones'));
    expect(store.getState().lightingTool.mode).toBe('light-zone');
    await waitFor(() => expect(screen.getAllByRole('toolbar')).toHaveLength(1));
  });

  it('offers memory and openings only where they can be used', () => {
    const store = renderBar();
    expect(inert('Explored memory')).toBe(true);
    expect(inert('Openings')).toBe(true);
    fireEvent.click(button('Explored memory'));
    expect(store.getState().lightingTool.mode).toBe('rooms');
    act(() => store.getState().setSceneLighting({ enabled: true }));
    expect(inert('Explored memory')).toBe(false);
  });

  it('sets the memory\'s stroke and shape, and keeps them while another mode is in use', async () => {
    const store = renderBar();
    act(() => store.getState().setSceneLighting({ enabled: true }));
    fireEvent.click(button('Explored memory'));
    await toolsOf('Explored memory');
    fireEvent.click(button('Forget'));
    fireEvent.click(button('Lasso'));
    expect(store.getState().exploredBrush).toMatchObject({ mode: 'forget', shape: 'lasso' });
    fireEvent.click(button('Draw walls'));
    await toolsOf('Draw walls');
    fireEvent.click(button('Explored memory'));
    await toolsOf('Explored memory');
    expect(pressed('Lasso')).toBe(true);
    expect(pressed('Forget')).toBe(true);
  });

  it('gives the rooms carve, fill and door, then the shapes, which a door does not use', async () => {
    const store = renderBar();
    await toolsOf('Draw rooms');
    fireEvent.click(button('Points'));
    expect(store.getState().roomTool.shape).toBe('polygon');
    fireEvent.click(button('Door'));
    for (const shape of ['Rectangle', 'Points', 'Lasso', 'Brush']) expect(inert(shape)).toBe(true);
    fireEvent.click(button('Lasso'));
    expect(store.getState().roomTool.shape).toBe('polygon');
    // Groups are set apart by space, never a line.
    expect(toolsBar('Draw rooms').querySelectorAll('.atlas-lighting-bar__break')).toHaveLength(1);
    expect(toolsBar('Draw rooms').querySelector('hr, [role="separator"]')).toBeNull();
  });

  it('gives the lights mode the lights of the map\'s collection to place, its torch chosen until another is', async () => {
    const store = renderBar();
    fireEvent.click(button('Place lights'));
    expect(names(await toolsOf('Place lights'))).toEqual(['Candle', 'Torch', 'Lantern', 'Magical light', 'Darkness']);
    expect(pressed('Torch')).toBe(true);
    fireEvent.click(button('Lantern'));
    expect(store.getState().lightingTool.lightPreset).toBe('lantern');
    expect(pressed('Lantern')).toBe(true);
    expect(pressed('Torch')).toBe(false);
  });

  it('offers a game system\'s own lights, and goes back to its torch when the chosen light is no longer one of them', async () => {
    const systems = BUILT_IN_SYSTEM_PRESETS.filter((preset) => preset.name === 'D&D 5e' || preset.name === 'Cairn');
    const dnd5e = systems.find((preset) => preset.name === 'D&D 5e')!.rules.lightPresets!;
    lights.current = dnd5e;
    const store = renderBar();
    fireEvent.click(button('Place lights'));
    expect(names(await toolsOf('Place lights'))).toEqual(dnd5e.map((preset) => preset.name));
    expect(pressed('Torch')).toBe(true);
    fireEvent.click(button('Daylight'));
    expect(store.getState().lightingTool.lightPreset).toBe('dnd5e-daylight');
    expect(pressed('Daylight')).toBe(true);
    lights.current = systems.find((preset) => preset.name === 'Cairn')!.rules.lightPresets!;
    // The collection's lights changed while another mode was in use.
    fireEvent.click(button('Light zones'));
    await waitFor(() => expect(screen.getAllByRole('toolbar')).toHaveLength(1));
    fireEvent.click(button('Place lights'));
    await toolsOf('Place lights');
    expect(screen.queryByRole('button', { name: 'Daylight' })).toBeNull();
    expect(pressed('Torch')).toBe(true);
  });
});
