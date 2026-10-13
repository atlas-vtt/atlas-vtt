import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { PlayerWidgetBar } from '../../src/app/services/PlayerWidgetBar';
import type { SettingsService } from '../../src/app/services/SettingsService';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TimerWidget } from '../../src/app/types/widgetTypes';

const torch: TimerWidget = {
  id: 'torch', type: 'timer', label: 'Torch', icon: 'hourglass',
  visible: true, visibleToPlayers: true, value: 300, duration: 300, direction: 'down', order: 0,
};

const settings = {
  getLocalPlayerViewSettings: () => ({ showWidgets: true }),
  onChange: () => () => undefined,
} as unknown as SettingsService;

function sceneWith(widget: TimerWidget): Pick<ViewAtlasState, 'widgetSettings' | 'widgetValues'> {
  return {
    widgetSettings: { widgets: { torch: widget }, globalVisible: true, position: 'top', scale: 1 },
    widgetValues: {},
  };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { document.body.empty(); vi.useRealTimers(); });

describe('player widget bar timers', () => {
  it('counts a running timer down by the wall clock, however late its ticks come', () => {
    const store = createStore(() => sceneWith({ ...torch, running: { since: Date.now(), remaining: 300 } }));
    const bar = new PlayerWidgetBar(settings);
    bar.mount(document.body);
    bar.present(store as never);
    const display = (): string | null | undefined => document.body.querySelector('.atlas-timer-display')?.textContent;
    expect(display()).toBe('05:00');

    vi.advanceTimersByTime(1000);
    expect(display()).toBe('04:59');
    vi.setSystemTime(Date.now() + 119_000);
    vi.advanceTimersByTime(1000);
    expect(display()).toBe('02:59');

    vi.setSystemTime(Date.now() + 3_600_000);
    vi.advanceTimersByTime(1000);
    expect(display()).toBe('00:00');
    expect(vi.getTimerCount()).toBe(0);
    bar.destroy();
  });

  it('shows a paused timer without ticking', () => {
    const store = createStore(() => sceneWith({ ...torch, value: 75 }));
    const bar = new PlayerWidgetBar(settings);
    bar.mount(document.body);
    bar.present(store as never);
    expect(document.body.querySelector('.atlas-timer-display')?.textContent).toBe('01:15');
    expect(vi.getTimerCount()).toBe(0);
    bar.destroy();
  });
});
