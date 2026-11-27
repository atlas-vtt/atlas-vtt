// @vitest-environment jsdom
import React, { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { ContextMenuEntry } from '../../../src/app/react/components/context-menu/AtlasContextMenu';
import type { TokenEntity } from '../../../src/app/types';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
  closeContextMenuGlobal: () => {},
}));
vi.mock('../../../src/app/react/components/StatblockHoverPreview', () => ({
  StatblockHoverPreview: () => null,
  useStatblockHoverPreview: () => [
    { hoveredEntry: null, isVisible: false, isClosing: false, position: null, anchorRect: null, notePath: null },
    { showPreview: vi.fn(), closePreview: vi.fn(), clearPreview: vi.fn() },
  ],
}));

import { InitiativeTracker } from '../../../src/app/react/components/InitiativeTracker';
import { AtlasUIContext } from '../../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { sharedInitiative } from '../../../src/app/online/gm/initiativeInputs';
import { playerInitiativeList } from '../../../src/app/services/playerInitiativeList';
import { renderPlayerInitiative } from '../../../src/app/services/playerInitiativeView';
import { currentTurn } from '../../../src/app/initiative/turnHolders';

/** A fight in turn order between `names`, in that order, on the GM's open tracker; the `defeated` have no hit points left. */
function fight(app: App, names: readonly string[], defeated: readonly string[] = []): ViewAtlasStore {
  const store = createViewAtlasStore(app, `fight-commands-${names.join('-')}`);
  const tokens: Record<string, TokenEntity> = {};
  for (const name of names) {
    tokens[name] = { id: name, kind: 'token', x: 0, y: 0, imagePath: `${name}.png`, resources: { hp: { current: defeated.includes(name) ? 0 : 7, max: 7 } } };
    store.getState().addToInitiative({ tokenId: name, name, initiative: 0, initiativeModifier: 0, imagePath: `${name}.png`, isNPC: true });
  }
  store.setState((state) => ({ persistenceEnabled: false, mapLoaded: true, initiativeTrackerOpen: true, objects: { ...state.objects, tokens } }));
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store}><InitiativeTracker /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  return store;
}

const turn = (store: ViewAtlasStore): [number, string | undefined] =>
  [store.getState().initiative.round, store.getState().initiative.entries.find((entry) => entry.isActive)?.tokenId];
const heal = (store: ViewAtlasStore, name: string): void => store.getState().updateToken(name, { resources: { hp: { current: 7, max: 7 } } });

/** Picks `label` in the menu of `name`'s card on the tracker. */
function fromCardMenu(name: string, label: string): void {
  fireEvent.contextMenu(document.querySelector(`.atlas-initiative-card[aria-label="${name}"]`)!);
  const item = opened.entries.find((entry) => entry.type === 'item' && entry.label === label);
  if (item?.type !== 'item') throw new Error(`no "${label}" item`);
  act(() => { void item.onClick?.(); });
}

describe('the GM running a fight from the tracker', () => {
  it('starts with the first combatant that is not defeated', () => {
    const store = fight(createInMemoryApp().app, ['a', 'b', 'c'], ['a']);
    fireEvent.click(screen.getByRole('button', { name: 'Start combat' }));
    expect(turn(store)).toEqual([1, 'b']);
  });

  it('passes a defeated combatant by with Next and Previous turn', () => {
    const store = fight(createInMemoryApp().app, ['a', 'b', 'c'], ['b']);
    act(() => store.getState().startCombat());
    fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));
    expect(turn(store)).toEqual([1, 'c']);
    fireEvent.click(screen.getByRole('button', { name: 'Previous turn' }));
    expect(turn(store)).toEqual([1, 'a']);
  });

  it('passes a defeated combatant by when the combatant with the turn delays it, or is taken out from its card', () => {
    const delaying = fight(createInMemoryApp().app, ['a', 'b', 'c'], ['b']);
    act(() => delaying.getState().startCombat());
    fromCardMenu('a', 'Delay Turn');
    expect(turn(delaying)).toEqual([1, 'c']);

    cleanup();
    const removing = fight(createInMemoryApp().app, ['a', 'b', 'c'], ['b']);
    act(() => removing.getState().startCombat());
    fromCardMenu('a', 'Remove from Initiative');
    expect(turn(removing)).toEqual([1, 'c']);
  });
});

describe('a combatant that delays while nobody else can act', () => {
  /** `b` has the turn and delays; `a` and `c` are defeated. */
  function waiting(): ViewAtlasStore {
    const store = fight(createInMemoryApp().app, ['a', 'b', 'c'], ['a', 'c']);
    fireEvent.click(screen.getByRole('button', { name: 'Start combat' }));
    fromCardMenu('b', 'Delay Turn');
    return store;
  }

  it('holds no turn: none on the GM\'s tracker, the players\' list or online players\' pages', () => {
    const store = waiting();
    const state = store.getState();
    expect(currentTurn(state.initiative)).toBeNull();
    expect(document.querySelector('.atlas-initiative-card--active')).toBeNull();

    const list = playerInitiativeList(state, { lookup: null, presets: [] });
    const players = document.createElement('div');
    renderPlayerInitiative(players, list, { showNames: true, mapShowsNameplates: true, portraitSrc: () => null });
    expect(players.querySelectorAll('.atlas-initiative-card')).toHaveLength(3);
    expect(players.querySelector('.atlas-initiative-card--active')).toBeNull();

    const shared = sharedInitiative({ state, shown: true, showNames: true, rules: null, presets: [], art: () => null });
    expect(shared?.combatants.map((combatant) => combatant.turn)).toEqual([false, false, false]);
  });

  it('is where the turn goes on from once someone can act again', () => {
    const store = waiting();
    act(() => heal(store, 'a'));
    fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));
    expect(turn(store)).toEqual([2, 'a']);
  });
});
