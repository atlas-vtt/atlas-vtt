// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import { RoomsPanelHost } from '../../src/app/pixi/lighting/RoomsPanel';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

MotionGlobalConfig.skipAnimations = true;
afterEach(cleanup);

function renderPanel(): ViewAtlasStore {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `rooms-panel-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  render(<ViewStoreProvider store={store}><RoomsPanelHost /></ViewStoreProvider>);
  return store;
}

const square = (x: number): number[][] => [[x * 8, 0, (x + 100) * 8, 0, (x + 100) * 8, 800, x * 8, 800]];
const picked = (name: string): boolean => screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true';

describe('the Rooms panel', () => {
  it('shows while the lighting tool works in its Rooms mode in the GM\'s view, and only then', async () => {
    const store = renderPanel();
    expect(screen.queryByRole('region', { name: 'Rooms' })).toBeNull();
    act(() => store.getState().setLightingTool({ mode: 'rooms' }));
    expect(screen.queryByRole('region', { name: 'Rooms' })).toBeNull();
    act(() => store.getState().setActiveTool('wall'));
    screen.getByRole('region', { name: 'Rooms' });
    screen.getByText('Carve a room on the map to start');
    act(() => store.getState().setLightingTool({ mode: 'draw' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Rooms' })).toBeNull());
  });

  it('stands in one place: dragging its header moves nothing', () => {
    const store = renderPanel();
    act(() => {
      store.getState().setLightingTool({ mode: 'rooms' });
      store.getState().setActiveTool('wall');
    });
    const panel = screen.getByRole('region', { name: 'Rooms' });
    const header = panel.querySelector('header')!;
    expect(panel.querySelector('.atlas-light-panel__grip')).toBeNull();
    fireEvent.pointerDown(header, { clientX: 40, clientY: 80, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 340, clientY: 380, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 340, clientY: 380, pointerId: 1 });
    // Placed by the stylesheet alone: no position of its own that a drag could have written.
    expect(panel.style.left).toBe('');
    expect(panel.style.top).toBe('');
  });

  it('lists the rooms of the level with what can be done to each', () => {
    const store = renderPanel();
    act(() => {
      store.getState().setLightingTool({ mode: 'rooms' });
      store.getState().setActiveTool('wall');
      store.getState().carveRoom(square(0));
      store.getState().setActiveRoom(null);
      store.getState().carveRoom(square(200));
      store.getState().setActiveRoom(null);
      store.getState().carveRoom(square(400));
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('3 of 24')).toBeTruthy();
    // The room carved last is highlighted; New room clears that, and the next shape is a room of its own
    expect(picked('Room 3')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'New room' }));
    expect(picked('New room')).toBe(true);
    expect(store.getState().activeRoomId).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Room 2' }));
    expect(picked('Room 2')).toBe(true);
    expect(picked('New room')).toBe(false);

    fireEvent.click(screen.getAllByRole('button', { name: 'Join into the room above' })[2]!);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Room 1' }));
    const name = screen.getByRole('textbox', { name: 'Name of the room' });
    fireEvent.change(name, { target: { value: 'Crypt' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    screen.getByText('Crypt');

    fireEvent.click(screen.getByRole('button', { name: 'Join all rooms' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    // Joining needs two rooms
    expect(screen.queryByRole('button', { name: 'Join all rooms' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete room' }));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    screen.getByText('Carve a room on the map to start');
  });
});
