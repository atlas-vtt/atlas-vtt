// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Renderer } from 'pixi.js';

vi.mock('../../../../src/app/pixi/lighting/ExploredTexture', async (original) => ({
  ...(await original<object>()),
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
vi.mock('../../../../src/app/pixi/lighting/ExploredSteps', () => ({
  ExploredSteps: class {
    size = 0;
    full = false;
    sightRecorded(): void {}
    apply(): boolean {
      this.size++;
      return true;
    }
    leads(): boolean { return this.size > 0; }
    travel(): void {}
    clear(): void { this.size = 0; }
  },
}));
vi.mock('../../../../src/app/pixi/lighting/exploredMaskSaving', () => ({ saveExploredMask: (): string => 'data:image/png;base64,saved' }));
vi.mock('../../../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));

import { ExploredMemory } from '../../../../src/app/pixi/lighting/ExploredMemory';
import { ForgottenFloors } from '../../../../src/app/pixi/lighting/ForgottenFloors';
import { KeptMemories } from '../../../../src/app/online/gm/memory/KeptMemories.ts';
import { memoryFloorOf, PlayerMemoryEdits } from '../../../../src/app/online/gm/memory/PlayerMemoryEdits.ts';
import { createViewAtlasStore } from '../../../../src/app/storeFactory';
import { getHistoryStore } from '../../../../src/app/stores/history';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { FAKE_IMAGES, fakeFiles, FakeMemoryStore, fakePng, rememberedCells } from './fakeMemory.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const MAP = { width: 1000, height: 1000 };
const KEEP = 'maps/keep.atlasmap';
const GROUND = { mapPath: KEEP, level: 'ground' };
const CELLAR = { mapPath: KEEP, level: 'cellar' };
const ALL = fakePng(new Uint8Array(10 * 10).fill(255));

const level = (id: string, bottom: number): SceneLevel => ({ id, name: id, elevation: { bottom, top: bottom + 10 }, background: `maps/${id}.webp` });

/**
 * A keep of two floors, the GM's view on the ground floor, whose edits by hand reach the players' memories kept
 * in `files`: Ana remembers the whole ground floor, Ben the whole cellar, though nobody is at a table now.
 */
function keep(): { readonly memory: ExploredMemory; readonly files: FakeMemoryStore; readonly history: ReturnType<typeof getHistoryStore> } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `player-memory-undo-${Math.random()}`);
  store.setState({ persistenceEnabled: false, mapPath: KEEP });
  store.getState().setLevels([level('cellar', -10), level('ground', 0)]);
  store.getState().setViewedLevel('ground');
  const files = new FakeMemoryStore();
  files.files.set(FakeMemoryStore.key(GROUND, ANA), ALL);
  files.files.set(FakeMemoryStore.key(CELLAR, BEN), ALL);
  const players = new PlayerMemoryEdits(new KeptMemories(fakeFiles(files), FAKE_IMAGES), () => memoryFloorOf(store.getState()));
  const memory = new ExploredMemory({ renderer: {} as Renderer, store, onTexture: vi.fn(), onTravel: vi.fn(), onChange: vi.fn(), guard: (work) => work(), floors: new ForgottenFloors(store, players) });
  memory.sync(MAP, null, 'ground');
  return { memory, files, history: getHistoryStore(store) };
}

/** Lets the changes asked for run: the stand-in files answer at once. */
const settled = async (): Promise<void> => {
  for (let tick = 0; tick < 50; tick += 1) await Promise.resolve();
};

const cellsOf = (files: FakeMemoryStore, floor: typeof GROUND, player: string): { readonly x: number }[] => rememberedCells(MAP, files.files.get(FakeMemoryStore.key(floor, player)) ?? null);

describe('each player\'s own memory under the GM\'s edits by hand, with no table running', () => {
  it('loses what an erase takes, gets it back on undo and loses it again on redo, in the same undo steps as the party\'s', async () => {
    const { memory, files, history } = keep();
    expect(memory.edit({ mode: 'forget', area: { type: 'rectangle', x: 0, y: 0, width: 500, height: 1000 } })).toBe(true);
    await settled();
    expect(cellsOf(files, GROUND, ANA).every(({ x }) => x > 500)).toBe(true);
    expect(cellsOf(files, GROUND, ANA)).toHaveLength(50);
    expect(cellsOf(files, CELLAR, BEN)).toHaveLength(100);
    history?.getState().undo();
    await settled();
    expect(cellsOf(files, GROUND, ANA)).toHaveLength(100);
    history?.getState().redo();
    await settled();
    expect(cellsOf(files, GROUND, ANA)).toHaveLength(50);
  });

  it('takes nothing for a reveal, and an undo of it gives nothing back nor takes anything', async () => {
    const { memory, files, history } = keep();
    files.files.set(FakeMemoryStore.key(GROUND, ANA), fakePng(new Uint8Array(10 * 10).fill(255, 0, 50)));
    memory.edit({ mode: 'reveal', area: 'everything' });
    history?.getState().undo();
    await settled();
    expect(cellsOf(files, GROUND, ANA)).toHaveLength(50);
  });

  it('forgets every floor on Forget explored areas, and gives every floor back on undo', async () => {
    const { memory, files, history } = keep();
    memory.reset();
    await settled();
    expect([...files.files.keys()]).toEqual([]);
    history?.getState().undo();
    await settled();
    expect(cellsOf(files, GROUND, ANA)).toHaveLength(100);
    expect(cellsOf(files, CELLAR, BEN)).toHaveLength(100);
  });
});
