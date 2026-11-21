// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Renderer } from 'pixi.js';

/** Whether the next forget changes the shown floor's texture (a floor nobody explored yet does not). */
const texture = vi.hoisted(() => ({ changes: true }));

vi.mock('../../../src/app/pixi/lighting/ExploredTexture', () => ({
  ExploredTexture: class {
    readonly texture = {};
    add(): void {}
    clear(): void {}
    draw(): void {}
    toCanvas(): object { return {}; }
    destroy(): void {}
    decode(): Promise<{ destroy(): void }> {
      return Promise.resolve({ destroy: () => undefined });
    }
  },
}));
vi.mock('../../../src/app/pixi/lighting/ExploredSteps', () => ({
  ExploredSteps: class {
    size = 0;
    full = false;
    sightRecorded(): void {}
    apply(): boolean {
      if (!texture.changes) return false;
      this.size++;
      return true;
    }
    leads(): boolean { return this.size > 0; }
    travel(): void {}
    clear(): void { this.size = 0; }
  },
}));
vi.mock('../../../src/app/pixi/lighting/exploredMaskSaving', () => ({ saveExploredMask: (): string => 'data:image/png;base64,saved' }));
vi.mock('../../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));

import { ExploredMemory } from '../../../src/app/pixi/lighting/ExploredMemory';
import { ForgottenFloors } from '../../../src/app/pixi/lighting/ForgottenFloors';
import { exploredMaskOf } from '../../../src/app/levels/sceneLevels';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const level = (id: string, bottom: number): SceneLevel => ({ id, name: id, elevation: { bottom, top: bottom + 10 }, background: `maps/${id}.webp` });
const mask = (name: string): string => `data:image/png;base64,${name}`;

/** A scene of three floors, each with a saved memory, the view on the middle one. */
function scene(): { store: ViewAtlasStore; memory: ExploredMemory } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `forget-levels-${Math.random()}`);
  store.setState({ persistenceEnabled: false, mapPath: 'maps/keep.atlasmap' });
  const state = store.getState();
  state.setLevels([level('cellar', -10), level('ground', 0), level('tower', 10)]);
  for (const id of ['cellar', 'ground', 'tower']) state.setExploredMask(mask(id), id);
  state.setViewedLevel('ground');
  const memory = new ExploredMemory({
    renderer: {} as Renderer, store, onTexture: vi.fn(), onTravel: vi.fn(), onChange: vi.fn(), guard: (work) => work(),
    floors: new ForgottenFloors(store),
  });
  memory.sync({ width: 100, height: 100 }, mask('ground'), 'ground');
  return { store, memory };
}

const others = (store: ViewAtlasStore): (string | null)[] => ['cellar', 'tower'].map((id) => exploredMaskOf(store.getState(), id));

describe('Forget explored areas on a scene with floors', () => {
  it('forgets every floor, and undo and redo take the other floors along with the one shown', async () => {
    texture.changes = true;
    const { store, memory } = scene();
    await Promise.resolve();

    memory.reset();
    expect(others(store)).toEqual([null, null]);
    expect(store.getState().exploredForgotten).toBe(1);

    const history = getHistoryStore(store)!.getState();
    history.undo();
    expect(others(store)).toEqual([mask('cellar'), mask('tower')]);
    getHistoryStore(store)!.getState().redo();
    expect(others(store)).toEqual([null, null]);
    expect(store.getState().exploredForgotten).toBe(2);
    memory.destroy();
  });

  it('forgets the other floors for good where the floor shown held nothing to forget', async () => {
    texture.changes = false;
    const { store, memory } = scene();
    await Promise.resolve();

    memory.reset();
    expect(others(store)).toEqual([null, null]);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
    memory.destroy();
  });

  it('leaves the other floors alone when an edit made after the forget was undone is undone in turn', async () => {
    texture.changes = true;
    const { store, memory } = scene();
    await Promise.resolve();

    memory.reset();
    getHistoryStore(store)!.getState().undo();
    // A reveal now takes the number the undone forget had.
    memory.edit({ mode: 'reveal', area: 'everything' });
    store.getState().setExploredMask(mask('tower seen since'), 'tower');
    getHistoryStore(store)!.getState().undo();
    getHistoryStore(store)!.getState().redo();
    expect(others(store)).toEqual([mask('cellar'), mask('tower seen since')]);
    expect(store.getState().exploredForgotten).toBe(1);
    memory.destroy();
  });

  it('undo leaves a floor as it is where its memory was saved again since', async () => {
    texture.changes = true;
    const { store, memory } = scene();
    await Promise.resolve();

    memory.reset();
    store.getState().setExploredMask(mask('tower seen since'), 'tower');
    getHistoryStore(store)!.getState().undo();
    expect(others(store)).toEqual([mask('cellar'), mask('tower seen since')]);
    memory.destroy();
  });
});
