import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ResponsiveWidgetBar } from '../../src/app/react/components/ResponsiveWidgetBar';
import { useMapHotkeys } from '../../src/app/keyboard/useMapHotkeys';
import type { CounterWidget, TimerWidget } from '../../src/app/types/widgetTypes';
import { timerShownSeconds } from '../../src/app/utils/timerWidget';

const counter: CounterWidget = {
  id: 'fear', type: 'counter', label: 'Fear', icon: 'skull',
  visible: true, visibleToPlayers: true, value: 0, order: 0,
};
const timer: TimerWidget = {
  id: 'torch', type: 'timer', label: 'Torch', icon: 'hourglass',
  visible: true, visibleToPlayers: true, value: 60, duration: 60, order: 1,
};

function press(key: string, code: string): void {
  act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true })); });
}
function release(key: string, code: string): void {
  act(() => { document.body.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true, cancelable: true })); });
}

interface MapShortcuts { palette: () => void; diceTray: () => void }

/** The map shortcuts that share their keys with the held timer's. */
function MapShortcuts({ shortcuts }: { shortcuts: MapShortcuts }): null {
  useMapHotkeys(shortcuts, 'map');
  return null;
}

function mapShortcuts(): MapShortcuts {
  return { palette: vi.fn(), diceTray: vi.fn() };
}

function renderBar(shortcuts: MapShortcuts = mapShortcuts()): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, 'map');
  store.getState().setPersistenceEnabled(false);
  store.setState({ widgetSettings: { ...store.getState().widgetSettings, widgets: { fear: counter, torch: timer } } });
  const leaf = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
  const container = leaf.createDiv({ attr: { 'data-view-id': 'map' } });
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <MapShortcuts shortcuts={shortcuts} />
      <ResponsiveWidgetBar store={store} viewId="map" />
    </AtlasUIContext.Provider>,
    { container },
  );
  return store;
}

const timerValue = (store: ViewAtlasStore): number => timerShownSeconds(store.getState().widgetSettings.widgets.torch as TimerWidget, Date.now());

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); document.body.empty(); vi.useRealTimers(); });

describe('held timer hotkeys', () => {
  it('starts, pauses and resets the timer at the held position', () => {
    const shortcuts = mapShortcuts();
    const store = renderBar(shortcuts);
    press('2', 'Digit2');
    press(' ', 'Space');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(timerValue(store)).toBe(57);

    press(' ', 'Space');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(timerValue(store)).toBe(57);

    press('r', 'KeyR');
    expect(timerValue(store)).toBe(60);
    release('2', 'Digit2');
    expect(shortcuts.palette).not.toHaveBeenCalled();
    expect(shortcuts.diceTray).not.toHaveBeenCalled();
  });

  it('leaves Space and R to the palette and dice tray while no widget is held', () => {
    const shortcuts = mapShortcuts();
    const store = renderBar(shortcuts);
    press(' ', 'Space');
    press('r', 'KeyR');
    expect(shortcuts.palette).toHaveBeenCalledOnce();
    expect(shortcuts.diceTray).toHaveBeenCalledOnce();

    press('1', 'Digit1');
    press(' ', 'Space');
    press('r', 'KeyR');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(timerValue(store)).toBe(60);
    expect(shortcuts.palette).toHaveBeenCalledOnce();
    expect(shortcuts.diceTray).toHaveBeenCalledOnce();
    release('1', 'Digit1');
  });
});
