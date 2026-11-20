import { describe, expect, it } from 'vitest';
import { countDownConditions, entryConditions, setCombatantCondition, setCombatantConditionTurns } from '../../src/app/initiative/combatantConditions';
import { createInitiativeTurnActions, type TurnStoreState } from '../../src/app/stores/initiativeTurnActions';
import type { TokenEntity } from '../../src/app/types';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';

const POISONED: ConditionDefinition = { id: 'poisoned', name: 'Poisoned', color: '#00ff00' };
const entry = (id: string, order: number, extra: Partial<InitiativeEntry> = {}): InitiativeEntry =>
  ({ id, name: id, initiative: 20 - order, initiativeModifier: 0, imagePath: '', isActive: order === 0, isNPC: false, order, ...extra });
const goblin = { id: 'g', kind: 'character', name: 'Goblin', x: 0, y: 0, imagePath: '' } as TokenEntity;

function fight(): TurnStoreState {
  return {
    initiative: { isActive: true, round: 1, currentIndex: 0, entries: [entry('a', 0, { tokenId: 'g' }), entry('b', 1)], config: { autoSort: true } } as TurnStoreState['initiative'],
    objects: { tokens: { g: { ...goblin } } },
  };
}

describe('conditions given from the tracker', () => {
  it('live on the token where there is one, else on the entry', () => {
    const draft = fight();
    setCombatantCondition(draft, 'a', 'poisoned', true);
    setCombatantCondition(draft, 'b', 'poisoned', true);
    expect(draft.objects.tokens.g?.conditions).toEqual(['poisoned']);
    expect(draft.initiative.entries[1]?.conditions).toEqual(['poisoned']);
    expect(entryConditions(draft.initiative.entries[1]!, undefined, [POISONED]).map((c) => c.name)).toEqual(['Poisoned']);
  });

  it('count down as the holder\'s turn ends and end at 0; others\' turns leave them', () => {
    let state = fight();
    setCombatantConditionTurns(state, 'a', 'poisoned', 2);
    expect(state.objects.tokens.g?.conditions).toEqual(['poisoned']);
    const set = (fn: (draft: TurnStoreState) => void): void => { const next = structuredClone(state); fn(next); state = next; };
    const actions = createInitiativeTurnActions(set, () => state, () => 0.5);
    actions.nextTurn(); // a's turn ends
    expect(state.initiative.entries[0]?.conditionTurns).toEqual({ poisoned: 1 });
    actions.nextTurn(); // b's turn ends
    expect(state.initiative.entries[0]?.conditionTurns).toEqual({ poisoned: 1 });
    actions.nextTurn(); // a's second turn ends
    expect(state.objects.tokens.g?.conditions).toBeUndefined();
    expect(state.initiative.entries[0]?.conditionTurns).toBeUndefined();
  });

  it('count back up as a step back returns to the turn that counted them, and come back once ended', () => {
    let state = fight();
    setCombatantConditionTurns(state, 'a', 'poisoned', 2);
    // b keeps a valued condition on its entry, for one turn
    setCombatantConditionTurns(state, 'b', 'frightened', 1);
    state.initiative.entries[1]!.conditionValues = { frightened: 3 };
    const set = (fn: (draft: TurnStoreState) => void): void => { const next = structuredClone(state); fn(next); state = next; };
    const actions = createInitiativeTurnActions(set, () => state, () => 0.5);
    const turnsOf = (index: number): Record<string, number> | undefined => state.initiative.entries[index]?.conditionTurns;
    actions.nextTurn(); // a's turn ends: 2 → 1
    actions.nextTurn(); // b's turn ends: frightened ends
    actions.nextTurn(); // a's second turn ends: poisoned ends
    expect(state.objects.tokens.g?.conditions).toBeUndefined();
    expect(state.initiative.entries[1]?.conditions).toBeUndefined();
    actions.previousTurn(); // back to a's second turn: poisoned again, one turn left
    expect(state.objects.tokens.g?.conditions).toEqual(['poisoned']);
    expect(turnsOf(0)).toEqual({ poisoned: 1 });
    actions.previousTurn(); // back to b's turn: frightened again, with its number
    expect(state.initiative.entries[1]?.conditions).toEqual(['frightened']);
    expect(state.initiative.entries[1]?.conditionValues).toEqual({ frightened: 3 });
    expect(turnsOf(1)).toEqual({ frightened: 1 });
    actions.previousTurn(); // back to a's first turn: 1 → 2
    expect(turnsOf(0)).toEqual({ poisoned: 2 });
    expect(state.initiative.conditionCountdowns).toBeUndefined();
    // And on again, as before
    actions.nextTurn();
    expect(turnsOf(0)).toEqual({ poisoned: 1 });
  });

  it('give nothing back that the GM took away since, and forget it all when the fight ends', () => {
    let state = fight();
    setCombatantConditionTurns(state, 'a', 'poisoned', 3);
    const set = (fn: (draft: TurnStoreState) => void): void => { const next = structuredClone(state); fn(next); state = next; };
    const actions = createInitiativeTurnActions(set, () => state, () => 0.5);
    actions.nextTurn();
    set((draft) => setCombatantCondition(draft, 'a', 'poisoned', false));
    actions.previousTurn();
    expect(state.objects.tokens.g?.conditions).toBeUndefined();
    setCombatantConditionTurns(state, 'a', 'poisoned', 3);
    actions.nextTurn();
    expect(state.initiative.conditionCountdowns).toBeDefined();
    actions.endCombat();
    expect(state.initiative.conditionCountdowns).toBeUndefined();
  });

  it('drop the count of a condition taken away elsewhere, and last until taken away without one', () => {
    const draft = fight();
    setCombatantConditionTurns(draft, 'b', 'poisoned', 3);
    delete draft.initiative.entries[1]!.conditions;
    countDownConditions(draft, ['b'], null);
    expect(draft.initiative.entries[1]?.conditionTurns).toBeUndefined();
    setCombatantCondition(draft, 'b', 'poisoned', true);
    countDownConditions(draft, ['b'], null);
    expect(draft.initiative.entries[1]?.conditions).toEqual(['poisoned']);
  });
});
