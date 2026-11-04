import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import {
  createInitialLootRollerState,
  createLootRollerActions,
  LOOT_MAX_COUNT,
  readLootRollerState,
  type LootRollerSlice,
} from '../../src/app/stores/lootRollerSlice';
import type { LootRoll } from '../../src/app/loot/lootHistory';

function roll(id: string): LootRoll {
  return { id, rolledAt: 1, mapName: 'Crypt', draws: [{ id: `${id}-1`, notePath: 'Items/Rope.md', source: ['Items', 'Gear'], name: 'Rope', properties: [] }] };
}

function harness(): { state: () => Pick<LootRollerSlice, 'lootRoller'>; actions: ReturnType<typeof createLootRollerActions> } {
  let state: Pick<LootRollerSlice, 'lootRoller'> = { lootRoller: createInitialLootRollerState() };
  const actions = createLootRollerActions((fn) => { state = produce(state, fn); });
  return { state: () => state, actions };
}

describe('readLootRollerState', () => {
  it('falls back to the defaults for data it does not know', () => {
    expect(readLootRollerState(undefined)).toEqual(createInitialLootRollerState());
    expect(readLootRollerState('open')).toEqual(createInitialLootRollerState());
  });

  it('keeps valid fields and drops broken ones', () => {
    const state = readLootRollerState({
      open: true,
      position: { x: 10, y: 'top' },
      disabledViews: ['Items.base#Armor', 3],
      excludedRarities: ['Very rare', 'epic'],
      count: 99,
      pane: 'history',
      lastRoll: { id: 'broken' },
    });
    expect(state).toEqual({ open: true, disabledViews: [], excludedRarities: ['very rare', 'epic'], count: LOOT_MAX_COUNT, pane: 'history' });
  });

  it('keeps a resized window size and drops an impossible one', () => {
    expect(readLootRollerState({ size: { width: 900, height: 700 } }).size).toEqual({ width: 900, height: 700 });
    expect(readLootRollerState({ size: { width: -1, height: 700 } }).size).toBeUndefined();
  });

  it('keeps the latest roll', () => {
    expect(readLootRollerState({ lastRoll: roll('a') }).lastRoll).toEqual(roll('a'));
  });
});

describe('loot roller actions', () => {
  it('opens and closes the window', () => {
    const { state, actions } = harness();
    actions.setLootRollerOpen(true);
    expect(state().lootRoller.open).toBe(true);
  });

  it('keeps the item count between 1 and the maximum', () => {
    const { state, actions } = harness();
    actions.updateLootRoller({ count: 0, excludedRarities: ['legendary'] });
    expect(state().lootRoller).toMatchObject({ count: 1, excludedRarities: ['legendary'] });
    actions.updateLootRoller({ count: LOOT_MAX_COUNT + 5 });
    expect(state().lootRoller.count).toBe(LOOT_MAX_COUNT);
  });

  it('shows a new roll in the latest roll pane', () => {
    const { state, actions } = harness();
    actions.updateLootRoller({ pane: 'history' });
    actions.showLootRoll(roll('a'));
    expect(state().lootRoller).toMatchObject({ pane: 'results', lastRoll: roll('a') });
  });
});
