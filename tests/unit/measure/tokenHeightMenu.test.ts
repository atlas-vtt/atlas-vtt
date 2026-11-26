import { describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../../src/app/grid/measurementFormat';
import type { ContextMenuEntry } from '../../../src/app/react/components/context-menu/AtlasContextMenu';
import { tokenHeightSubmenu } from '../../../src/app/react/components/context-menu/tokenHeightMenu';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { Character } from '../../../src/app/types';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'alternating', rangeBands: [], coneAngle: 90 };

function character(id: string, elevation?: number): Character {
  return { id, kind: 'character', name: id, imagePath: `${id}.png`, x: 0, y: 0, ...(elevation !== undefined && { elevation }) };
}

function createStore(): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `height-${Math.random()}`);
  const tokens = { hero: character('hero'), wyvern: character('wyvern', 30), bat: character('bat', 10) };
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens } });
  getHistoryStore(store)!.getState().clear();
  return store;
}

type MenuItem = Extract<ContextMenuEntry, { type: 'item' }>;

function rows(entry: ContextMenuEntry | null): { height: MenuItem; floor: MenuItem } {
  if (entry?.type !== 'submenu') throw new Error('expected a submenu');
  const [height, floor] = (typeof entry.children === 'function' ? entry.children() : entry.children) as MenuItem[];
  return { height: height!, floor: floor! };
}

const heights = (store: ViewAtlasStore): (number | undefined)[] => ['hero', 'wyvern', 'bat'].map((id) => store.getState().objects.tokens[id]?.elevation);

describe('tokenHeightSubmenu', () => {
  it('steps one token by a cell\'s distance, through the floor, and takes the field away on the floor', () => {
    const store = createStore();
    const menu = tokenHeightSubmenu(store, ['hero'], () => FEET);
    expect(menu).toMatchObject({ type: 'submenu', label: 'Height' });
    expect(rows(menu).height.stepper).toMatchObject({ value: '0ft', label: 'Height', canDecrement: true });
    expect(rows(menu).floor.disabled).toBe(true);

    rows(menu).height.stepper!.onIncrement();
    rows(menu).height.stepper!.onIncrement();
    expect(heights(store)[0]).toBe(10);
    expect(rows(menu).height.stepper!.value).toBe('10ft');
    expect(rows(menu).floor.disabled).toBe(false);

    for (let i = 0; i < 3; i++) rows(menu).height.stepper!.onDecrement();
    expect(heights(store)[0]).toBe(-5);
    expect(rows(menu).height.stepper!.value).toBe('−5ft');

    rows(menu).height.stepper!.onIncrement();
    expect(heights(store)[0]).toBeUndefined();
    expect(JSON.parse(JSON.stringify(store.getState().objects.tokens.hero))).not.toHaveProperty('elevation');
  });

  it('steps every token of a selection from its own height, in one undo step', () => {
    const store = createStore();
    const history = getHistoryStore(store)!;
    const menu = tokenHeightSubmenu(store, ['hero', 'wyvern', 'bat'], () => FEET);
    expect(rows(menu).height.stepper!.value).toBe('0ft–30ft');

    rows(menu).height.stepper!.onIncrement();
    expect(heights(store)).toEqual([5, 35, 15]);
    expect(history.getState().pastStates).toHaveLength(1);
    history.getState().undo();
    expect(heights(store)).toEqual([undefined, 30, 10]);
    history.getState().redo();
    expect(heights(store)).toEqual([5, 35, 15]);
  });

  it('puts the whole selection on the floor in one undo step', () => {
    const store = createStore();
    const history = getHistoryStore(store)!;
    const { floor } = rows(tokenHeightSubmenu(store, ['hero', 'wyvern', 'bat', 'gone'], () => FEET));
    expect(floor).toMatchObject({ label: 'On the floor', disabled: false, keepOpen: true });
    floor.onClick();
    expect(heights(store)).toEqual([undefined, undefined, undefined]);
    expect(history.getState().pastStates).toHaveLength(1);
    history.getState().undo();
    expect(heights(store)).toEqual([undefined, 30, 10]);
  });

  it('steps in the scene\'s own distance per cell and writes its unit', () => {
    const store = createStore();
    const metres: MeasurementSettings = { ...FEET, unitType: 'meters', unitDistance: 1.5 };
    const menu = tokenHeightSubmenu(store, ['hero'], () => metres);
    for (let i = 0; i < 3; i++) rows(menu).height.stepper!.onIncrement();
    expect(heights(store)[0]).toBe(4.5);
    expect(rows(menu).height.stepper!.value).toBe('4.5m');
  });

  it('stays open and follows the tokens', () => {
    const store = createStore();
    const menu = tokenHeightSubmenu(store, ['wyvern'], () => FEET);
    if (menu?.type !== 'submenu') throw new Error('expected a submenu');
    let changes = 0;
    const stop = menu.subscribe?.(() => { changes += 1; });
    expect(rows(menu).height.keepOpen).toBe(true);
    rows(menu).height.stepper!.onDecrement();
    expect(changes).toBe(1);
    expect(rows(menu).height.stepper!.value).toBe('25ft');
    store.getState().setSelection(['wyvern']);
    expect(changes).toBe(1);
    stop?.();
  });

  it('steps from range band to range band where the map measures in bands, and names the height by its band', () => {
    const bands: MeasurementSettings = { ...FEET, mode: 'abstract', rangeBands: [{ name: 'Melee', maxSquares: 1 }, { name: 'Close', maxSquares: 6 }, { name: 'Far', maxSquares: 20 }] };
    const store = createStore();
    const menu = tokenHeightSubmenu(store, ['hero'], () => bands);
    expect(menu).toMatchObject({ type: 'submenu', label: 'Height' });
    expect(rows(menu).height.stepper!.value).toBe('–');
    rows(menu).height.stepper!.onIncrement();
    expect(rows(menu).height.stepper!.value).toBe('Melee');
    rows(menu).height.stepper!.onIncrement();
    expect(heights(store)[0]).toBe(30);
    expect(rows(menu).height.stepper!.value).toBe('Close');
    for (let i = 0; i < 3; i++) rows(menu).height.stepper!.onDecrement();
    expect(rows(menu).height.stepper!.value).toBe('−Melee');
  });

  it('is not offered where a cell spans no distance', () => {
    expect(tokenHeightSubmenu(createStore(), ['wyvern'], () => ({ ...FEET, unitDistance: 0 }))).toBeNull();
  });
});
