import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The memory's texture and undo steps live on the graphics device: stand-ins that only count.
vi.mock('../../src/app/pixi/lighting/ExploredTexture', () => ({
  ExploredTexture: class {
    texture = {};
    add(): void {}
    clear(): void {}
    decode(): Promise<object> { return Promise.resolve({ destroy: () => undefined }); }
    draw(): void {}
    toCanvas(): object { return {}; }
    destroy(): void {}
  },
}));
vi.mock('../../src/app/pixi/lighting/ExploredSteps', () => ({
  ExploredSteps: class {
    size = 0;
    full = false;
    sightRecorded(): void {}
    apply(): boolean { this.size++; return true; }
    leads(): boolean { return true; }
    travel(): void {}
    clear(): void { this.size = 0; }
  },
}));
let saves = 0;
vi.mock('../../src/app/pixi/lighting/exploredMaskSaving', () => ({ saveExploredMask: (): string => `data:saved-${++saves}` }));

import type { Renderer } from 'pixi.js';
import { ExploredMemory } from '../../src/app/pixi/lighting/ExploredMemory';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const BOUNDS = { width: 1000, height: 500 };

function memoryOf(): { memory: ExploredMemory; store: ReturnType<typeof createViewAtlasStore>; settled: ReturnType<typeof vi.fn> } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, 'v1');
  store.setState({ mapPath: 'maps/a.atlasmap' });
  const settled = vi.fn();
  const memory = new ExploredMemory({
    renderer: {} as Renderer, store, onTexture: () => undefined, onTravel: () => undefined, onChange: () => undefined,
    guard: (work) => work(), onSettled: settled,
  });
  return { memory, store, settled };
}

beforeEach(() => { vi.useFakeTimers(); saves = 0; });
afterEach(() => { vi.useRealTimers(); });

describe('explored memory settling', () => {
  it('is settling while a saved mask is drawn in, and settles once it is', async () => {
    const { memory, settled } = memoryOf();
    memory.sync(BOUNDS, 'data:a');
    expect(memory.settling()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(memory.settling()).toBe(false);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('is settling after a forget until the save that holds it, and is so before the store has the new mask', async () => {
    const { memory, store, settled } = memoryOf();
    memory.sync(BOUNDS, null);
    expect(memory.edit({ mode: 'reveal', area: 'everything' })).toBe(true);
    expect(memory.settling()).toBe(false);
    expect(memory.edit({ mode: 'forget', area: 'everything' })).toBe(true);
    expect(memory.settling()).toBe(true);
    let settlingWhenSaved: boolean | null = null;
    store.subscribe((state, previous) => { if (state.exploredMask !== previous.exploredMask) settlingWhenSaved = memory.settling(); });
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.getState().exploredMask).toMatch(/^data:saved-/);
    expect(settlingWhenSaved).toBe(false);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('is settling after an undo or redo, which may take area out (an undone reveal)', async () => {
    const { memory, store } = memoryOf();
    memory.sync(BOUNDS, null);
    memory.edit({ mode: 'reveal', area: 'everything' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(memory.settling()).toBe(false);
    store.getState().setExploredEdits(0);
    expect(memory.settling()).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(memory.settling()).toBe(false);
  });

  it('clearing a memory that is not loaded settles at once: the mask goes with it', () => {
    const { memory, store } = memoryOf();
    memory.sync(BOUNDS, 'data:a');
    memory.reset();
    expect(store.getState().exploredMask).toBeNull();
    expect(memory.settling()).toBe(false);
  });
});
