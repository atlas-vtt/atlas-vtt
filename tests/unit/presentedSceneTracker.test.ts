import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { presentedTabIn, standingOf, trackPresentedScene, type StandingChange, type TrackedSources } from '../../src/app/services/presentedSceneTracker';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

const TAVERN = 'maps/tavern.md';
const DUNGEON = 'maps/dungeon.md';

interface Load {
  mapPath: string | null;
  mapLoaded: boolean;
  isMapLoading: boolean;
}

/** A view with a Tavern and a Dungeon tab, the Tavern shown and loaded, and players' level shown unless a test says otherwise. */
function view(): { sources: Required<TrackedSources>; tavern: string; dungeon: string; level: { shown: boolean; viewed: string; changed(): void } } {
  const tabs = createTabMetaStore();
  const tavern = tabs.getState().addTab(TAVERN, 'Tavern');
  const dungeon = tabs.getState().addTab(DUNGEON, 'Dungeon');
  tabs.getState().setActiveTab(tavern);
  const store = createStore<Load>()(() => ({ mapPath: TAVERN, mapLoaded: true, isMapLoading: false }));
  const listeners = new Set<() => void>();
  const level = {
    shown: true,
    viewed: 'ground',
    changed: () => listeners.forEach((listener) => listener()),
  };
  const sources = {
    tabs, store,
    level: { shows: () => level.shown, viewed: () => level.viewed, follow: (listener: () => void) => (listeners.add(listener), () => void listeners.delete(listener)) },
  };
  return { sources, tavern, dungeon, level };
}

describe('the presented tab among the open views', () => {
  const tabs = (...files: string[]): { id: string; filePath: string }[] => files.map((filePath) => ({ id: `tab:${filePath}`, filePath }));
  const caveFirst = { name: 'first', tabs: tabs('cave'), isPlayerView: false };
  const hallAndCave = { name: 'second', tabs: tabs('hall', 'cave'), isPlayerView: false };
  const player = { name: 'player', tabs: tabs('hall'), isPlayerView: true };

  it('is the tab with its id wherever it is, else the first tab of its file, never one of a player view', () => {
    const views = [player, caveFirst, hallAndCave];
    expect(presentedTabIn(views, { tabId: 'tab:cave', filePath: 'cave' })?.view.name).toBe('first');
    expect(presentedTabIn(views, { tabId: 'tab:hall', filePath: 'hall' })?.view.name).toBe('second');
    // Tab ids made anew: the first view with the file.
    expect(presentedTabIn([hallAndCave, caveFirst], { tabId: 'gone', filePath: 'cave' })).toMatchObject({ view: { name: 'second' }, tab: { id: 'tab:cave' } });
    expect(presentedTabIn([player], { tabId: 'gone', filePath: 'hall' })).toBeNull();
  });

  it('is none while nothing is presented or no view has it', () => {
    expect(presentedTabIn([caveFirst], null)).toBeNull();
    expect(presentedTabIn([caveFirst], { tabId: 'gone', filePath: 'crypt' })).toBeNull();
  });
});

describe('where the presented tab stands in its view', () => {
  it('is shown while its tab is active and its scene loaded, on players\' level', () => {
    const { sources, tavern, level } = view();
    const tab = { id: tavern, filePath: TAVERN };
    expect(standingOf(sources, tab)).toBe('shown');
    level.shown = false;
    expect(standingOf(sources, tab)).toBe('other-level');
    // A reader whose players see their own floors follows no level.
    expect(standingOf({ tabs: sources.tabs, store: sources.store }, tab)).toBe('shown');
  });

  it('is away on another tab, and loading until its own scene is loaded with the overlay gone', () => {
    const { sources, tavern, dungeon } = view();
    const tab = { id: tavern, filePath: TAVERN };
    sources.tabs.getState().setActiveTab(dungeon);
    expect(standingOf(sources, tab)).toBe('away');
    // Another scene loads into the view meanwhile: still away.
    sources.store.setState({ mapPath: DUNGEON });
    expect(standingOf(sources, tab)).toBe('away');
    // The tab becomes active before its load starts, while the store still holds the Dungeon loaded.
    sources.tabs.getState().setActiveTab(tavern);
    expect(standingOf(sources, tab)).toBe('loading');
    sources.store.setState({ mapPath: TAVERN, mapLoaded: false, isMapLoading: true });
    sources.store.setState({ mapLoaded: true });
    expect(standingOf(sources, tab)).toBe('loading');
    sources.store.setState({ isMapLoading: false });
    expect(standingOf(sources, tab)).toBe('shown');
    // A load that failed leaves no scene; a retry of the same tab shows it.
    sources.store.setState({ mapPath: null, mapLoaded: false });
    expect(standingOf(sources, tab)).toBe('loading');
    expect(standingOf(sources, null)).toBe('away');
  });
});

