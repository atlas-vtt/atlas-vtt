import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { DiceRollResult } from '../../src/app/types/diceTypes';
import type { AnyWidget } from '../../src/app/types/widgetTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const path = 'maps/cave.atlasmap';
const roll = (id: string, rolledBy?: string): DiceRollResult => ({
  id, timestamp: 1, formula: '1d20', rolls: [{ die: 'd20', value: 3 } as never], modifiers: 0, total: 3, ...(rolledBy && { rolledBy }),
});

afterEach(() => { vi.useRealTimers(); });

/** A loaded map whose first save has settled; `writes` counts map-file rewrites from then on. */
async function loadedMap(): Promise<{ store: ViewAtlasStore; writes: () => number; settle: () => Promise<void> }> {
  vi.useFakeTimers();
  const { app } = createInMemoryApp({ files: { [path]: '{}' } });
  const store = createViewAtlasStore(app, `unchanged-slice-${Math.random()}`);
  store.setState({ mapPath: path, mapLoaded: true, persistenceEnabled: true });
  const settle = async (): Promise<void> => { await vi.advanceTimersByTimeAsync(2000); };
  await settle();
  const process = vi.mocked(app.vault.process);
  process.mockClear();
  return { store, writes: () => process.mock.calls.length, settle };
}

describe('map file saves', () => {
  it('does not rewrite the map file for a change to nothing it saves', async () => {
    const { store, writes, settle } = await loadedMap();
    store.getState().setSelection(['a']);
    await settle();
    store.getState().setSelection([]);
    await settle();
    expect(writes()).toBe(0);
  });

  it('does not rewrite it for a roll by someone else, which stays in memory', async () => {
    const { store, writes, settle } = await loadedMap();
    store.getState().addDiceLogEntry(roll('theirs', 'Ana'));
    await settle();
    expect(store.getState().diceLog).toHaveLength(1);
    expect(writes()).toBe(0);
  });

  it('does not rewrite it while the scene keeps collection widgets, which are saved elsewhere', async () => {
    const { store, writes, settle } = await loadedMap();
    const shared = { id: 'w', type: 'counter', scope: 'collection', value: 0 } as unknown as AnyWidget;
    store.getState().addWidget(shared);
    await settle();
    const after = writes();
    store.getState().setSelection(['a']);
    await settle();
    expect(writes()).toBe(after);
  });

  it('still rewrites it once for a change it saves', async () => {
    const { store, writes, settle } = await loadedMap();
    store.getState().addDiceLogEntry(roll('mine'));
    await settle();
    expect(writes()).toBe(1);
    store.getState().setSelection(['a']);
    await settle();
    expect(writes()).toBe(1);
  });
});
