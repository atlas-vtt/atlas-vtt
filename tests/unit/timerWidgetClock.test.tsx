import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ResponsiveWidgetBar } from '../../src/app/react/components/ResponsiveWidgetBar';
import { AssetService } from '../../src/app/services/AssetService';
import { WidgetSyncService } from '../../src/app/services/WidgetSyncService';
import { TIMER_CHECKPOINT_MS } from '../../src/app/react/hooks/useTimerClock';
import { timerRun, timerShownSeconds } from '../../src/app/utils/timerWidget';
import type { TimerWidget } from '../../src/app/types/widgetTypes';

const torch: TimerWidget = {
  id: 'torch', type: 'timer', label: 'Torch', icon: 'hourglass',
  visible: true, visibleToPlayers: true, value: 300, duration: 300, direction: 'down', order: 0,
};
const scene = 'atlas-vtt/collections/campaign/scenes/cave.atlasmap';

interface Bar { store: ViewAtlasStore; ding: ReturnType<typeof vi.fn>; root: HTMLElement }

function openBar(app: ReturnType<typeof createInMemoryApp>['app'], viewId: string, sync?: WidgetSyncService, widget = torch): Bar {
  const store = createViewAtlasStore(app, viewId);
  store.getState().setPersistenceEnabled(false);
  if (sync) {
    sync.registerStore(viewId, store);
    store.getState().setMapLoading(true);
    store.getState().setMapPath(scene);
    store.getState().setMapLoading(false);
  }
  store.getState().addWidget(widget);
  const ding = vi.fn();
  const view = { serviceManager: { getSoundEffectService: () => ({ playTimerDing: ding }) } };
  const root = document.body.createDiv();
  render(
    <AtlasUIContext.Provider value={{ app, view: view as never, pixiApp: null, renderer: null }}>
      <ResponsiveWidgetBar store={store} viewId={viewId} />
    </AtlasUIContext.Provider>,
    { container: root },
  );
  return { store, ding, root };
}

const timerOf = (store: ViewAtlasStore): TimerWidget => store.getState().widgetSettings.widgets.torch as TimerWidget;
const shown = (bar: Bar): string | null | undefined => bar.root.querySelector('.atlas-timer-display')?.textContent;
const click = (bar: Bar, index: number): void => {
  act(() => { (bar.root.querySelectorAll('.atlas-timer-btn')[index] as HTMLElement).click(); });
};
const playPause = (bar: Bar): void => click(bar, 0);
const reset = (bar: Bar): void => click(bar, 1);

