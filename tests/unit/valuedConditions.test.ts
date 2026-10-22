import { describe, expect, it } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { conditionsSubmenu } from '../../src/app/react/components/context-menu/conditionsMenu';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';
import { dropUnknownConditions } from '../../src/app/services/collectionConditionCleanup';
import { parseUserPreset } from '../../src/app/gameSystems/presetValidation';
import { sameSystemRules } from '../../src/app/gameSystems/systemRules';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';
import type { Character } from '../../src/app/types';
import { conditionLabel, removeCondition, setConditionValue, type TokenConditionState } from '../../src/app/utils/conditionValues';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const frightened: ConditionDefinition = { id: 'frightened', name: 'Frightened', color: '#6d28d9', valued: true };
const prone: ConditionDefinition = { id: 'prone', name: 'Prone', color: '#d97706' };

describe('condition values', () => {
  it('labels valued conditions with their number', () => {
    expect(conditionLabel(frightened, 2)).toBe('Frightened 2');
    expect(conditionLabel(prone, 2)).toBe('Prone');
  });

  it('sets, raises and removes a valued condition, dropping empty fields', () => {
    const token: TokenConditionState = { conditions: ['prone'] };
    setConditionValue(token, 'frightened', 2, true);
    expect(token).toEqual({ conditions: ['prone', 'frightened'], conditionValues: { frightened: 2 } });
    setConditionValue(token, 'frightened', 0, true);
    expect(token).toEqual({ conditions: ['prone'] });
    removeCondition(token, 'prone');
    expect(token).toEqual({});
  });
});

function character(id: string, extra: Partial<Character> = {}): Character {
  return { id, kind: 'character', name: id, imagePath: `${id}.png`, x: 0, y: 0, ...extra };
}

function createStore() {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `valued-${Math.random()}`);
  const tokens = {
    a: character('a', { conditions: ['frightened'], conditionValues: { frightened: 2 } }),
    b: character('b'),
  };
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens } });
  return store;
}

type MenuItem = Extract<ContextMenuEntry, { type: 'item' }>;
const frightenedItem = (entry: ContextMenuEntry): MenuItem => {
  if (entry.type !== 'submenu') throw new Error('expected a submenu');
  const children = typeof entry.children === 'function' ? entry.children() : entry.children;
  return children.find((child): child is MenuItem => child.type === 'item' && child.label.startsWith('Frightened'))!;
};

describe('changeTokensConditionValue', () => {
  it('steps every token in one undo step: holders change, others gain it at 1', () => {
    const store = createStore();
    const pastBefore = getHistoryStore(store)?.getState().pastStates.length ?? 0;
    store.getState().changeTokensConditionValue(['a', 'b'], 'frightened', 1);
    const { a, b } = store.getState().objects.tokens;
    expect(a).toMatchObject({ conditions: ['frightened'], conditionValues: { frightened: 3 } });
    expect(b).toMatchObject({ conditions: ['frightened'], conditionValues: { frightened: 1 } });
    expect(getHistoryStore(store)?.getState().pastStates.length ?? 0).toBe(pastBefore + 1);
  });

  it('removes the condition from tokens that fall to 0', () => {
    const store = createStore();
    store.getState().changeTokensConditionValue(['a'], 'frightened', -2);
    expect(store.getState().objects.tokens.a).not.toHaveProperty('conditions');
    expect(store.getState().objects.tokens.a).not.toHaveProperty('conditionValues');
  });

  it('turning a valued condition off clears its number too', () => {
    const store = createStore();
    store.getState().setTokensCondition(['a'], 'frightened', false);
    expect(store.getState().objects.tokens.a).not.toHaveProperty('conditionValues');
  });
});

describe('setTokensConditionValue', () => {
  it('sets every token to the value in one undo step, adding the condition where it was not', () => {
    const store = createStore();
    const pastBefore = getHistoryStore(store)?.getState().pastStates.length ?? 0;
    store.getState().setTokensConditionValue(['a', 'b'], 'frightened', 1);
    const { a, b } = store.getState().objects.tokens;
    expect(a).toMatchObject({ conditions: ['frightened'], conditionValues: { frightened: 1 } });
    expect(b).toMatchObject({ conditions: ['frightened'], conditionValues: { frightened: 1 } });
    expect(getHistoryStore(store)?.getState().pastStates.length ?? 0).toBe(pastBefore + 1);
  });

  it('takes the condition and its number off for null or 0', () => {
    const store = createStore();
    store.getState().setTokensConditionValue(['a'], 'frightened', null);
    expect(store.getState().objects.tokens.a).not.toHaveProperty('conditions');
    expect(store.getState().objects.tokens.a).not.toHaveProperty('conditionValues');
  });
});

describe('conditions menu stepper', () => {
  it('shows the shared value or the range and steps all tokens', () => {
    const store = createStore();
    const menu = conditionsSubmenu(store, [frightened, prone], ['a', 'b']);
    expect(frightenedItem(menu).stepper).toMatchObject({ value: '2', canDecrement: true });

    frightenedItem(menu).stepper!.onIncrement();
    expect(frightenedItem(menu).stepper?.value).toBe('1–3');
    expect(frightenedItem(menu).checked).toBe(true);
  });

  it('offers no stepper on plain conditions and starts at 0 when no token has it', () => {
    const store = createStore();
    const menu = conditionsSubmenu(store, [frightened, prone], ['b']);
    expect(frightenedItem(menu).stepper).toMatchObject({ value: '0', canDecrement: false });
    if (menu.type !== 'submenu' || typeof menu.children !== 'function') throw new Error('expected a live submenu');
    expect(menu.children().find((c) => c.type === 'item' && c.label === 'Prone')).not.toHaveProperty('stepper');
  });
});

describe('valued conditions in presets and cleanup', () => {
  it('drops the number of a condition the collection no longer defines', () => {
    const tokens: Record<string, TokenConditionState> = { a: { conditions: ['frightened', 'prone'], conditionValues: { frightened: 2 } } };
    expect(dropUnknownConditions(tokens, new Set(['prone']))).toBe(true);
    expect(tokens.a).toEqual({ conditions: ['prone'] });
  });

  it('keeps the flag in stored presets and treats it as part of the rules', () => {
    const preset = parseUserPreset({
      id: 'p', name: 'P', rules: { gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' }, conditions: [frightened] },
    });
    expect(preset?.rules.conditions[0]).toMatchObject({ valued: true });
    const plain = { ...preset!.rules, conditions: [{ ...frightened, valued: undefined }] };
    expect(sameSystemRules(preset!.rules, plain)).toBe(false);
  });
});
