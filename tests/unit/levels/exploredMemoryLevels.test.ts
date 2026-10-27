// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Renderer } from 'pixi.js';

/** What the fake texture went through, in order. */
const log = vi.hoisted((): string[] => []);
let saved = 0;

vi.mock('../../../src/app/pixi/lighting/ExploredTexture', () => ({
  ExploredTexture: class {
    readonly texture = {};
    add(): void { log.push('add'); }
    clear(): void { log.push('clear'); }
    draw(): void { log.push('draw'); }
    toCanvas(): object { return {}; }
    destroy(): void {}
    decode(mask: string): Promise<{ destroy(): void }> {
      log.push(`decode ${mask}`);
      return Promise.resolve({ destroy: () => undefined });
    }
  },
}));
vi.mock('../../../src/app/pixi/lighting/ExploredSteps', () => ({
  ExploredSteps: class {
    size = 0;
    sightRecorded(): void {}
    clear(): void {}
  },
}));
vi.mock('../../../src/app/pixi/lighting/exploredMaskSaving', () => ({
  saveExploredMask: (): string => `data:image/png;base64,saved${++saved}`,
}));

import { ExploredMemory, type ExploredMemoryState } from '../../../src/app/pixi/lighting/ExploredMemory';

const BOUNDS = { width: 100, height: 100 };

function memory(): { memory: ExploredMemory; setExploredMask: ReturnType<typeof vi.fn> } {
  const setExploredMask = vi.fn();
  const state = { mapPath: 'maps/tower.atlasmap', isMapLoading: false, exploredEdits: 0, setExploredMask, setExploredEdits: vi.fn() } as unknown as ExploredMemoryState;
  const store = { getState: () => state, subscribe: () => () => undefined };
  const created = new ExploredMemory({ renderer: {} as Renderer, store, onTexture: vi.fn(), onTravel: vi.fn(), onChange: vi.fn(), guard: (work) => work() });
  return { memory: created, setExploredMask };
}

afterEach(() => {
  log.length = 0;
  vi.useRealTimers();
});

describe('the explored memory of a scene with levels', () => {
  it('saves what was seen into the level left, then starts on the memory of the level shown', async () => {
    vi.useFakeTimers();
    const { memory: explored, setExploredMask } = memory();
    explored.sync(BOUNDS, 'data:image/png;base64,ground', 'ground');
    await Promise.resolve();
    explored.record({ polygons: [], clip: null });
    log.length = 0;

    explored.sync(BOUNDS, 'data:image/png;base64,upper', 'upper');
    await Promise.resolve();

    expect(setExploredMask).toHaveBeenCalledWith('data:image/png;base64,saved1', 'ground');
    expect(log).toEqual(['clear', 'decode data:image/png;base64,upper', 'draw']);

    // A save afterwards goes to the level shown now
    explored.record({ polygons: [], clip: null });
    vi.advanceTimersByTime(2000);
    expect(setExploredMask).toHaveBeenLastCalledWith('data:image/png;base64,saved2', 'upper');
    explored.destroy();
  });

  it('keeps the texture as it is while the level stays', async () => {
    const { memory: explored, setExploredMask } = memory();
    explored.sync(BOUNDS, null, 'ground');
    log.length = 0;

    explored.sync(BOUNDS, null, 'ground');

    expect(log).toEqual([]);
    expect(setExploredMask).not.toHaveBeenCalled();
    explored.destroy();
  });
});
