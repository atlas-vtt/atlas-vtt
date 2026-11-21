// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import { createDefaultInitiativeState, type InitiativeEntry, type InitiativeState } from '../../src/app/types/initiativeTypes';
import { TURN_BANNER_MS, TurnBannerDisplay, turnBannerScaleFor } from '../../src/app/initiative/banner/turnBannerElement';
import { PlayerTurnBanner } from '../../src/app/services/PlayerTurnBanner';
import { SettingsService } from '../../src/app/services/SettingsService';
import { initiativeTrackerOptions } from '../../src/app/react/components/initiativeTrackerOptions';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { setIcon } from 'obsidian';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<object>()), setIcon: vi.fn() }));

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
      objects: { tokens: { hero: token('hero', { showNameplate: true }), ogre: token('ogre'), ghost: token('ghost', { isHidden: true }) } },
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
    // A combatant whose nameplate the GM's map does not show goes unnamed
    turnTo('ogre', 2);
    expect(shown()).toBe('TurnUnknown Creature');
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
  it('stands at every players\' list with the player view\'s switch, else in the middle', () => {
    const { settings, turnTo } = setup();
    settings.setLocalPlayerViewSettings({ turnBannerAtLists: true });
    for (const edge of ['bottom', 'top']) document.body.createDiv({ cls: 'atlas-player-initiative', attr: { 'data-edge': edge } });
    turnTo('ogre');
    const anchors = [...document.body.querySelectorAll('.atlas-player-turn-banner__anchor')];
    expect(anchors.map((anchor) => anchor.querySelectorAll('.atlas-turn-banner').length)).toEqual([1, 1]);
    // A row along the top without turning has its banner below it; only the first is announced
    expect(anchors.map((anchor) => anchor.getAttribute('data-side'))).toEqual(['above', 'below']);
    expect(anchors[1]?.getAttribute('aria-hidden')).toBe('true');
    settings.setLocalPlayerViewSettings({ turnBannerAtLists: false });
    turnTo('hero');
    expect(document.body.querySelectorAll('.atlas-player-turn-banner__anchor')).toHaveLength(0);
    expect(document.body.querySelectorAll('.atlas-turn-banner')).toHaveLength(1);
  });
});

describe('the size of the players\' turn banner', () => {
  it('grows with the window from its own size, twice it on a 1080p TV, the same turned on its side, up to five times', () => {
    expect(turnBannerScaleFor(1920, 1080)).toBe(2);
    expect(turnBannerScaleFor(1080, 1920)).toBe(2);
    expect(turnBannerScaleFor(1280, 720)).toBeCloseTo(4 / 3, 5);
    // An ultrawide window: its height decides
    expect(turnBannerScaleFor(3440, 1440)).toBeCloseTo(1440 / 540, 5);
    expect(turnBannerScaleFor(800, 450)).toBe(1);
    expect(turnBannerScaleFor(7680, 4320)).toBe(5);
    expect(turnBannerScaleFor(0, 0)).toBe(1);
  });
});

