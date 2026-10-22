// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'pixi.js';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { conditionsSubmenu } from '../../src/app/react/components/context-menu/conditionsMenu';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';
import { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';
import type { Character, TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let restoreGraphics: (() => void) | undefined;

afterEach(() => {
  restoreGraphics?.();
  restoreGraphics = undefined;
  vi.restoreAllMocks();
});

const definitions: ConditionDefinition[] = [
  { id: 'poisoned', name: 'Poisoned', color: '#27ae60' },
  { id: 'prone', name: 'Prone', color: '#8e44ad' },
];

function character(id: string, conditions?: string[]): Character {
  return { id, kind: 'character', name: id, imagePath: `${id}.png`, x: 0, y: 0, ...(conditions && { conditions }) };
}

function createStore() {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `conditions-${Math.random()}`);
  const tokens = { a: character('a', ['poisoned']), b: character('b'), c: character('c', ['poisoned', 'prone']) };
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens } });
  return store;
}

type MenuItem = Extract<ContextMenuEntry, { type: 'item' }>;

function items(entry: ContextMenuEntry): MenuItem[] {
  if (entry.type !== 'submenu') throw new Error('expected a submenu');
  const children = typeof entry.children === 'function' ? entry.children() : entry.children;
  return children.filter((child): child is MenuItem => child.type === 'item');
}

describe('setTokensCondition', () => {
  it('adds a condition to every token in one undo step, keeping each token order', () => {
    const store = createStore();
    const steps = getHistoryStore(store)!.getState().pastStates.length;
    store.getState().setTokensCondition(['a', 'b', 'c'], 'prone', true);
    const tokens = store.getState().objects.tokens;
    expect(tokens.a?.conditions).toEqual(['poisoned', 'prone']);
    expect(tokens.b?.conditions).toEqual(['prone']);
    expect(tokens.c?.conditions).toEqual(['poisoned', 'prone']);
    expect(getHistoryStore(store)!.getState().pastStates.length).toBe(steps + 1);
  });

  it('removes a condition from every token and drops emptied lists', () => {
    const store = createStore();
    const unchanged = store.getState().objects.tokens.b;
    store.getState().setTokensCondition(['a', 'b', 'c'], 'poisoned', false);
    const tokens = store.getState().objects.tokens;
    expect(tokens.a?.conditions).toBeUndefined();
    expect(tokens.b).toBe(unchanged);
    expect(tokens.c?.conditions).toEqual(['prone']);
  });
});

describe('conditionsSubmenu', () => {
  it('shows shared and partial conditions of a multi-token selection', () => {
    const store = createStore();
    const menu = conditionsSubmenu(store, definitions, ['a', 'b', 'c']);
    expect(menu).toMatchObject({ label: 'Conditions (3 tokens)' });
    expect(items(menu).map(({ label, checked }) => ({ label, checked }))).toEqual([
      { label: 'Poisoned (2/3)', checked: false },
      { label: 'Prone (1/3)', checked: false },
    ]);
  });

  it('adds a partial condition to all tokens, then removes it from all', () => {
    const store = createStore();
    items(conditionsSubmenu(store, definitions, ['a', 'b', 'c']))[0]!.onClick();
    expect(['a', 'b', 'c'].every((id) => store.getState().objects.tokens[id]?.conditions?.includes('poisoned'))).toBe(true);

    const poisoned = items(conditionsSubmenu(store, definitions, ['a', 'b', 'c']))[0]!;
    expect(poisoned).toMatchObject({ label: 'Poisoned', checked: true });
    poisoned.onClick();
    expect(['a', 'b', 'c'].some((id) => store.getState().objects.tokens[id]?.conditions?.includes('poisoned'))).toBe(false);
  });

  it('stays open and follows the tokens while conditions are toggled', () => {
    const store = createStore();
    const menu = conditionsSubmenu(store, definitions, ['a', 'b', 'c']);
    if (menu.type !== 'submenu') throw new Error('expected a submenu');
    let changes = 0;
    const unsubscribe = menu.subscribe?.(() => { changes += 1; });

    const poisoned = items(menu)[0]!;
    expect(poisoned).toMatchObject({ keepOpen: true });
    expect(poisoned.leading).toBeTruthy();
    poisoned.onClick();

    expect(changes).toBe(1);
    expect(items(menu)[0]).toMatchObject({ label: 'Poisoned', checked: true });
    unsubscribe?.();
  });

  it('toggles a single token as before', () => {
    const store = createStore();
    const menu = conditionsSubmenu(store, definitions, ['b']);
    expect(menu).toMatchObject({ label: 'Conditions' });
    items(menu)[1]!.onClick();
    expect(store.getState().objects.tokens.b?.conditions).toEqual(['prone']);
  });
});

describe('token updates', () => {
  const hasTokenChanged = (token: TokenEntity, prev: TokenEntity): boolean =>
    (TokenRenderer.prototype as unknown as { hasTokenChanged(a: TokenEntity, b: TokenEntity): boolean }).hasTokenChanged(token, prev);

  it('treats a gained or lost condition as a change the renderer must apply', () => {
    expect(hasTokenChanged(character('a', ['poisoned']), character('a'))).toBe(true);
    expect(hasTokenChanged(character('a'), character('a', ['poisoned']))).toBe(true);
    expect(hasTokenChanged(character('a', ['poisoned']), character('a', ['poisoned']))).toBe(false);
  });

  it('redraws condition badges when the collection definitions change', () => {
    restoreGraphics = stubJsdomGraphics();
    vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({ width: 80, height: 20 } as never);
    const store = createStore();
    let defs: ConditionDefinition[] = [];
    const ui = new TokenUIRenderer(store);
    ui.conditionDefsProvider = () => defs;
    try {
      ui.update(character('a', ['poisoned']), 62);
      const ring = (ui as unknown as { conditionUI: { ring: { container: { children: unknown[] } } } }).conditionUI.ring.container;
      expect(ring.children).toHaveLength(0);
      defs = definitions;
      ui.refreshConditions();
      expect(ring.children).toHaveLength(1);
    } finally {
      ui.destroy();
    }
  });
});
