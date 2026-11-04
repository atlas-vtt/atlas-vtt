// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Renderer } from 'pixi.js';
import type { ExploredShapes } from '../../src/app/vision/exploredShapes';

/** What the fake texture went through, in order: each stamp by the name of its shapes. */
const log = vi.hoisted((): string[] => []);

vi.mock('../../src/app/pixi/lighting/ExploredTexture', () => ({
  ExploredTexture: class {
    readonly texture = {};
    add(shapes: { name?: string }): void { log.push(`add ${shapes.name}`); }
    clear(): void { log.push('clear'); }
    draw(): void {}
    toCanvas(): object { return {}; }
    destroy(): void {}
    decode(): Promise<{ destroy(): void }> { return Promise.resolve({ destroy: () => undefined }); }
  },
}));
vi.mock('../../src/app/pixi/lighting/ExploredSteps', () => ({
  ExploredSteps: class {
    size = 0;
    sightRecorded(): void {}
    clear(): void {}
  },
}));
vi.mock('../../src/app/pixi/lighting/exploredMaskSaving', () => ({ saveExploredMask: (): string => 'data:image/png;base64,saved' }));

import { ExploredMemory, type ExploredMemoryState } from '../../src/app/pixi/lighting/ExploredMemory';

const BOUNDS = { width: 100, height: 100 };
const seen = (name: string): ExploredShapes => ({ polygons: [], clip: null, name } as ExploredShapes);

function memory(): { memory: ExploredMemory; setExploredMask: ReturnType<typeof vi.fn> } {
  const setExploredMask = vi.fn();
  const state = { mapPath: 'maps/tower.atlasmap', isMapLoading: false, exploredEdits: 0, setExploredMask, setExploredEdits: vi.fn() } as unknown as ExploredMemoryState;
  const store = { getState: () => state, subscribe: () => () => undefined };
  const created = new ExploredMemory({ renderer: {} as Renderer, store, onTexture: vi.fn(), onTravel: vi.fn(), onChange: vi.fn(), guard: (work) => work(), stampEveryMs: 100 });
  created.sync(BOUNDS, null, 'ground');
  log.length = 0;
  return { memory: created, setExploredMask };
}

afterEach(() => {
  log.length = 0;
  vi.useRealTimers();
});

describe('explored memory stamped at most every so often', () => {
  it('stamps the first sight at once and only the last of what follows within the interval, once its turn comes', () => {
    const { memory: explored } = memory();
    explored.record(seen('a'), 1000);
    explored.record(seen('b'), 1016);
    explored.record(seen('c'), 1032);
    expect(log).toEqual(['add a']);
    expect(explored.stampDue(1099)).toBe(false);
    expect(explored.stampDue(1100)).toBe(true);
    expect(log).toEqual(['add a', 'add c']);
    expect(explored.stampDue(1300)).toBe(false);
    explored.record(seen('d'), 1300);
    expect(log).toEqual(['add a', 'add c', 'add d']);
    explored.destroy();
  });

  it('stamps what waits into the memory of the level left before it starts on another, and before it saves', () => {
    vi.useFakeTimers();
    const { memory: explored, setExploredMask } = memory();
    explored.record(seen('a'), 0);
    explored.record(seen('b'), 10);
    explored.sync(BOUNDS, null, 'upper');
    expect(log).toEqual(['add a', 'add b', 'clear']);
    expect(setExploredMask).toHaveBeenCalledWith('data:image/png;base64,saved', 'ground');

    // Within the interval of that stamp: the last waits, and the save stamps it before it reads the memory.
    log.length = 0;
    explored.record(seen('c'), performance.now() + 10);
    explored.record(seen('d'), performance.now() + 20);
    expect(log).toEqual([]);
    vi.advanceTimersByTime(30_000);
    expect(log).toEqual(['add d']);
    expect(setExploredMask).toHaveBeenLastCalledWith('data:image/png;base64,saved', 'upper');
    explored.destroy();
  });

  it('forgets what waits when the graphics device is lost', () => {
    const { memory: explored } = memory();
    explored.record(seen('a'), 0);
    explored.record(seen('b'), 10);
    explored.holdSaves();
    expect(explored.stampDue()).toBe(false);
    expect(log).toEqual(['add a']);
    explored.destroy();
  });
});