describe('the banners of a fight\'s start and end', () => {
  function setup(running: boolean) {
    vi.useFakeTimers();
    const { app } = createInMemoryApp();
    const settings = new SettingsService(app);
    const store = createStore(() => ({
      initiative: running ? fight('hero') : { ...createDefaultInitiativeState(), entries: fight('hero').entries.map((listed) => ({ ...listed, isActive: false })) },
      initiativeTrackerOpen: true, mapPath: 'a.atlasmap', isMapLoading: false,
      objects: { tokens: { hero: token('hero'), ogre: token('ogre'), ghost: token('ghost', { isHidden: true }) } },
    })) as unknown as StoreApi<ViewAtlasState>;
    const overlay = new PlayerTurnBanner(app, settings);
    overlay.mount(document.body);
    overlay.present(store);
    const banner = (): Element | null => document.body.querySelector('.atlas-turn-banner');
    return { store, banner };
  }

  it('says the fight started, then names its first turn', () => {
    const { store, banner } = setup(false);
    expect(banner()).toBeNull();
    store.setState({ initiative: fight('hero') });
    expect(banner()?.classList.contains('atlas-turn-banner--fight-start')).toBe(true);
    // Its border pulses as long as it stands
    expect((banner() as HTMLElement).style.getPropertyValue('--atlas-turn-banner-stand')).toBe('4000ms');
    expect(banner()?.textContent).toBe('Combat has started');
    // A title between two rules, without the turn's capsule look or an icon
    expect(banner()?.classList.contains('atlas-turn-banner--fight')).toBe(true);
    expect(banner()?.querySelectorAll('.atlas-fight-banner__rule')).toHaveLength(2);
    expect(banner()?.querySelector('.atlas-fight-banner__title')?.textContent).toBe('Combat has started');
    expect(vi.mocked(setIcon)).not.toHaveBeenCalled();
    // Four seconds, long enough to read from across a table
    const stand = 4000;
    vi.advanceTimersByTime(stand - 1);
    expect(banner()?.classList.contains('atlas-turn-banner--fight-start')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(banner()?.classList.contains('atlas-turn-banner--fight-start')).toBe(false);
    expect(banner()?.textContent).toBe('Round 1');
    vi.advanceTimersByTime(stand);
    expect(document.body.querySelectorAll('.atlas-turn-banner--fight-start')).toHaveLength(0);
  });

  it('says the fight ended, and stands its time although no fight runs', () => {
    const { store, banner } = setup(true);
    expect(banner()).toBeNull();
    store.setState({ initiative: { ...store.getState().initiative, isActive: false } });
    expect(banner()?.textContent).toBe('Combat has ended');
    // Another change while no fight runs leaves it standing
    store.setState({ initiativeTrackerOpen: true, mapPath: 'a.atlasmap' });
    store.setState({ initiative: { ...store.getState().initiative } });
    expect(banner()?.classList.contains('atlas-turn-banner--fight-end')).toBe(true);
  });

  it('dissolves by its own motion whoever shows it, gone once the dissolve has run', () => {
    vi.useFakeTimers();
    const host = document.body.createDiv();
    const display = new TurnBannerDisplay(host, () => null);
    display.show({ kind: 'fight-end', key: 'fight-end', round: null, title: 'Combat has ended', portrait: null });
    display.hide();
    const leaving = host.querySelector('.atlas-turn-banner--fight');
    expect(leaving?.classList.contains('atlas-turn-banner--leaving')).toBe(true);
    vi.advanceTimersByTime(699);
    expect(leaving?.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(leaving?.isConnected).toBe(false);
  });

  it('says nothing for a scene met with its fight running or not', () => {
    expect(setup(true).banner()).toBeNull();
    document.body.empty();
    expect(setup(false).banner()).toBeNull();
  });
});

describe('the tracker\'s turn options', () => {
  it('switch the banner (on by default); the view always follows the turn, and moving on one\'s turn is the player view\'s', () => {
    const setBanner = vi.fn();
    const entries = initiativeTrackerOptions({ empty: false, compact: false, party: null, banner: true }, { setCompact: vi.fn(), setBanner, clear: vi.fn(), resetNumbers: vi.fn(), addEnemy: vi.fn() });
    const labels = entries.flatMap((item) => (item.type === 'item' ? [item.label] : []));
    expect(labels).not.toContain('Follow the turn');
    expect(labels).not.toContain('Players move only on their turn');
    const banner = entries.find((item) => item.type === 'item' && item.label === 'Turn banner');
    expect(banner?.type === 'item' && banner.checked).toBe(true);
    if (banner?.type === 'item') banner.onClick?.();
    expect(setBanner).toHaveBeenCalledWith(false);
  });

  it('are kept in Atlas\' settings: the banner on unless switched off, moving on one\'s turn off unless switched on', () => {
    const settings = new SettingsService(createInMemoryApp().app);
    expect(settings.initiativeTurnOptions()).toEqual({ banner: true, movesOnTurn: false });
    settings.setInitiativeTurnOptions({ movesOnTurn: true });
    expect(settings.initiativeTurnOptions()).toEqual({ banner: true, movesOnTurn: true });
  });
});

