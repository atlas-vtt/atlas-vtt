// @vitest-environment jsdom
import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { TokenEntity } from '../../src/app/types';
import { createDefaultInitiativeState, type InitiativeEntry, type InitiativeState } from '../../src/app/types/initiativeTypes';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const ui = vi.hoisted(() => ({ value: null as unknown }));
const pans = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('../../src/app/react/root/AtlasUIContext', async () => ({
  AtlasUIContext: (await import('react')).createContext(null),
  useAtlasUI: () => ui.value,
}));
vi.mock('../../src/app/pixi/tokenFocus', () => ({ panToToken: (_viewport: unknown, token: { id: string }) => pans.calls.push(token.id) }));
const store = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({ useViewStoreHook: () => store.value }));

import { TurnAnnouncer } from '../../src/app/react/components/TurnAnnouncer';

const token = (id: string, changes: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'character', name: `${id} on the map`, x: 0, y: 0, imagePath: '', ...changes } as TokenEntity);
const entry = (tokenId: string, order: number, isActive: boolean): InitiativeEntry => ({
  id: `e-${tokenId}`, tokenId, name: `${tokenId} card`, initiative: 10, initiativeModifier: 0, imagePath: '', isActive, isNPC: true, order,
});
const fight = (active: string): InitiativeState => ({
  ...createDefaultInitiativeState(), isActive: true, round: 1, entries: ['hero', 'ghost', 'away'].map((id, index) => entry(id, index, id === active)),
});

afterEach(() => {
  pans.calls.length = 0;
});

const FLOORS = [{ id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 } }, { id: 'cellar', name: 'Cellar', elevation: { bottom: -10, top: 0 } }];

function setup(floors: { isGMView: boolean } | null = null) {
  const { app } = createInMemoryApp();
  const settings = new SettingsService(app);
  const viewStore = createStore<Record<string, unknown>>((set) => ({
    initiative: fight('hero'), mapPath: 'a.atlasmap', isMapLoading: false, grid: { size: 70 },
    objects: { tokens: { hero: token('hero'), ghost: token('ghost', { isHidden: true }), away: token('away') } },
    ...(floors && {
      levels: FLOORS, viewedLevel: 'ground', isGMView: floors.isGMView,
      objects: { tokens: { hero: token('hero', { level: 'cellar' }), ghost: token('ghost'), away: token('away') } },
      setViewedLevel: (level: string) => set({ viewedLevel: level }),
    }),
  }));
  store.value = viewStore;
  // The canvas shows the hero and the ghost (of the floor in view); the token beside the map has no sprite
  const onCanvas = (id: string): boolean => id !== 'away' && (!floors || id !== 'hero' || viewStore.getState().viewedLevel === 'cellar');
  ui.value = { app, view: { renderer: { getViewportInstance: () => ({}), canvasShowsToken: onCanvas } } };
  render(<TurnAnnouncer />);
  const turnTo = (active: string): void => act(() => viewStore.setState({ initiative: fight(active) }));
  const banner = (): string | null => document.querySelector('.atlas-turn-banner__title')?.textContent ?? null;
  return { settings, turnTo, banner, viewStore };
}

describe('a turn change on the GM\'s map', () => {
  it('names every turn by the map\'s names, a hidden combatant\'s too', () => {
    const { turnTo, banner } = setup();
    expect(banner()).toBeNull();
    turnTo('ghost');
    expect(banner()).toBe('ghost on the map');
  });

  it('follows the turn only where the GM chose so, and only to a token the canvas shows', () => {
    const { settings, turnTo } = setup();
    turnTo('ghost');
    expect(pans.calls).toEqual([]);
    settings.setInitiativeTurnOptions({ followTurn: true, banner: false });
    turnTo('hero');
    turnTo('away');
    expect(pans.calls).toEqual(['hero']);
  });

  it('follows the turn to another floor in the GM\'s view, and leaves it there in the players\' view', () => {
    const gm = setup({ isGMView: true });
    gm.settings.setInitiativeTurnOptions({ followTurn: true, banner: false });
    gm.turnTo('ghost');
    gm.turnTo('hero');
    expect(gm.viewStore.getState().viewedLevel).toBe('cellar');
    expect(pans.calls).toEqual(['ghost', 'hero']);

    pans.calls.length = 0;
    const players = setup({ isGMView: false });
    players.settings.setInitiativeTurnOptions({ followTurn: true, banner: false });
    players.turnTo('ghost');
    players.turnTo('hero');
    expect(players.viewStore.getState().viewedLevel).toBe('ground');
    expect(pans.calls).toEqual(['ghost']);
  });
});
