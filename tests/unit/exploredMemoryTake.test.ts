// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Renderer } from 'pixi.js';
import type { ExploredShapes } from '../../src/app/vision/exploredShapes';

/** The fake texture's memory: the names of the areas it holds. */
const held = vi.hoisted((): Set<string> => new Set());
const areasOf = (mask: string): string[] => mask.slice('mask:'.length).split(',').filter((name) => name !== '');

vi.mock('../../src/app/pixi/lighting/ExploredTexture', () => ({
  ExploredTexture: class {
    readonly texture = {};
    add(shapes: ExploredShapes & { name: string }): void { held.add(shapes.name); }
    clear(): void { held.clear(); }
    draw(image: { areas: string[] }): void {
      held.clear();
      for (const name of image.areas) held.add(name);
    }
    drawOver(image: { areas: string[] }): void {
      for (const name of image.areas) held.add(name);
    }
    toCanvas(): object { return { areas: [...held].sort() }; }
    destroy(): void {}
    decode(mask: string): Promise<{ areas: string[]; destroy(): void }> {
      return Promise.resolve({ areas: areasOf(mask), destroy: () => undefined });
    }
  },
}));
vi.mock('../../src/app/pixi/lighting/ExploredSteps', () => ({
  ExploredSteps: class {
    size = 0;
    sightRecorded(): void {}
    clear(): void {}
  },
}));
vi.mock('../../src/app/pixi/lighting/exploredMaskSaving', () => ({
  saveExploredMask: (canvas: { areas: string[] }): string => `mask:${canvas.areas.join(',')}`,
}));

import { ExploredMemory, type ExploredMemoryState } from '../../src/app/pixi/lighting/ExploredMemory';

const BOUNDS = { width: 100, height: 100 };
const seen = (name: string): ExploredShapes => ({ polygons: [], clip: null, name }) as ExploredShapes;
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

/** A player's page memory, its store as the page keeps it: the memory's own saves land in it. */
function pageMemory(): { memory: ExploredMemory; state: ExploredMemoryState } {
  const state = { mapPath: 'scene', isMapLoading: false, exploredMask: null, exploredEdits: 0, setExploredEdits: vi.fn() } as unknown as ExploredMemoryState & { exploredMask: string | null };
  state.setExploredMask = vi.fn((mask: string | null) => void (state.exploredMask = mask));
  const store = { getState: () => state, subscribe: () => () => undefined };
  const memory = new ExploredMemory({ renderer: {} as Renderer, store, onTexture: vi.fn(), onTravel: vi.fn(), onChange: vi.fn(), guard: (work) => work() });
  return { memory, state };
}

afterEach(() => {
  held.clear();
  vi.useRealTimers();
});

describe('a memory saved elsewhere, taken in', () => {
  it('keeps what was seen here since: a save older than that adds what it holds and takes nothing away', async () => {
    const { memory } = pageMemory();
    memory.sync(BOUNDS, null);
    memory.record(seen('hall'));
    memory.take('mask:cave', false);
    await settle();
    expect([...held].sort()).toEqual(['cave', 'hall']);
    memory.destroy();
  });

  it('saves the memory with what it added, so the page holds it where its lighting is built anew', async () => {
    vi.useFakeTimers();
    const { memory, state } = pageMemory();
    memory.sync(BOUNDS, null);
    memory.record(seen('hall'));
    memory.take('mask:cave', false);
    await settle();
    vi.advanceTimersByTime(2000);
    expect(state.setExploredMask).toHaveBeenLastCalledWith('mask:cave,hall', null);
    memory.destroy();
  });

  it('replaces the memory when its saver took memory away by hand, and the next sync keeps it', async () => {
    const { memory, state } = pageMemory();
    memory.sync(BOUNDS, null);
    memory.record(seen('hall'));
    memory.take('mask:cave', true);
    await settle();
    memory.sync(BOUNDS, (state as unknown as { exploredMask: string | null }).exploredMask);
    await settle();
    expect([...held]).toEqual(['cave']);

    memory.take(null, true);
    await settle();
    expect([...held]).toEqual([]);
    memory.destroy();
  });

  it('waits for the memory to be sized to the map, then adds to it', async () => {
    const { memory } = pageMemory();
    memory.take('mask:cave', false);
    memory.sync(BOUNDS, null);
    await settle();
    expect([...held]).toEqual(['cave']);
    memory.destroy();
  });

  it('waits for a mask on its way in, then adds to it', async () => {
    const { memory } = pageMemory();
    memory.sync(BOUNDS, 'mask:kept');
    memory.take('mask:cave', false);
    await settle();
    expect([...held].sort()).toEqual(['cave', 'kept']);
    memory.destroy();
  });

  it('drops what it was adding when a replacement comes meanwhile', async () => {
    const { memory } = pageMemory();
    memory.sync(BOUNDS, null);
    memory.take('mask:old', false);
    memory.take('mask:forgotten', true);
    await settle();
    expect([...held]).toEqual(['forgotten']);
    memory.destroy();
  });
});
