import { describe, expect, it, vi } from 'vitest';
import type { MeasurementSettings } from '../../../src/app/grid/measurementFormat';
import type { KeptMeasure } from '../../../src/app/measure/measureTypes';
import { MAX_MEASURES } from '../../../src/app/measure/measureTypes';
import type { ContextMenuEntry } from '../../../src/app/react/components/context-menu/AtlasContextMenu';
import { tokenAuraSubmenu } from '../../../src/app/react/components/context-menu/tokenAuraMenu';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { Character } from '../../../src/app/types';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const notices = vi.hoisted(() => ({ full: vi.fn() }));
vi.mock('../../../src/app/pixi/measure/measureNotices', () => ({ showMeasuresFullNotice: notices.full }));

const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };
const BANDS: MeasurementSettings = { ...FEET, mode: 'abstract', rangeBands: [{ name: 'Close', maxSquares: 2 }] };

function character(id: string, x: number, size?: number): Character {
  return { id, kind: 'character', name: id, imagePath: `${id}.png`, x, y: 105, ...(size !== undefined && { size }) };
}

function createStore(): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `aura-menu-${Math.random()}`);
  const tokens = { hero: character('hero', 105), ogre: character('ogre', 420, 1.5) };
  store.setState({ persistenceEnabled: false, grid: { ...store.getState().grid!, size: 70 }, objects: { ...store.getState().objects, tokens } });
  getHistoryStore(store)!.getState().clear();
  return store;
}

type MenuItem = Extract<ContextMenuEntry, { type: 'item' }>;

function rows(entry: ContextMenuEntry | null): { aura: MenuItem; none: MenuItem } {
  if (entry?.type !== 'submenu') throw new Error('expected a submenu');
  const [aura, none] = (typeof entry.children === 'function' ? entry.children() : entry.children) as MenuItem[];
  return { aura: aura!, none: none! };
}

const auras = (store: ViewAtlasStore): KeptMeasure[] => Object.values(store.getState().objects.measures ?? {});
const reaches = (store: ViewAtlasStore): Record<string, number | undefined> => Object.fromEntries(auras(store).map((aura) => [aura.follows, aura.aura]));

describe('tokenAuraSubmenu', () => {
  it('gives a token its aura at the first step up, steps it by a cell\'s distance, and takes it away at none', () => {
    const store = createStore();
    const history = getHistoryStore(store)!;
    const menu = tokenAuraSubmenu(store, ['hero'], () => FEET);
    expect(menu).toMatchObject({ type: 'submenu', label: 'Aura' });
    expect(rows(menu).aura.stepper).toMatchObject({ value: '0ft', label: 'Aura', canDecrement: false });
    expect(rows(menu).none.disabled).toBe(true);

    rows(menu).aura.stepper!.onIncrement();
    expect(auras(store)).toHaveLength(1);
    // A kept circle that follows the token: its points are the token's centre and the point a cell past its space.
    expect(auras(store)[0]).toMatchObject({ kind: 'measure', shape: 'circle', follows: 'hero', aura: 5, points: [{ x: 105, y: 105 }, { x: 105 + 35 + 70, y: 105 }] });
    expect(rows(menu).aura.stepper).toMatchObject({ value: '5ft', canDecrement: true });

    rows(menu).aura.stepper!.onIncrement();
    expect(reaches(store)).toEqual({ hero: 10 });
    expect(auras(store)[0]!.points[1]).toEqual({ x: 105 + 35 + 140, y: 105 });
    expect(history.getState().pastStates).toHaveLength(2);

    rows(menu).aura.stepper!.onDecrement();
    rows(menu).aura.stepper!.onDecrement();
    expect(auras(store)).toHaveLength(0);
    expect(rows(menu).aura.stepper!.value).toBe('0ft');
    history.getState().undo();
    expect(reaches(store)).toEqual({ hero: 5 });
  });

  it('steps every token of a selection from its own aura in one undo step, and takes them all away with one row', () => {
    const store = createStore();
    const history = getHistoryStore(store)!;
    tokenAuraSubmenu(store, ['ogre'], () => FEET);
    rows(tokenAuraSubmenu(store, ['ogre'], () => FEET)).aura.stepper!.onIncrement();
    history.getState().clear();
    const menu = tokenAuraSubmenu(store, ['hero', 'ogre', 'gone'], () => FEET);
    expect(rows(menu).aura.stepper!.value).toBe('0ft–5ft');

    rows(menu).aura.stepper!.onIncrement();
    expect(reaches(store)).toEqual({ ogre: 10, hero: 5 });
    expect(history.getState().pastStates).toHaveLength(1);
    // A large token's aura is counted from the edge of its wider space.
    expect(auras(store).find((aura) => aura.follows === 'ogre')!.points[1]).toEqual({ x: 420 + 70 + 140, y: 105 });
    expect(rows(menu).aura.stepper!.value).toBe('5ft–10ft');

    rows(menu).none.onClick();
    expect(auras(store)).toHaveLength(0);
    expect(history.getState().pastStates).toHaveLength(2);
    history.getState().undo();
    expect(reaches(store)).toEqual({ ogre: 10, hero: 5 });
  });

  it('makes a new aura in the measure tool\'s colour and for whom the tool says, and leaves an aura it steps as it is', () => {
    const store = createStore();
    store.getState().setMeasureTool({ color: '#e93147', players: false });
    const menu = tokenAuraSubmenu(store, ['hero'], () => FEET);
    rows(menu).aura.stepper!.onIncrement();
    expect(auras(store)[0]).toMatchObject({ color: '#e93147', hidden: true });
    store.getState().setMeasureTool({ color: null, players: true });
    rows(menu).aura.stepper!.onIncrement();
    expect(auras(store)[0]).toMatchObject({ aura: 10, color: '#e93147', hidden: true });
    rows(tokenAuraSubmenu(store, ['ogre'], () => FEET)).aura.stepper!.onIncrement();
    const ogre = auras(store).find((aura) => aura.follows === 'ogre')!;
    expect(ogre).not.toHaveProperty('color');
    expect(ogre).not.toHaveProperty('hidden');
  });

  it('follows the tokens\' auras while it is open', () => {
    const store = createStore();
    const menu = tokenAuraSubmenu(store, ['hero'], () => FEET);
    if (menu?.type !== 'submenu' || !menu.subscribe) throw new Error('expected a submenu that follows the store');
    const changed = vi.fn();
    const stop = menu.subscribe(changed);
    store.getState().setTokenAuras([{ tokenId: 'hero', aura: 15, points: [{ x: 105, y: 105 }, { x: 350, y: 105 }] }]);
    expect(changed).toHaveBeenCalled();
    expect(rows(menu).aura.stepper!.value).toBe('15ft');
    stop();
  });

  it('is not offered where the map measures in range bands', () => {
    expect(tokenAuraSubmenu(createStore(), ['hero'], () => BANDS)).toBeNull();
  });

  it('tells the GM when the level keeps as many measurements as it may', () => {
    const store = createStore();
    for (let i = 0; i < MAX_MEASURES; i++) store.getState().addMeasure({ shape: 'ruler', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }] });
    rows(tokenAuraSubmenu(store, ['hero'], () => FEET)).aura.stepper!.onIncrement();
    expect(notices.full).toHaveBeenCalledOnce();
    expect(auras(store).some((aura) => aura.follows === 'hero')).toBe(false);
  });
});
