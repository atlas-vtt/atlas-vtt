// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { Application } from 'pixi.js';
import type { ViewAtlasStore } from '../../src/app/storeFactory';

interface FakeTransition { play: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; paintInto: ReturnType<typeof vi.fn> }

const captured = vi.hoisted(() => ({ transitions: [] as FakeTransition[], previous: [] as Array<FakeTransition | null> }));

vi.mock('../../src/app/pixi/sceneTransition', () => ({
  captureSceneTransition: vi.fn((_app: unknown, previous: FakeTransition | null) => {
    const transition = { play: vi.fn(), cancel: vi.fn(), paintInto: vi.fn() };
    captured.transitions.push(transition);
    captured.previous.push(previous);
    return transition;
  }),
}));

import {
  bindMapLoadingFrameHold,
  MAP_LOADING_OVERLAY_FADE_MS,
  MAP_LOADING_REVEAL_DELAY_MS,
} from '../../src/app/pixi/mapLoadingFrameHold';

const HAND_OVER_MS = MAP_LOADING_REVEAL_DELAY_MS + MAP_LOADING_OVERLAY_FADE_MS;

function setup(): { app: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; ticker: { started: boolean } }; setLoading: (loading: boolean) => void; unbind: () => void } {
  const store = createStore(() => ({ isMapLoading: false }));
  const ticker = { started: true };
  const app = {
    ticker,
    stop: vi.fn(() => { ticker.started = false; }),
    start: vi.fn(() => { ticker.started = true; }),
  };
  const unbind = bindMapLoadingFrameHold(store as unknown as ViewAtlasStore, app as unknown as Application);
  return { app, setLoading: (isMapLoading) => store.setState({ isMapLoading }), unbind };
}

describe('bindMapLoadingFrameHold', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    captured.transitions.length = 0;
    captured.previous.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('holds the last frame while a map loads, then resumes and crossfades to the new map', () => {
    const { app, setLoading } = setup();
    setLoading(true);
    expect(app.stop).toHaveBeenCalledTimes(1);
    expect(captured.transitions).toHaveLength(1);

    setLoading(false);
    expect(app.start).toHaveBeenCalledTimes(1);
    expect(captured.transitions[0]!.play).toHaveBeenCalledTimes(1);
  });

  it('hands over to the loading overlay once it covers the canvas', () => {
    const { app, setLoading } = setup();
    setLoading(true);

    vi.advanceTimersByTime(HAND_OVER_MS);
    expect(app.start).toHaveBeenCalledTimes(1);
    expect(captured.transitions[0]!.cancel).toHaveBeenCalledTimes(1);

    setLoading(false);
    expect(app.start).toHaveBeenCalledTimes(1);
    expect(captured.transitions[0]!.play).not.toHaveBeenCalled();
  });

  it('carries a crossfade that is still running into the next switch', () => {
    const { setLoading } = setup();
    setLoading(true);
    setLoading(false);
    setLoading(true);

    expect(captured.previous[1]).toBe(captured.transitions[0]);
  });

  it('never replays a finished crossfade when a later load cannot hold', () => {
    const { app, setLoading } = setup();
    setLoading(true);
    setLoading(false);
    app.ticker.started = false;
    setLoading(true);
    setLoading(false);

    expect(captured.transitions).toHaveLength(1);
    expect(captured.transitions[0]!.play).toHaveBeenCalledTimes(1);
    expect(app.start).toHaveBeenCalledTimes(1);
  });

  it('resumes rendering and drops the frozen frame when unbound mid-load', () => {
    const { app, setLoading, unbind } = setup();
    setLoading(true);
    unbind();

    expect(app.start).toHaveBeenCalledTimes(1);
    expect(captured.transitions[0]!.cancel).toHaveBeenCalled();
  });
});
