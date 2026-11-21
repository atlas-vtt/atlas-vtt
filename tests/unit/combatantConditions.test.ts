import { describe, expect, it } from 'vitest';
import { entryConditions, setCombatantCondition } from '../../src/app/initiative/combatantConditions';
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
    initiative: { isActive: true, round: 1, currentIndex: 0, entries: [entry('a', 0, { tokenId: 'g' }), entry('b', 1)] } as TurnStoreState['initiative'],
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

  it('last as the turns pass, until taken away', () => {
    let state = fight();
    setCombatantCondition(state, 'a', 'poisoned', true);
    const set = (fn: (draft: TurnStoreState) => void): void => { const next = structuredClone(state); fn(next); state = next; };
    const actions = createInitiativeTurnActions(set, () => state, () => 0.5);
    for (let turn = 0; turn < 5; turn++) actions.nextTurn();
    actions.previousTurn();
    expect(state.objects.tokens.g?.conditions).toEqual(['poisoned']);
    set((draft) => setCombatantCondition(draft, 'a', 'poisoned', false));
    expect(state.objects.tokens.g?.conditions).toBeUndefined();
  });
});