/** What a hidden window does: the clock moves on while timers wait, then one late tick runs. */
function throttledTick(ms: number): void {
  act(() => {
    vi.setSystemTime(Date.now() + ms - 1000);
    vi.advanceTimersByTime(1000);
  });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); document.body.empty(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('timer widget clock', () => {
  it('keeps its time when a hidden window ticks once a minute', () => {
    const { app } = createInMemoryApp();
    const bar = openBar(app, 'map');
    playPause(bar);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(shown(bar)).toBe('04:57');

    throttledTick(60_000);
    throttledTick(60_000);
    expect(shown(bar)).toBe('02:57');
    expect(timerShownSeconds(timerOf(bar.store), Date.now())).toBe(177);
  });

  it('pauses and resumes across a long gap without losing or gaining time', () => {
    const { app } = createInMemoryApp();
    const bar = openBar(app, 'map');
    playPause(bar);
    act(() => { vi.advanceTimersByTime(10_000); });
    playPause(bar);
    expect(timerOf(bar.store)).toMatchObject({ value: 290 });
    expect(timerOf(bar.store).running).toBeUndefined();

    act(() => { vi.setSystemTime(Date.now() + 3_600_000); vi.advanceTimersByTime(5000); });
    expect(shown(bar)).toBe('04:50');
    playPause(bar);
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(shown(bar)).toBe('04:30');
  });

  it('resets to its duration and stops', () => {
    const { app } = createInMemoryApp();
    const bar = openBar(app, 'map');
    playPause(bar);
    act(() => { vi.advanceTimersByTime(42_000); });
    reset(bar);
    expect(timerOf(bar.store)).toEqual(torch);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(shown(bar)).toBe('05:00');
  });

  it('runs out exactly once, also when the window was hidden past the end', () => {
    const { app } = createInMemoryApp();
    const bar = openBar(app, 'map');
    playPause(bar);
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { vi.setSystemTime(Date.now() + 3_600_000); });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(shown(bar)).toBe('00:00');
    expect(timerOf(bar.store)).toEqual({ ...torch, value: 0 });
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(bar.ding).toHaveBeenCalledOnce();

    // Starting again runs the full duration.
    playPause(bar);
    act(() => { vi.advanceTimersByTime(300_000); });
    expect(bar.ding).toHaveBeenCalledTimes(2);
  });

  it('stops a timer that ran out while no view showed it without a sound', () => {
    const { app } = createInMemoryApp();
    const started = { ...torch, value: 30, running: { since: Date.now() - 3_600_000, remaining: 30 } };
    const bar = openBar(app, 'map', undefined, started);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(shown(bar)).toBe('00:00');
    expect(timerRun(timerOf(bar.store))).toBeUndefined();
    expect(bar.ding).not.toHaveBeenCalled();
  });

  it('makes no undo step and changes the store only at its controls, checkpoints and end', () => {
    const { app } = createInMemoryApp();
    const bar = openBar(app, 'map');
    const changes = vi.fn();
    bar.store.subscribe((state) => state.widgetSettings, changes);
    playPause(bar);
    act(() => { vi.advanceTimersByTime(299_000); });
    expect(changes).toHaveBeenCalledTimes(1 + Math.floor(299_000 / TIMER_CHECKPOINT_MS));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(timerOf(bar.store).value).toBe(0);
    expect(changes).toHaveBeenCalledTimes(2 + Math.floor(299_000 / TIMER_CHECKPOINT_MS));
    expect(bar.store.temporal.getState().pastStates).toHaveLength(0);
  });

  it('writes the time left at each checkpoint, for older versions that read only the value', () => {
    const { app } = createInMemoryApp();
    const bar = openBar(app, 'map');
    playPause(bar);
    act(() => { vi.advanceTimersByTime(TIMER_CHECKPOINT_MS); });
    expect(timerOf(bar.store).value).toBe(300 - TIMER_CHECKPOINT_MS / 1000);
    expect(timerOf(bar.store).running?.remaining).toBe(timerOf(bar.store).value);
  });

  it('reads a timer an older version ticked down as paused at its value', () => {
    const { app } = createInMemoryApp();
    const stale = { ...torch, value: 120, running: { since: Date.now() - 600_000, remaining: 280 } };
    const bar = openBar(app, 'map', undefined, stale);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(shown(bar)).toBe('02:00');
    playPause(bar);
    expect(timerOf(bar.store).running).toEqual({ since: Date.now(), remaining: 120 });
  });

  it('loads a scene saved without a run as paused', () => {
    const { app } = createInMemoryApp();
    const bar = openBar(app, 'map', undefined, { ...torch, value: 75 });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(shown(bar)).toBe('01:15');
  });

  it('mirrors a running timer between views of a scene and sounds once when it runs out', () => {
    const { app } = createInMemoryApp();
    vi.spyOn(AssetService, 'getInstance').mockReturnValue({
      initialize: () => Promise.resolve(),
      getCollectionForMap: () => null,
      getCollectionSettings: () => ({ conditions: [] }),
      updateCollectionSettings: () => Promise.resolve(),
    } as never);
    const sync = new WidgetSyncService({ app } as never);
    const first = openBar(app, 'first', sync);
    const second = openBar(app, 'second', sync);
    playPause(first);
    expect(timerRun(timerOf(second.store))).toEqual(timerOf(first.store).running);

    throttledTick(100_000);
    expect(shown(first)).toBe('03:20');
    expect(shown(second)).toBe('03:20');
    playPause(second);
    expect(timerRun(timerOf(first.store))).toBeUndefined();
    playPause(first);

    throttledTick(400_000);
    expect(shown(first)).toBe('00:00');
    expect(shown(second)).toBe('00:00');
    expect(first.ding.mock.calls.length + second.ding.mock.calls.length).toBe(1);
    sync.destroy();
  });
});
