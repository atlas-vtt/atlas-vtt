import { describe, expect, it } from 'vitest';
import type { ViewAtlasStore } from '../../../src/app/storeFactory';
import { timeBound } from '../../helpers/timeBound';
import { dungeon } from './dungeonStore';

const RUNS = 5;
const WRITES = 1000;

/** What stands open while a token is dragged across the tower floor. */
const OPEN = {
  nothing: (): void => undefined,
  lightPopover: (store: ViewAtlasStore): void => {
    const state = store.getState();
    state.openLightPopover(Object.keys(state.objects.lights).find((id) => state.objects.lights[id]!.levels?.includes('tower'))!);
  },
  floorPositioning: (store: ViewAtlasStore): void => store.getState().setFloorPositioning(true),
} as const;

type Open = keyof typeof OPEN;

/** The three-floor dungeon, lit, on its top floor, with `open` open. */
function scene(open: Open): ViewAtlasStore {
  const store = dungeon();
  store.getState().setSceneLighting({ enabled: true });
  store.getState().setViewedLevel('tower');
  OPEN[open](store);
  return store;
}

/** One write per step of a drag: a token of the floor shown moved by a pixel, `WRITES` times. */
function drag(store: ViewAtlasStore): void {
  const state = store.getState();
  const id = Object.keys(state.objects.tokens).find((token) => state.objects.tokens[token]!.level === 'tower')!;
  const { x, y } = state.objects.tokens[id]!;
  for (let step = 1; step <= WRITES; step += 1) store.getState().setTokenPositions([{ id, x: x + step, y }]);
}

/** The middle of `RUNS` drags for each of `OPEN`, interleaved so that each meets the same load; in milliseconds. */
function middles(): Record<Open, number> {
  const names = Object.keys(OPEN) as Open[];
  const times = Object.fromEntries(names.map((name) => [name, [] as number[]])) as Record<Open, number[]>;
  for (let run = 0; run < RUNS; run += 1) {
    for (const name of names) {
      const store = scene(name);
      const start = performance.now();
      drag(store);
      times[name].push(performance.now() - start);
    }
  }
  return Object.fromEntries(names.map((name) => [name, times[name].sort((a, b) => a - b)[Math.floor(RUNS / 2)]!])) as Record<Open, number>;
}

/**
 * What the view's surfaces cost the store's writes while a popover or Position floor stays open:
 * a token dragged on a big scene, store and history only, no renderer. Run alone (`npm run test:perf`).
 */
describe('a thousand drag writes on a three-floor dungeon', () => {
  it('keep the popover and Position floor open', () => {
    for (const name of ['lightPopover', 'floorPositioning'] as const) {
      const store = scene(name);
      drag(store);
      expect(name === 'lightPopover' ? store.getState().lightPopover !== null : store.getState().isFloorPositioning).toBe(true);
    }
  });

  // Measured on the workstation at load 3 to 6, medians of 5: 220 ms for the thousand writes with
  // nothing open, 223 with a light's popover, 218 with Position floor (before the rules said what
  // they read, 313 and 243). The bound leaves three times the first, and an open surface 15 % and 20 ms.
  // Only the light's case guards that old cost (+44 %): Position floor's was +12 %, and at load 9 one
  // run of the fixed code put the light 11 % over nothing open, so a bound that tight would flake.
  it('cost no more with a popover or Position floor open than with nothing open', () => {
    const times = middles();
    console.info(Object.entries(times).map(([name, ms]) => `${name} ${ms.toFixed(0)} ms`).join(', '));
    expect(times.nothing).toBeLessThan(timeBound(700));
    expect(times.lightPopover).toBeLessThan(times.nothing * 1.15 + timeBound(20));
    expect(times.floorPositioning).toBeLessThan(times.nothing * 1.15 + timeBound(20));
  });
});
