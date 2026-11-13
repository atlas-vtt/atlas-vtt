import { describe, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { EventEmitter } from 'events';
import type { App } from 'obsidian';
import { speedChoices, statblockSpeeds, type SpeedToken, type StatedSpeed } from '../../src/app/creatures/statblockSpeeds';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import type { MovementRules } from '../../src/app/measure/movementRules';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import type { TokenMovement } from '../../src/app/pixi/token-renderer/tokenMovement';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';
import { tokenMovementSubmenu } from '../../src/app/react/components/context-menu/tokenMovementMenu';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
  closeContextMenuGlobal: () => {},
}));

const FEET = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 } as MeasurementSettings;
const STEPS: MovementRules = { steps: [{ name: 'Move', multiple: 1, color: '#22c55e' }], countPerTurn: false };
/** What each statblock states as its speed. */
const SPEEDS: Record<string, string> = {
  'Dragon.md': '40 ft., climb 40 ft., fly 80 ft.',
  'Wyvern.md': '20 ft., fly 80 ft.',
  'Bat.md': 'fly 30 ft.',
  'Eagle.md': 'fly 60 ft., hop 10 ft.',
  'Goblin.md': '30 ft.',
};

const token = (id: string, statblockPath?: string, extra: Partial<TokenEntity> = {}): TokenEntity =>
  ({ id, kind: 'character', name: id, imagePath: `${id}.png`, x: 0, y: 0, ...(statblockPath && { statblockPath }), ...extra }) as TokenEntity;

/** Movement over statblocks that are all read: a token with a speed of its own picks none. */
function movement(rules: MovementRules = STEPS, settings: MeasurementSettings = FEET): TokenMovement {
  const choicesOf = (entry: SpeedToken): StatedSpeed[] => {
    const speed = typeof entry.speed === 'number' || !entry.statblockPath ? undefined : SPEEDS[entry.statblockPath];
    return speed === undefined ? [] : speedChoices(statblockSpeeds({ speed }, undefined, settings));
  };
  return { rules: () => rules, settings: () => settings, choicesOf, speedOf: () => null, prepare: () => {} };
}

function sceneOf(...tokens: TokenEntity[]): ViewAtlasStore {
  const store = createViewAtlasStore(createInMemoryApp().app, `movement-menu-${Math.random()}`);
  store.setState({ persistenceEnabled: false, activeTool: 'select', objects: { ...store.getState().objects, tokens: Object.fromEntries(tokens.map((entry) => [entry.id, entry])) } });
  getHistoryStore(store)!.getState().clear();
  return store;
}

/** The submenu's rows as label, distance and tick. */
function rows(entry: ContextMenuEntry | null): Array<[string, string | undefined, boolean]> | null {
  if (entry?.type !== 'submenu' || typeof entry.children === 'function') return null;
  return entry.children.flatMap((row) => (row.type === 'item' ? [[row.label, row.detail, row.checked === true]] : []));
}

function pick(entry: ContextMenuEntry | null, label: string): void {
  const row = entry?.type === 'submenu' && Array.isArray(entry.children) ? entry.children.find((child) => child.type === 'item' && child.label === label) : undefined;
  if (row?.type !== 'item') throw new Error(`no "${label}" row`);
  void row.onClick();
}

