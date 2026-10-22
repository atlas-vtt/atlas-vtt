// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LightZonePopoverHost } from '../../src/app/pixi/lighting/LightZonePopover';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { LightZone } from '../../src/app/types/lightingTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

const SQUARE = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

function renderPopover(): { store: ViewAtlasStore; cave: string; zone: () => LightZone; steps: () => number; undo: () => void } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `zone-popover-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/zones.atlasmap');
  store.getState().setSceneLighting({ enabled: true, ambient: 1 });
  const cave = store.getState().addLightZone({ polygon: SQUARE, ambient: 0 });
  const history = getHistoryStore(store)!;
  history.getState().clear();
  const ui: AtlasUIContextValue = { app, view: null, pixiApp: null, renderer: null };
  render(
    <AtlasUIContext.Provider value={ui}>
      <ViewStoreProvider store={store}><LightZonePopoverHost /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  act(() => store.getState().openLightZonePopover(cave));
  return { store, cave, zone: () => store.getState().objects.lightZones![cave]!, steps: () => history.getState().pastStates.length, undo: () => act(() => history.getState().undo()) };
}

describe('LightZonePopover', () => {
  it('is closed until a zone is opened, and names every control', async () => {
    const { store } = renderPopover();
    const popover = screen.getByRole('dialog', { name: 'Light zone' });
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
    for (const stop of ['Day', 'Dusk', 'Night', 'Pitch black']) screen.getByRole('radio', { name: stop });
    expect(screen.getByRole('radio', { name: 'Pitch black' }).getAttribute('aria-checked')).toBe('true');
    screen.getByRole('slider', { name: 'Ambient light' });
    expect(screen.getByLabelText('Ambient colour')).toBeTruthy();
    screen.getByRole('button', { name: 'Delete' });
    expect(popover.querySelector('[title]')).toBeNull();
    act(() => store.getState().closeLightZonePopover());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('sets the zone\'s light by a time of day, in one undo step', () => {
    const { zone, steps, undo } = renderPopover();
    fireEvent.click(screen.getByRole('radio', { name: 'Dusk' }));
    expect(zone().ambient).toBe(0.5);
    expect(screen.getByText('50 %')).toBeTruthy();
    expect(steps()).toBe(1);
    undo();
    expect(zone().ambient).toBe(0);
  });

  it('sets it finely with the slider: a key is a step, a drag one undo step', () => {
    const { store, cave, zone, steps } = renderPopover();
    const slider = screen.getByRole('slider', { name: 'Ambient light' });
    act(() => slider.focus());
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(zone().ambient).toBe(0.01);
    const before = steps();
    fireEvent.pointerDown(slider.closest('.slider-root')!);
    act(() => {
      store.getState().updateLightZone(cave, { ambient: 0.3 });
      store.getState().updateLightZone(cave, { ambient: 0.4 });
    });
    fireEvent.pointerUp(window);
    expect(steps()).toBe(before + 1);
    // A level between the times of day is none of them.
    expect(screen.getAllByRole('radio').every((stop) => stop.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('names the zone on Enter or when the field is left, and takes the name away again when it is emptied', () => {
    const { zone, steps } = renderPopover();
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Cave mouth' } });
    expect(zone().name).toBeUndefined();
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(zone().name).toBe('Cave mouth');
    expect(steps()).toBe(1);
    fireEvent.change(name, { target: { value: '  ' } });
    fireEvent.blur(name);
    expect('name' in zone()).toBe(false);
  });

  it('tints the zone\'s light, every colour tried in the picker as one undo step', () => {
    const { zone, steps } = renderPopover();
    const colour = screen.getByLabelText('Ambient colour') as HTMLInputElement;
    fireEvent.input(colour, { target: { value: '#ff8800' } });
    fireEvent.input(colour, { target: { value: '#ff0000' } });
    act(() => { colour.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(zone().ambientColor).toBe('#ff0000');
    expect(steps()).toBe(1);
  });

  it('deletes the zone, and undo brings it back', async () => {
    const { store, undo } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(store.getState().objects.lightZones).toEqual({});
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    undo();
    expect(Object.keys(store.getState().objects.lightZones ?? {})).toHaveLength(1);
  });

  it('closes on Escape, which does not reach the map\'s shortcuts', () => {
    const { store } = renderPopover();
    const mapKeys = vi.fn();
    window.addEventListener('keydown', mapKeys);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Light zone' }), { key: 'Escape' });
    window.removeEventListener('keydown', mapKeys);
    expect(store.getState().lightZonePopover).toBeNull();
    expect(mapKeys).not.toHaveBeenCalled();
  });
});
