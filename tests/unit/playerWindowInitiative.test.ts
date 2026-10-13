import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import type { PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { attachFakePlayerWindow } from '../mocks/playerPopout';
import { memoryPluginData } from '../mocks/pluginData';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));
const collection = vi.hoisted(() => ({ hpVisibleToPlayers: false }));
vi.mock('../../src/app/resources/collectionResources', () => ({
  mapResources: () => [{ key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#22c55e', defeatedWhenSpent: true, visibleToPlayers: collection.hpVisibleToPlayers }],
}));
const scrolls = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../src/app/utils/scrollWithin', () => ({ scrollWithin: (...args: unknown[]) => { scrolls.calls.push(args); } }));
const TURN_ORDER: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
const initiativeRules = vi.hoisted(() => ({ value: undefined as InitiativeRules | undefined }));
vi.mock('../../src/app/services/mapInitiativeRules', () => ({ mapInitiativeRules: () => initiativeRules.value ?? TURN_ORDER }));
afterEach(() => { PlayerWindowService.getInstance()?.destroy(); vi.useRealTimers(); vi.restoreAllMocks(); collection.hpVisibleToPlayers = false; initiativeRules.value = undefined; scrolls.calls.length = 0; });

function scene(name = 'Hero', initiativeTrackerOpen = true): StoreApi<ViewAtlasState> {
  const token: TokenEntity = { id: 'hero', kind: 'character', name, x: 0, y: 0, imagePath: '', resources: { hp: { current: 8, max: 10 } } };
  const entry: InitiativeEntry = {
    id: 'entry', tokenId: token.id, name, initiative: 18, initiativeModifier: 2,
    imagePath: '', isActive: true, isNPC: false, order: 0,
  };
  return createStore(() => ({
    initiative: { ...createDefaultInitiativeState(), entries: [entry], isActive: true, round: 1 },
    objects: { tokens: { hero: token } }, initiativeTrackerOpen,
  })) as StoreApi<ViewAtlasState>;
}

function setup(initiativeTrackerOpen = true): { service: PlayerWindowService; settings: SettingsService; store: StoreApi<ViewAtlasState>; doc: Document; source: PlayerFrameSource; collectionChanged: () => void } {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const { app } = createInMemoryApp();
  const settings = new SettingsService(app);
  const store = scene('Hero', initiativeTrackerOpen);
  const service = new PlayerWindowService(app, store, settings);
  const source = { canvas: createEl('canvas'), withPlayerSafeFrame: vi.fn(), store };
  const doc = attachFakePlayerWindow(service, source);
  const collectionChanged = (): void => vi.mocked(app.workspace.on).mock.calls
    .filter(([name]) => (name as string) === 'atlas-vtt:collection-settings-changed')
    .forEach(([, handler]) => (handler as (id: string) => void)('collection'));
  return { service, settings, store, doc, source, collectionChanged };
}

describe('player initiative panel', () => {
  it('gates player sharing independently of other widgets and follows combat changes', () => {
    const { settings, store, doc } = setup();
    const panel = (): Element | null => doc.querySelector('[aria-label="Initiative order"]');
    expect(panel()).not.toBeNull();
    expect(panel()?.textContent).toContain('18');
    expect(panel()?.textContent).toContain('Round 1');
    expect(panel()?.querySelector('button, input, [draggable="true"]')).toBeNull();
    settings.setLocalPlayerViewSettings({ showWidgets: false });
    expect(panel()).not.toBeNull();
    settings.setLocalPlayerViewSettings({ showInitiative: false });
    expect(panel()).toBeNull();
    store.setState({ initiative: { ...store.getState().initiative, round: 2 } });
    settings.setLocalPlayerViewSettings({ showInitiative: true });
    expect(panel()?.textContent).toContain('Round 2');
    expect(store.getState().initiativeTrackerOpen).toBe(true);
  });

  it('requires the DM tracker to be open and reacts immediately to visibility changes', () => {
    const { settings, store, doc } = setup(false);
    const panel = (): Element | null => doc.querySelector('[aria-label="Initiative order"]');
    expect(settings.getLocalPlayerViewSettings().showInitiative).toBe(true);
    expect(panel()).toBeNull();
    store.setState({ initiativeTrackerOpen: true });
    expect(panel()).not.toBeNull();
    store.setState({ initiativeTrackerOpen: false });
    expect(panel()).toBeNull();
    settings.setLocalPlayerViewSettings({ showInitiative: false });
    store.setState({ initiativeTrackerOpen: true });
    expect(panel()).toBeNull();
    store.setState({ initiativeTrackerOpen: false });
    settings.setLocalPlayerViewSettings({ showInitiative: true });
    expect(panel()).toBeNull();
    store.setState({ initiativeTrackerOpen: true });
    expect(panel()).not.toBeNull();
  });

  it('excludes hidden and deleted tokens, and shows names and HP only where players may see them', () => {
    const { settings, store, doc } = setup();
    const panel = (): Element | null => doc.querySelector('[aria-label="Initiative order"]');
    expect(panel()?.textContent).not.toContain('Hero');
    expect(panel()?.querySelector('progress')).toBeNull();
    settings.setLocalPlayerViewSettings({ showTokenNameplates: true });
    expect(panel()?.textContent).toContain('Hero');
    // HP stays hidden until the collection lets players see it
    expect(panel()?.querySelector('progress')).toBeNull();
    collection.hpVisibleToPlayers = true;
    settings.setLocalPlayerViewSettings({ showTokenNameplates: true, showWidgets: false });
    expect(panel()?.querySelector('progress')?.value).toBe(8);
    const objects = store.getState().objects;
    store.setState({ objects: { ...objects, tokens: { hero: { ...objects.tokens.hero!, isHidden: true } } } });
    expect(panel()).toBeNull();
    store.setState({ objects: { ...objects, tokens: {} } });
    expect(panel()).toBeNull();
  });

  it('shows and hides HP as soon as the collection changes what players see', () => {
    const { doc, collectionChanged } = setup();
    const progress = (): Element | null => doc.querySelector('[aria-label="Initiative order"] progress');
    expect(progress()).toBeNull();
    collection.hpVisibleToPlayers = true;
    collectionChanged();
    expect(progress()).not.toBeNull();
    collection.hpVisibleToPlayers = false;
    collectionChanged();
    expect(progress()).toBeNull();
  });

  it('shows a token without hit points without an HP bar', () => {
    const { settings, store, doc, collectionChanged } = setup();
    collection.hpVisibleToPlayers = true;
    collectionChanged();
    settings.setLocalPlayerViewSettings({ showTokenNameplates: true });
    const objects = store.getState().objects;
    const { resources: _resources, ...withoutHp } = objects.tokens.hero!;

    expect(() => store.setState({ objects: { ...objects, tokens: { hero: withoutHp as typeof objects.tokens.hero } } })).not.toThrow();

    const panel = doc.querySelector('[aria-label="Initiative order"]');
    expect(panel?.textContent).toContain('Hero');
    expect(panel?.querySelector('progress')).toBeNull();
  });

  it('holds the presented initiative while browsing and binds to a newly presented view', () => {
    const { service, settings, store, doc, source } = setup();
    service.holdCurrentFrame();
    store.setState({ initiative: { ...store.getState().initiative, round: 9 } });
    settings.setLocalPlayerViewSettings({ showTokenNameplates: true });
    expect(doc.body.textContent).toContain('Round 1');
    expect(doc.body.textContent).not.toContain('Round 9');
    service.releaseHeldFrame(source);
    expect(doc.body.textContent).toContain('Round 9');
    const other = scene('Other hero');
    service.presentCanvas({ ...source, store: other }, 'scene-b');
    expect(doc.body.textContent).toContain('Other hero');
    other.setState({ initiative: { ...other.getState().initiative, round: 3 } });
    expect(doc.body.textContent).toContain('Round 3');
    service.destroy();
    const before = doc.body.textContent;
    other.setState({ initiative: { ...other.getState().initiative, round: 4 } });
    settings.setLocalPlayerViewSettings({ showInitiative: false });
    expect(doc.body.textContent).toBe(before);
  });

  it('keeps the presented map\'s tracker visibility while the DM browses another map', () => {
    const { service, store, doc, source } = setup(false);
    const panel = (): Element | null => doc.querySelector('[aria-label="Initiative order"]');
    service.holdCurrentFrame();
    // Switching tabs loads the other map into the same view store.
    store.setState({ initiativeTrackerOpen: true, initiative: { ...store.getState().initiative, round: 5 } });
    expect(panel()).toBeNull();
    store.setState({ initiativeTrackerOpen: false });
    store.setState({ initiativeTrackerOpen: true });
    expect(panel()).toBeNull();
    // Returning to the presented map resumes following its live state.
    store.setState({ initiativeTrackerOpen: false });
    service.releaseHeldFrame(source);
    expect(panel()).toBeNull();
    store.setState({ initiativeTrackerOpen: true });
    expect(panel()?.textContent).toContain('Round 5');
  });

  it('keeps a shown tracker while the DM browses a map with the tracker closed', () => {
    const { service, store, doc } = setup();
    service.holdCurrentFrame();
    store.setState({ initiativeTrackerOpen: false, objects: { tokens: {} } });
    expect(doc.querySelector('[aria-label="Initiative order"]')?.textContent).toContain('Round 1');
  });

  it('keeps the initiative of a closed presented map without following its store', () => {
    const { service, store, doc } = setup();
    service.releaseSource(store);
    store.setState({ initiativeTrackerOpen: false, initiative: { ...store.getState().initiative, round: 9 } });
    expect(doc.body.textContent).toContain('Round 1');
    const next = scene();
    next.setState({ initiative: { ...next.getState().initiative, round: 4 } });
    service.presentCanvas({ canvas: createEl('canvas'), withPlayerSafeFrame: vi.fn(), store: next }, 'scene-b');
    expect(doc.body.textContent).toContain('Round 4');
  });

  it('shows each token as the map does: inside its ring in the ring\'s colour, or unframed without one', () => {
    const { store, doc } = setup();
    const portrait = (): Element | null => doc.querySelector('[aria-label="Initiative order"] .atlas-token-portrait');
    const withArt = (token: Partial<TokenEntity>): void => {
      const { objects, initiative } = store.getState();
      store.setState({
        initiative: { ...initiative, entries: [{ ...initiative.entries[0]!, imagePath: 'data:image/png;base64,AAAA' }] },
        objects: { ...objects, tokens: { hero: { ...objects.tokens.hero!, ...token } as TokenEntity } },
      });
    };

    withArt({ ringColor: '#c0392b' });
    expect(portrait()?.classList.contains('atlas-token-portrait--unframed')).toBe(false);
    expect(portrait()?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(portrait()?.querySelector<HTMLElement>('.atlas-token-ring')?.style.getPropertyValue('--atlas-token-ring-color')).toBe('#c0392b');

    // The list follows the token when the GM takes its ring away
    withArt({ showRing: false });
    expect(portrait()?.classList.contains('atlas-token-portrait--unframed')).toBe(true);
    expect(portrait()?.querySelector('.atlas-token-ring')).toBeNull();
  });

  it('keeps the combatant whose turn it is in view: the list is drawn anew on every change', () => {
    const { store, doc } = setup();
    const { initiative } = store.getState();
    scrolls.calls.length = 0;

    store.setState({ initiative: { ...initiative, round: 2 } });

    expect(scrolls.calls).toEqual([[doc.querySelector('.atlas-player-initiative__list'), doc.querySelector('.atlas-player-initiative__card--active'), 'nearest']]);
    expect(scrolls.calls[0]?.[1]).not.toBeNull();
  });

  it('defaults on for old settings and persists the DM choice across reloads', async () => {
    const { app } = createInMemoryApp();
    const data = memoryPluginData({ localPlayerView: { showWidgets: false } });
    const settings = new SettingsService(app, undefined, data);
    await settings.initialize();
    expect(settings.getLocalPlayerViewSettings().showInitiative).toBe(true);
    settings.setLocalPlayerViewSettings({ showInitiative: false });
    await settings.saveSettingsNow();
    const reloaded = new SettingsService(app, undefined, data);
    await reloaded.initialize();
    expect(reloaded.getLocalPlayerViewSettings()).toMatchObject({ showInitiative: false, showWidgets: false });
  });
});

describe('player initiative panel of a collection that fights by sides', () => {
  const token = (id: string, extra: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: '', ...extra });
  const entry = (tokenId: string, order: number, extra: Partial<InitiativeEntry> = {}): InitiativeEntry =>
    ({ id: `e-${tokenId}`, tokenId, name: tokenId, initiative: 9, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order, ...extra });

  function sides(initiative: Partial<ViewAtlasState['initiative']> = {}, firstSide: 'players' | 'opponents' = 'players'): { doc: Document; store: StoreApi<ViewAtlasState> } {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    initiativeRules.value = { mode: 'sides', roll: '1d20', firstSide };
    const { app } = createInMemoryApp();
    const settings = new SettingsService(app);
    settings.setLocalPlayerViewSettings({ showTokenNameplates: true });
    const store = createStore(() => ({
      initiative: { ...createDefaultInitiativeState(), entries: [entry('goblin', 0), entry('hero', 1), entry('rat', 2, { sitsOut: true }), entry('cleric', 3)], ...initiative },
      objects: { tokens: { goblin: token('goblin'), hero: token('hero', { vision: { enabled: true } }), rat: token('rat'), cleric: token('cleric', { side: 'players' }) } },
      initiativeTrackerOpen: true,
    })) as StoreApi<ViewAtlasState>;
    const service = new PlayerWindowService(app, store, settings);
    return { doc: attachFakePlayerWindow(service, { canvas: createEl('canvas'), withPlayerSafeFrame: vi.fn(), store }), store };
  }
  const groups = (doc: Document): Array<{ side: string | null; names: string[]; active: boolean }> =>
    [...doc.querySelectorAll('.atlas-player-initiative__side')].map((group) => ({
      side: group.getAttribute('aria-label'),
      names: [...group.querySelectorAll('.atlas-player-initiative__name')].map((name) => name.textContent ?? ''),
      active: group.getAttribute('aria-current') === 'true',
    }));

  it('lists the combatants under their side, the first side on top, without numbers', () => {
    const { doc } = sides();
    expect(groups(doc)).toEqual([
      { side: 'Players', names: ['hero', 'cleric'], active: false },
      { side: 'Opponents', names: ['goblin', 'rat'], active: false },
    ]);
    expect(doc.querySelector('.atlas-player-initiative__value')).toBeNull();
    expect(doc.querySelector('.atlas-player-initiative__side-label')?.textContent).toBe('Players');
  });

  it('marks the side whose turn it is and the combatant who sits the round out', () => {
    const { doc, store } = sides({ isActive: true, round: 2, sides: { first: 'opponents', active: 'players' } }, 'opponents');
    // The side whose turn it is is brought into view
    expect(scrolls.calls.at(-1)).toEqual([doc.querySelector('.atlas-player-initiative__list'), doc.querySelector('.atlas-player-initiative__side--active'), 'start']);
    // No single combatant has the turn, whatever its entry says
    const { initiative } = store.getState();
    store.setState({ initiative: { ...initiative, entries: initiative.entries.map((each) => ({ ...each, isActive: true })) } });
    expect(doc.querySelector('.atlas-player-initiative__card--active')).toBeNull();
    expect(groups(doc).map(({ side, active }) => [side, active])).toEqual([['Opponents', false], ['Players', true]]);
    expect(doc.querySelectorAll('.atlas-player-initiative__card--sitting-out')).toHaveLength(1);
    expect(doc.body.textContent).toContain('Round 2');
  });

  it('follows a token that changes sides, and leaves out a side the players see nobody of', () => {
    const { doc, store } = sides();
    const { objects } = store.getState();
    store.setState({ objects: { ...objects, tokens: { ...objects.tokens, goblin: { ...objects.tokens.goblin!, side: 'players' }, rat: { ...objects.tokens.rat!, isHidden: true } } } });
    expect(groups(doc)).toEqual([{ side: 'Players', names: ['goblin', 'hero', 'cleric'], active: false }]);
  });

  it('keeps a fight that was started in turn order in turn order', () => {
    const { doc } = sides({ isActive: true, round: 1 });
    expect(groups(doc)).toEqual([]);
    expect(doc.querySelectorAll('.atlas-player-initiative__value')).toHaveLength(4);
  });
});
