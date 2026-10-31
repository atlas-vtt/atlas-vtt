// @vitest-environment jsdom
import type { Renderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapVideoMode } from '../../../src/app/pixi/mosaicCanvas/video/mapVideoPlayback';
import { watchMapVideoPlayback } from '../../../src/app/pixi/mosaicCanvas/video/watchMapVideoPlayback';

type Listener = () => void;

/** A source of state and the listeners it tells of changes. */
function source<T>(initial: T): { value: T; set(next: T): void; subscribe(listener: Listener): () => void } {
  const listeners = new Set<Listener>();
  return {
    value: initial,
    set(next) {
      this.value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Replaces the window's intersection observer with one the test drives; returns how to report the canvas on or off screen. */
function controlledObserver(): (onScreen: boolean) => void {
  let report: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
  class Observer {
    constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
      report = callback;
    }
    observe(): void {}
    disconnect(): void {
      report = null;
    }
  }
  vi.stubGlobal('IntersectionObserver', Observer);
  return (onScreen) => report?.([{ isIntersecting: onScreen }]);
}

function watch(): { modes: MapVideoMode[]; setOnScreen: (on: boolean) => void; scene: ReturnType<typeof source<{ isMapLoading: boolean; mapLoaded: boolean }>>; players: ReturnType<typeof source<boolean>>; animate: ReturnType<typeof source<boolean | null>>; canvas: HTMLCanvasElement; stop: () => void } {
  const setOnScreen = controlledObserver();
  const modes: MapVideoMode[] = [];
  const scene = source({ isMapLoading: false, mapLoaded: true });
  const players = source(false);
  const animate = source<boolean | null>(null);
  const canvas = document.body.createEl('canvas');
  const renderer = { name: 'canvas' } as Renderer;
  const stop = watchMapVideoPlayback({
    map: { setVideoMode: (mode) => modes.push(mode) },
    canvas,
    renderer,
    scene: { getState: () => scene.value, subscribe: (listener) => scene.subscribe(listener) },
    players: { shown: () => players.value, subscribe: (listener) => players.subscribe(listener) },
    animate: { get: () => animate.value, onChange: (listener) => animate.subscribe(listener) },
  });
  return { modes, setOnScreen, scene, players, animate, canvas, stop };
}

describe('watching where an animated map is seen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.empty();
  });

  it('pauses until the canvas is on screen, plays while it is, and pauses when its pane is covered', () => {
    const run = watch();
    expect(run.modes.at(-1)).toBe('pause');
    run.setOnScreen(true);
    expect(run.modes.at(-1)).toBe('play');
    run.setOnScreen(false);
    expect(run.modes.at(-1)).toBe('pause');
    run.stop();
  });

  it('plays for the player window while the pane is covered', () => {
    const run = watch();
    run.players.set(true);
    expect(run.modes.at(-1)).toBe('play');
    run.stop();
  });

  it('pauses while a scene loads and while the graphics context is lost', () => {
    const run = watch();
    run.setOnScreen(true);
    run.scene.set({ isMapLoading: true, mapLoaded: true });
    expect(run.modes.at(-1)).toBe('pause');
    run.scene.set({ isMapLoading: false, mapLoaded: true });
    expect(run.modes.at(-1)).toBe('play');
    run.canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(run.modes.at(-1)).toBe('pause');
    run.canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(run.modes.at(-1)).toBe('play');
    run.stop();
  });

  it('shows posters once Animate maps is switched off', () => {
    const run = watch();
    run.setOnScreen(true);
    run.animate.set(false);
    expect(run.modes.at(-1)).toBe('poster');
    run.stop();
  });

  it('hears nothing once stopped', () => {
    const run = watch();
    run.stop();
    const heard = run.modes.length;
    run.players.set(true);
    run.canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(run.modes).toHaveLength(heard);
  });
});
