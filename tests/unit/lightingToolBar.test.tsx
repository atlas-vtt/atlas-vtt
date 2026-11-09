// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LightingToolBar } from '../../src/app/packages/components/toolbar/LightingToolBar';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(cleanup);

function renderBar(): ViewAtlasStore {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `lighting-bar-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ activeTool: 'wall', isMapLoading: false });
  // No tooltip provider around it: the map's bottom row has none, so the bar brings its own.
  render(<ViewStoreProvider store={store}><LightingToolBar /></ViewStoreProvider>);
  return store;
}

const button = (name: string): HTMLElement => screen.getByRole('button', { name });
const pressed = (name: string): boolean => button(name).getAttribute('aria-pressed') === 'true';
const inert = (name: string): boolean => button(name).getAttribute('aria-disabled') === 'true';
const names = (): string[] => screen.getAllByRole('button').map((item) => item.textContent ?? '');

describe('LightingToolBar', () => {
  it('shows while the lighting tool is chosen in the GM\'s view, and not while the toolbar is arranged', async () => {
    const store = renderBar();
    const gone = (): Promise<void> => waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
    screen.getByRole('toolbar', { name: 'Lighting tools' });
    act(() => store.setState({ isToolbarEditing: true }));
    await gone();
    act(() => store.setState({ isToolbarEditing: false, isGMView: false }));
    await gone();
    act(() => store.setState({ isGMView: true, activeTool: 'move' }));
    await gone();
    act(() => store.setState({ activeTool: 'wall' }));
    screen.getByRole('toolbar', { name: 'Lighting tools' });
  });

  it('offers every mode, then how walls are drawn, and keeps the choice in the store', () => {
    const store = renderBar();
    expect(names()).toEqual(['Draw walls', 'Rooms', 'Place lights', 'Light zones', 'Openings', 'Explored memory', 'Point to point', 'Freehand']);
    expect(pressed('Draw walls')).toBe(true);
    expect(pressed('Point to point')).toBe(true);
    fireEvent.click(button('Freehand'));
    expect(store.getState().lightingTool.drawMode).toBe('freeform');
    expect(pressed('Freehand')).toBe(true);
    // The ways of drawing are the mode's choices: tinted, where the mode is filled like a tool.
    expect(button('Freehand').classList.contains('atlas-lighting-bar__choice')).toBe(true);
    expect(button('Draw walls').classList.contains('atlas-lighting-bar__choice')).toBe(false);
  });

  it('gives lights and zones no choices of their own: the light to place is in the menu', () => {
    const store = renderBar();
    fireEvent.click(button('Place lights'));
    expect(store.getState().lightingTool.mode).toBe('place-light');
    expect(names()).toHaveLength(6);
    fireEvent.click(button('Light zones'));
    expect(store.getState().lightingTool.mode).toBe('light-zone');
    expect(names()).toHaveLength(6);
  });

  it('offers memory and openings only where they can be used', () => {
    const store = renderBar();
    expect(inert('Explored memory')).toBe(true);
    expect(inert('Openings')).toBe(true);
    fireEvent.click(button('Explored memory'));
    expect(store.getState().lightingTool.mode).toBe('draw');
    act(() => store.getState().setSceneLighting({ enabled: true }));
    expect(inert('Explored memory')).toBe(false);
  });

  it('gives the memory mode what a stroke does and its shape', () => {
    const store = renderBar();
    act(() => store.getState().setSceneLighting({ enabled: true }));
    fireEvent.click(button('Explored memory'));
    expect(names().slice(6)).toEqual(['Reveal', 'Forget', 'Brush', 'Lasso', 'Rectangle']);
    fireEvent.click(button('Forget'));
    fireEvent.click(button('Lasso'));
    expect(store.getState().exploredBrush).toMatchObject({ mode: 'forget', shape: 'lasso' });
    expect(pressed('Forget')).toBe(true);
    // Choices are kept while another mode is in use.
    fireEvent.click(button('Draw walls'));
    fireEvent.click(button('Explored memory'));
    expect(pressed('Lasso')).toBe(true);
  });

  it('gives the rooms mode carve, fill and door, then the shapes, which a door does not use', () => {
    const store = renderBar();
    fireEvent.click(button('Rooms'));
    expect(store.getState().lightingTool.mode).toBe('rooms');
    expect(names().slice(6)).toEqual(['Carve', 'Fill in', 'Door', 'Rectangle', 'Points', 'Lasso', 'Brush']);
    fireEvent.click(button('Points'));
    expect(store.getState().roomTool.shape).toBe('polygon');
    fireEvent.click(button('Door'));
    for (const shape of ['Rectangle', 'Points', 'Lasso', 'Brush']) expect(inert(shape)).toBe(true);
    fireEvent.click(button('Lasso'));
    expect(store.getState().roomTool.shape).toBe('polygon');
  });

  it('sets its groups apart by space, with no line between them', () => {
    renderBar();
    const bar = screen.getByRole('toolbar');
    expect(bar.querySelectorAll('.atlas-lighting-bar__break')).toHaveLength(1);
    expect(bar.querySelector('hr, [role="separator"]')).toBeNull();
  });
});
