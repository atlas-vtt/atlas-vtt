// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import { createDefaultInitiativeState, type InitiativeEntry, type InitiativeState } from '../../src/app/types/initiativeTypes';
import { TURN_BANNER_MS, TurnBannerDisplay } from '../../src/app/initiative/banner/turnBannerElement';
import { PlayerTurnBanner } from '../../src/app/services/PlayerTurnBanner';
import { SettingsService } from '../../src/app/services/SettingsService';
import { initiativeTrackerOptions } from '../../src/app/react/components/initiativeTrackerOptions';
import { DEFAULT_TURN_OPTIONS } from '../../src/app/initiative/turnOptions';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => {
  vi.useRealTimers();
  document.body.empty();
});

const token = (id: string, changes: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'character', name: `${id} on the map`, x: 0, y: 0, imagePath: `art/${id}.webp`, ...changes } as TokenEntity);
const entry = (tokenId: string, order: number, isActive: boolean): InitiativeEntry => ({
  id: `e-${tokenId}`, tokenId, name: `${tokenId} card`, initiative: 10, initiativeModifier: 0, imagePath: `art/${tokenId}.webp`, isActive, isNPC: true, order,
});
const fight = (active: string, round = 1): InitiativeState => ({
  ...createDefaultInitiativeState(), isActive: true, round, entries: ['hero', 'ogre', 'ghost'].map((id, index) => entry(id, index, id === active)),
});

describe('the turn banner on screen', () => {
  it('shows the portrait, the round and the name, stands for two seconds, and gives way to the next turn', () => {
    vi.useFakeTimers();
    const host = document.body.createDiv();
    const display = new TurnBannerDisplay(host, (path) => `app://${path}`);
    display.show({ key: 'a', round: 3, title: 'Grum', portrait: { imagePath: 'art/ogre.webp', showRing: true } });
    const banner = host.querySelector('.atlas-turn-banner');
    expect(banner?.querySelector('.atlas-token-portrait img')?.getAttribute('src')).toBe('app://art/ogre.webp');
    expect(banner?.querySelector('.atlas-turn-banner__eyebrow--round')?.textContent).toBe('Round 3');
    expect(banner?.querySelector('.atlas-turn-banner__title')?.textContent).toBe('Grum');
    display.show({ key: 'b', round: null, title: null, portrait: null });
    expect(host.querySelectorAll('.atlas-turn-banner')).toHaveLength(1);
    expect(host.querySelector('.atlas-turn-banner--text .atlas-turn-banner__eyebrow')?.textContent).toBe('Turn');
    expect(host.querySelector('.atlas-turn-banner__title')).toBeNull();
    vi.advanceTimersByTime(TURN_BANNER_MS);
    expect(display.showing).toBe(false);
  });
});

describe('the turn banner in the player window', () => {
  function setup(trackerOpen = true) {
    vi.useFakeTimers();
    const { app } = createInMemoryApp();
    const settings = new SettingsService(app);
    const store = createStore(() => ({
      initiative: fight('hero'), initiativeTrackerOpen: trackerOpen, mapPath: 'a.atlasmap', isMapLoading: false,
      objects: { tokens: { hero: token('hero'), ogre: token('ogre'), ghost: token('ghost', { isHidden: true }) } },
    })) as unknown as StoreApi<ViewAtlasState>;
    const overlay = new PlayerTurnBanner(app, settings);
    overlay.mount(document.body);
    overlay.present(store);
    const turnTo = (active: string, round = 1): void => store.setState({ initiative: fight(active, round) });
    const shown = (): string | null => document.body.querySelector('.atlas-turn-banner')?.textContent ?? null;
    return { settings, overlay, turnTo, shown };
  }

  it('names the turn as the players\' list does, and nothing for a fight met running', () => {
    const { settings, turnTo, shown } = setup();
    expect(shown()).toBeNull();
    turnTo('ogre');
    // Names only where the player view shows nameplates
    expect(shown()).toBe('Turn');
    settings.setLocalPlayerViewSettings({ showTokenNameplates: true });
    turnTo('hero', 2);
    expect(shown()).toBe('Round 2hero card');
  });

  it('shows none for a hidden turn holder, while the list is not shown, or when the GM switched it off', () => {
    const { settings, turnTo, shown } = setup();
    turnTo('ghost');
    expect(shown()).toBeNull();
    settings.setLocalPlayerViewSettings({ showInitiative: false });
    turnTo('ogre');
    expect(shown()).toBeNull();
    settings.setLocalPlayerViewSettings({ showInitiative: true });
    settings.setInitiativeTurnOptions({ banner: false });
    turnTo('hero');
    expect(shown()).toBeNull();
    const closed = setup(false);
    closed.turnTo('ogre');
    expect(document.body.querySelectorAll('.atlas-turn-banner')).toHaveLength(0);
  });
});

describe('the tracker\'s turn options', () => {
  const state = { autoSort: true, bySides: false, empty: false, showNames: false, fromTurn: true, dock: 'right' as const, turn: DEFAULT_TURN_OPTIONS };
  const actions = { setAutoSort: vi.fn(), setShowNames: vi.fn(), setFromTurn: vi.fn(), setDock: vi.fn(), setTurn: vi.fn(), clear: vi.fn() };
  const labels = (online: boolean): string[] => initiativeTrackerOptions({ ...state, online }, actions).flatMap((item) => (item.type === 'item' ? [item.label] : []));

  it('switch the banner (on by default) and following (off), and moves on the turn only with online play', () => {
    expect(labels(false)).toEqual(expect.arrayContaining(['Turn banner', 'Follow the turn']));
    expect(labels(false)).not.toContain('Players move only on their turn');
    expect(labels(true)).toContain('Players move only on their turn');
    const banner = initiativeTrackerOptions({ ...state, online: false }, actions).find((item) => item.type === 'item' && item.label === 'Turn banner');
    expect(banner?.type === 'item' && banner.checked).toBe(true);
    if (banner?.type === 'item') banner.onClick?.();
    expect(actions.setTurn).toHaveBeenCalledWith({ banner: false });
  });

  it('are kept in Atlas\' settings: the banner on unless switched off, the others off unless switched on', () => {
    const settings = new SettingsService(createInMemoryApp().app);
    expect(settings.initiativeTurnOptions()).toEqual({ banner: true, followTurn: false, movesOnTurn: false });
    settings.setInitiativeTurnOptions({ followTurn: true, movesOnTurn: true });
    expect(settings.initiativeTurnOptions()).toEqual({ banner: true, followTurn: true, movesOnTurn: true });
  });
});
