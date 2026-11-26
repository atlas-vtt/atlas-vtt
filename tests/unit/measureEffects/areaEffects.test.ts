import type { Ticker } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import type { ViewPlayback } from '../../../src/app/pixi/liquids/viewLiquids';
import { AreaEffects } from '../../../src/app/pixi/measure/effects/AreaEffects';
import type { MeasureEffectMesh } from '../../../src/app/pixi/measure/effects/MeasureEffectMesh';

/** A view's clock a test moves by hand, 60 display frames a second, and what was asked of the view. */
function view(): { playback: ViewPlayback; frame: (count?: number) => void; renders: () => number; listening: () => boolean; set: (changes: { fps?: number; detail?: 0 | 1 | 2; seen?: boolean }) => void } {
  const ticks = new Set<() => void>();
  const ticker = { lastTime: 0, elapsedMS: 1000 / 60, add: (tick: () => void) => ticks.add(tick), remove: (tick: () => void) => ticks.delete(tick) };
  const state = { fps: 30, detail: 2 as 0 | 1 | 2, seen: true };
  const requestRender = vi.fn();
  const playback: ViewPlayback = { ticker: ticker as unknown as Ticker, requestRender, inView: () => state.seen, fps: () => state.fps, detail: () => state.detail, drawable: true };
  return {
    playback,
    frame: (count = 1) => {
      for (let i = 0; i < count; i++) {
        ticker.lastTime += ticker.elapsedMS;
        ticks.forEach((tick) => tick());
      }
    },
    renders: () => requestRender.mock.calls.length,
    listening: () => ticks.size > 0,
    set: (changes) => Object.assign(state, changes),
  };
}

function mesh(shown = true): MeasureEffectMesh & { times: number[]; stills: boolean[]; details: unknown[] } {
  const times: number[] = [];
  const stills: boolean[] = [];
  const details: unknown[] = [];
  return {
    times, stills, details,
    view: { parent: { visible: shown } },
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    setTime: (seconds: number) => times.push(seconds),
    setStill: (still: boolean) => stills.push(still),
    update: (changes: { detail?: number }) => details.push(changes.detail),
  } as unknown as MeasureEffectMesh & { times: number[]; stills: boolean[]; details: unknown[] };
}

describe('the effects of a view\'s measured areas, played together', () => {
  it('asks the view\'s ticker only while there is an effect', () => {
    const { playback, listening } = view();
    const effects = new AreaEffects(playback);
    expect(listening()).toBe(false);
    const fire = mesh();
    const frost = mesh();
    effects.add(fire);
    effects.add(frost);
    expect(listening()).toBe(true);
    effects.remove(fire);
    expect(listening()).toBe(true);
    effects.remove(frost);
    expect(listening()).toBe(false);
    effects.add(fire);
    effects.destroy();
    expect(listening()).toBe(false);
  });

  it('moves every effect on one clock, a frame and a render at a time, as often as the quality says', () => {
    const { playback, frame, renders, set } = view();
    const effects = new AreaEffects(playback);
    const fire = mesh();
    const frost = mesh();
    effects.add(fire);
    effects.add(frost);
    effects.setMode('play');
    const before = renders();
    frame(60);
    // Thirty frames in a second of sixty display frames, each one render for both effects.
    expect(renders() - before).toBeGreaterThanOrEqual(29);
    expect(renders() - before).toBeLessThanOrEqual(31);
    expect(fire.times.slice(1)).toEqual(frost.times.slice(1));
    expect(fire.times.at(-1)).toBeCloseTo(1, 1);
    set({ fps: 10 });
    const slow = renders();
    frame(60);
    expect(renders() - slow).toBeGreaterThanOrEqual(9);
    expect(renders() - slow).toBeLessThanOrEqual(11);
  });

  it('asks for nothing while paused, while no effect is in view, and for an effect whose body is hidden', () => {
    const { playback, frame, renders, set } = view();
    const effects = new AreaEffects(playback);
    const fire = mesh();
    effects.add(fire);
    frame(30);
    expect(renders()).toBe(0);
    effects.setMode('play');
    frame(30);
    const playing = renders();
    expect(playing).toBeGreaterThan(10);
    const shown = fire.times.at(-1)!;
    // Out of view the clock holds: back in view it goes on from the moment shown.
    set({ seen: false });
    frame(120);
    expect(renders()).toBe(playing);
    set({ seen: true });
    frame(2);
    expect(fire.times.at(-1)! - shown).toBeLessThan(0.1);
    effects.setMode('pause');
    const paused = renders();
    frame(60);
    expect(renders()).toBe(paused);
    // A hidden body's effect is seen by nobody.
    const hidden = new AreaEffects(playback);
    hidden.add(mesh(false));
    hidden.setMode('play');
    const quiet = renders();
    frame(30);
    expect(renders()).toBe(quiet);
  });

  it('holds every effect on its still picture while maps are not animated, and for a picture of the scene', () => {
    const { playback, frame, renders } = view();
    const effects = new AreaEffects(playback);
    const fire = mesh();
    effects.add(fire);
    expect(fire.stills).toEqual([false]);
    effects.setMode('poster');
    expect(fire.stills.at(-1)).toBe(true);
    const still = renders();
    frame(60);
    expect(renders()).toBe(still);
    // An effect that comes while they stand still stands still too.
    const late = mesh();
    effects.add(late);
    expect(late.stills).toEqual([true]);
    effects.setMode('play');
    expect(fire.stills.at(-1)).toBe(false);
    const restore = effects.stillFor();
    expect([fire.stills.at(-1), late.stills.at(-1)]).toEqual([true, true]);
    restore();
    expect([fire.stills.at(-1), late.stills.at(-1)]).toEqual([false, false]);
  });

  it('takes a new quality\'s detail onto every effect, and gives it to the next one made', () => {
    const { playback, frame, set } = view();
    const effects = new AreaEffects(playback);
    const fire = mesh();
    effects.add(fire);
    expect(effects.detail).toBe(2);
    set({ detail: 0 });
    frame();
    expect(fire.details).toEqual([0]);
    expect(effects.detail).toBe(0);
  });

  it('draws nothing where the view plays nothing', () => {
    expect(new AreaEffects().drawable).toBe(false);
    expect(new AreaEffects({ ...view().playback, drawable: false }).drawable).toBe(false);
    expect(new AreaEffects(view().playback).drawable).toBe(true);
  });
});
