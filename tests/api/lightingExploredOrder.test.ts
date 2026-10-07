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
import { DisposerSet } from '../../src/api/disposers';
import { lightingApi } from '../../src/api/lighting';
import type { ExploredImage } from '../../src/app/pixi/lighting/playerDarkness/darknessRaster';
import { ExploredMemory } from '../../src/app/pixi/lighting/ExploredMemory';
import { character, exploredImage, lightingFromStore, scene, wall } from '../unit/lightingFixtures';
import { fakeView, framesFor, loadMap, trackerWith } from './apiFakes';

const MAP = { width: 1000, height: 500 };

beforeEach(() => { vi.useFakeTimers(); saves = 0; });
afterEach(() => { vi.useRealTimers(); });

describe('lighting and explored edits, in any subscriber order', () => {
  it('C-light-1: a watcher asking on an undo before the memory follows it never sees the area the undo took out', async () => {
    const view = fakeView('v1');
    loadMap(view);
    // The first save holds the revealed map, every later one nothing: the undo took the reveal back.
    const decode = vi.fn((mask: string): Promise<ExploredImage> => Promise.resolve(exploredImage(MAP, () => mask === 'data:saved-1')));
    const api = lightingApi(trackerWith([view]).tracker, framesFor(decode), new DisposerSet());
    const behindWall = (): number | string => {
      const answer = api.playerVisibility('v1');
      if (answer.status !== 'ready') return answer.status;
      const { cellSize, cols, shown } = answer.darkness;
      return shown[Math.floor(250 / cellSize) * cols + Math.floor(800 / cellSize)]!;
    };
    const asked: Array<number | string> = [];
    let asking = true;
    // Subscribed before the memory, so it asks before the memory follows the undo; then it does not ask for a while.
    api.watch('v1', () => { if (asking) asked.push(behindWall()); });
    const memory = new ExploredMemory({
      renderer: {} as Renderer, store: view.atlasStore, onTexture: () => undefined, onTravel: () => undefined,
      onChange: () => undefined, guard: (work) => work(), onSettled: () => view.firePlayerLightingChange(),
    });
    const lit = lightingFromStore(scene({ ambient: 1 }, {
      tokens: { hero: character('hero', 140, 250, { vision: { enabled: true } }) },
      walls: { w: wall('w', { x: 500, y: -10 }, { x: 500, y: 510 }) },
    }), MAP)!;
    view.renderer!.getPlayerLighting = () => ({ ...lit, exploredSettling: memory.settling() });
    memory.sync(MAP, null);
    memory.edit({ mode: 'reveal', area: 'everything' });
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(0);
    expect(behindWall()).toBe(1);
    asked.length = 0;
    view.atlasStore.getState().setExploredEdits(0);
    expect(asked[0]).toBe('pending');
    // Nobody asks again until the save; then the smaller mask decodes with nothing standing in.
    asking = false;
    await vi.advanceTimersByTimeAsync(0);
    asking = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(view.atlasStore.getState().exploredMask).toBe('data:saved-2');
    await vi.advanceTimersByTimeAsync(0);
    expect(behindWall()).toBe(0);
    // Told when the memory settled and when the mask decoded: pending, never the area taken out.
    console.log('ASKED', JSON.stringify(asked));
    expect(asked.length).toBeGreaterThan(1);
    expect(asked.every((answer) => answer !== 1)).toBe(true);
  });

  it('C-light-1: a rename while a forget waits to be saved saves it under the new name', async () => {
    const view = fakeView('v1');
    loadMap(view);
    const memory = new ExploredMemory({
      renderer: {} as Renderer, store: view.atlasStore, onTexture: () => undefined, onTravel: () => undefined,
      onChange: () => undefined, guard: (work) => work(),
    });
    memory.sync(MAP, null);
    memory.edit({ mode: 'forget', area: 'everything' });
    expect(memory.settling()).toBe(true);
    view.atlasStore.getState().setMapPath('maps/renamed.atlasmap');
    await vi.advanceTimersByTimeAsync(2000);
    expect(view.atlasStore.getState().exploredMask).toBe('data:saved-1');
    expect(memory.settling()).toBe(false);
  });
});