describe('the token menu\'s Movement', () => {
  it('lists every speed the statblock states, the first on top and ticked', () => {
    const store = sceneOf(token('dragon', 'Dragon.md'));
    expect(rows(tokenMovementSubmenu(store, 'dragon', ['dragon'], movement()))).toEqual([['Walk', '40ft', true], ['Climb', '40ft', false], ['Fly', '80ft', false]]);
  });

  it('ticks the speed the token picked, and names a first speed that has a name by it', () => {
    const store = sceneOf(token('dragon', 'Dragon.md', { speedKind: 'fly' }), token('eagle', 'Eagle.md'));
    expect(rows(tokenMovementSubmenu(store, 'dragon', ['dragon'], movement()))).toEqual([['Walk', '40ft', false], ['Climb', '40ft', false], ['Fly', '80ft', true]]);
    expect(rows(tokenMovementSubmenu(store, 'eagle', ['eagle'], movement()))).toEqual([['Fly', '60ft', true], ['Hop', '10ft', false]]);
  });

  it('stores the pick by the speed\'s name and clears it for the first, one undo step each', () => {
    const store = sceneOf(token('dragon', 'Dragon.md'));
    const steps = (): number => getHistoryStore(store)!.getState().pastStates.length;
    pick(tokenMovementSubmenu(store, 'dragon', ['dragon'], movement()), 'Fly');
    expect(store.getState().objects.tokens.dragon!.speedKind).toBe('fly');
    expect(steps()).toBe(1);
    pick(tokenMovementSubmenu(store, 'dragon', ['dragon'], movement()), 'Walk');
    expect(store.getState().objects.tokens.dragon!.speedKind).toBeUndefined();
    expect(steps()).toBe(2);
    getHistoryStore(store)!.getState().undo();
    expect(store.getState().objects.tokens.dragon!.speedKind).toBe('fly');
  });

  it('offers a selection the speeds every one of its tokens states, and sets the pick for all of them at once', () => {
    const store = sceneOf(token('dragon', 'Dragon.md'), token('wyvern', 'Wyvern.md'), token('bat', 'Bat.md'));
    const both = tokenMovementSubmenu(store, 'dragon', ['dragon', 'wyvern'], movement());
    // The wyvern does not climb.
    expect(rows(both)).toEqual([['Walk', '40ft', true], ['Fly', '80ft', false]]);
    pick(both, 'Fly');
    expect(Object.values(store.getState().objects.tokens).map((entry) => entry.speedKind)).toEqual(['fly', 'fly', undefined]);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
    // A bat only flies: its one speed is found by its name too.
    expect(rows(tokenMovementSubmenu(store, 'dragon', ['dragon', 'bat'], movement()))).toEqual([['Walk', '40ft', false], ['Fly', '80ft', true]]);
  });

  it('is not offered where there is nothing to pick', () => {
    const store = sceneOf(token('dragon', 'Dragon.md'), token('goblin', 'Goblin.md'), token('bat', 'Bat.md'), token('crate'), token('fast', 'Dragon.md', { speed: 60 }));
    const none: Array<[string, string, string[]]> = [
      ['one speed', 'goblin', ['goblin']],
      ['one named speed', 'bat', ['bat']],
      ['no statblock', 'crate', ['crate']],
      ['a speed of its own', 'fast', ['fast']],
      ['a selection with a token of one speed', 'dragon', ['dragon', 'goblin']],
      ['a selection with a token without statblock', 'dragon', ['dragon', 'crate']],
      ['a token that is gone', 'ghost', ['ghost']],
    ];
    for (const [name, clicked, targets] of none) expect(tokenMovementSubmenu(store, clicked, targets, movement()), name).toBeNull();
  });

  it('is not offered where a speed changes nothing: a collection without movement steps', () => {
    const store = sceneOf(token('dragon', 'Dragon.md'));
    expect(tokenMovementSubmenu(store, 'dragon', ['dragon'], movement({ steps: [], countPerTurn: true }))).toBeNull();
  });

  it('is offered on a map that measures in range bands, each speed written as the band it reaches', () => {
    const store = sceneOf(token('dragon', 'Dragon.md'));
    const bands = { ...FEET, mode: 'abstract', rangeBands: [{ name: 'Close', maxSquares: 1 }, { name: 'Near', maxSquares: 6 }, { name: 'Far', maxSquares: 13 }] } as MeasurementSettings;
    expect(rows(tokenMovementSubmenu(store, 'dragon', ['dragon'], movement(STEPS, bands)))).toEqual([['Walk', 'Far', true], ['Climb', 'Far', false], ['Fly', 'Far', false]]);
    expect(rows(tokenMovementSubmenu(sceneOf(token('wyvern', 'Wyvern.md')), 'wyvern', ['wyvern'], movement(STEPS, bands)))).toEqual([['Walk', 'Near', true], ['Fly', 'Far', false]]);
  });

  it('writes distances in what the map measures in', () => {
    const store = sceneOf(token('dragon', 'Dragon.md'));
    const metres = { ...FEET, unitType: 'meters', unitDistance: 1.5, ruleDistance: 1.5 } as MeasurementSettings;
    expect(rows(tokenMovementSubmenu(store, 'dragon', ['dragon'], movement(STEPS, metres)))?.map(([, distance]) => distance)).toEqual(['12m', '12m', '24m']);
  });

  it('stands in the menu of a token on the map, for the selection the token belongs to', () => {
    const { app } = createInMemoryApp();
    const store = sceneOf(token('dragon', 'Dragon.md'), token('wyvern', 'Wyvern.md'), token('goblin', 'Goblin.md'));
    store.getState().setSelection(['dragon', 'wyvern']);
    const controller = new InteractionController({} as Viewport, store, {} as GridSystem, {} as EventEmitter, app as unknown as App);
    const rightClick = (id: string): ContextMenuEntry | null => {
      controller.handleViewportTokenPointerDown(id, { button: 2, stopPropagation: () => {}, clientX: 0, clientY: 0, global: { x: 0, y: 0 } } as unknown as FederatedPointerEvent);
      return opened.entries.find((entry) => entry.type === 'submenu' && entry.label === 'Movement') ?? null;
    };
    // A view that reads no movement has no such entry.
    expect(rightClick('dragon')).toBeNull();
    controller.setTokenMovement(movement());
    pick(rightClick('wyvern'), 'Fly');
    expect(Object.values(store.getState().objects.tokens).map((entry) => entry.speedKind)).toEqual(['fly', 'fly', undefined]);
    expect(rightClick('goblin')).toBeNull();
  });
});