describe('following the presented tab', () => {
  it('tells each change of standing with the one before, as the view\'s tabs, store and level change', () => {
    const { sources, tavern, dungeon, level } = view();
    const heard: string[] = [];
    const tracker = trackPresentedScene(sources, () => ({ id: tavern, filePath: TAVERN }), ({ now, before }) => {
      if (now !== before) heard.push(`${before} → ${now}`);
    });
    sources.tabs.getState().setActiveTab(dungeon);
    sources.store.setState({ mapPath: DUNGEON });
    sources.tabs.getState().setActiveTab(tavern);
    sources.store.setState({ mapPath: TAVERN });
    level.shown = false;
    sources.store.setState({});
    level.shown = true;
    level.changed();
    expect(heard).toEqual(['shown → away', 'away → loading', 'loading → shown', 'shown → other-level', 'other-level → shown']);
    expect(tracker.standing).toBe('shown');

    tracker.stop();
    sources.tabs.getState().setActiveTab(dungeon);
    level.changed();
    expect(heard).toHaveLength(5);
  });

  it('tells a change of the store, and a check that asks for it, where the standing stayed', () => {
    const { sources, tavern } = view();
    const heard: StandingChange[] = [];
    let tab: { id: string; filePath: string } | null = { id: tavern, filePath: TAVERN };
    const tracker = trackPresentedScene(sources, () => tab, (change) => heard.push(change));
    sources.store.setState({});
    tracker.check();
    tracker.check(true);
    tab = null;
    tracker.check();
    expect(heard).toEqual([
      { now: 'shown', before: 'shown', changed: true, tabChanged: false, levelChanged: false, levelLoaded: false },
      { now: 'shown', before: 'shown', changed: true, tabChanged: false, levelChanged: false, levelLoaded: false },
      { now: 'away', before: 'shown', changed: false, tabChanged: false, levelChanged: false, levelLoaded: false },
    ]);
  });

  it('tells a change of the active tab, of the level shown and of the level\'s image where the standing stayed', () => {
    const { sources, tavern, dungeon, level } = view();
    const crypt = sources.tabs.getState().addTab('maps/crypt.md', 'Crypt');
    sources.tabs.getState().setActiveTab(dungeon);
    const heard: StandingChange[] = [];
    trackPresentedScene(sources, () => ({ id: tavern, filePath: TAVERN }), (change) => heard.push(change));
    // Away from the Tavern on the Dungeon, then on the Crypt: still away.
    sources.tabs.getState().setActiveTab(crypt);
    sources.tabs.getState().setActiveTab(tavern);
    level.shown = false;
    sources.store.setState({});
    // On another level, then on a third: still another level.
    level.viewed = 'upper';
    sources.store.setState({});
    // The map image finished loading a level's background, still not players'.
    level.changed();
    expect(heard.map(({ now, before, tabChanged, levelChanged, levelLoaded }) => [before, now, tabChanged, levelChanged, levelLoaded])).toEqual([
      ['away', 'away', true, false, false],
      ['away', 'shown', true, false, false],
      ['shown', 'other-level', false, false, false],
      ['other-level', 'other-level', false, true, false],
      ['other-level', 'other-level', false, false, true],
    ]);
  });
});
