import { describe, expect, it } from 'vitest';
import { playersEntryToken } from '../../src/app/services/playerInitiativeList';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

describe('hiding a combatant from the players and resetting the numbers', () => {
  it('leaves a combatant the GM hid out of the players\' list, whatever it is', () => {
    expect(playersEntryToken({ partyMemberId: 'mira' }, {}, [])).not.toBeNull();
    expect(playersEntryToken({ partyMemberId: 'mira', hiddenFromPlayers: true }, {}, [])).toBeNull();
    expect(playersEntryToken({ hiddenFromPlayers: true }, {}, [])).toBeNull();
  });

  it('ends the fight and empties every number and condition, keeping the combatants', () => {
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, 'initiative-reset');
    store.getState().setPersistenceEnabled(false);
    store.getState().addToInitiative({ partyMemberId: 'mira', name: 'Mira', initiative: 12, initiativeModifier: 0, imagePath: '', isNPC: false });
    store.getState().addToInitiative({ name: 'Enemy 1', initiative: 7, initiativeModifier: 0, imagePath: '', isNPC: true });
    store.getState().startCombat();
    const enemy = store.getState().initiative.entries.find((entry) => entry.name === 'Enemy 1')!.id;
    store.getState().setCombatantConditionTurns(enemy, 'prone', 2);
    expect(store.getState().initiative.entries.find((entry) => entry.id === enemy)?.conditions).toEqual(['prone']);
    store.getState().resetInitiativeNumbers();
    const reset = store.getState().initiative.entries.find((entry) => entry.id === enemy)!;
    expect([reset.conditions, reset.conditionTurns]).toEqual([undefined, undefined]);
    const { initiative } = store.getState();
    expect(initiative.isActive).toBe(false);
    expect(initiative.entries.map((entry) => [entry.name, entry.initiative, entry.awaitingInitiative])).toEqual([['Mira', 0, true], ['Enemy 1', 0, true]]);
  });
});

describe('turns pass a combatant hidden from the players by', () => {
  it('goes from the one before it to the one after', () => {
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, 'initiative-hidden-turn');
    store.getState().setPersistenceEnabled(false);
    for (const [name, initiative] of [['A', 20], ['B', 15], ['C', 10]] as const) {
      store.getState().addToInitiative({ name, initiative, initiativeModifier: 0, imagePath: '', isNPC: true });
    }
    const id = (name: string): string => store.getState().initiative.entries.find((entry) => entry.name === name)!.id;
    store.getState().updateInitiativeEntry(id('B'), { hiddenFromPlayers: true });
    store.getState().startCombat();
    const turn = (): string | undefined => store.getState().initiative.entries.find((entry) => entry.isActive)?.name;
    expect(turn()).toBe('A');
    store.getState().nextTurn();
    expect(turn()).toBe('C');
    store.getState().previousTurn();
    expect(turn()).toBe('A');
  });
});
