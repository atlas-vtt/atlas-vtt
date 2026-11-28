import type { PresentedScene } from './presentedScene';

/** A scene tab as the presented scene is found by: its id, and its map file. */
export interface TrackedTab {
  readonly id: string;
  readonly filePath: string;
}

/** An open map view's scene tabs, and whether it is a player view Atlas opened of a map, which never presents. */
export interface TabbedView {
  readonly tabs: readonly TrackedTab[];
  readonly isPlayerView: boolean;
}

/**
 * The open tab of `scene` among `views`, in their order: the tab with its id, else (tab ids made anew) the first
 * tab of its file; never one of a player view. Null when nothing is presented or no view has it.
 */
export function presentedTabIn<V extends TabbedView>(views: readonly V[], scene: PresentedScene | null): { readonly view: V; readonly tab: V['tabs'][number] } | null {
  if (scene === null) return null;
  let byFile: { view: V; tab: V['tabs'][number] } | null = null;
  for (const view of views) {
    if (view.isPlayerView) continue;
    for (const tab of view.tabs) {
      if (tab.id === scene.tabId) return { view, tab };
      if (byFile === null && tab.filePath === scene.filePath) byFile = { view, tab };
    }
  }
  return byFile;
}

/**
 * Where the presented scene stands in the view that has its tab:
 * - `away`: the view shows another tab;
 * - `loading`: its tab is active, and its scene not loaded yet, or another scene still in the store;
 * - `other-level`: its scene is loaded, on another level than players are shown (only where a reader follows levels);
 * - `shown`: its scene is loaded, and the view shows what players see of it.
 */
export type Standing = 'away' | 'loading' | 'other-level' | 'shown';

/** What the standing reads of a view: its active tab, what its store holds and, where a reader follows levels, whether it shows players' level. */
export interface ViewFacts {
  readonly tabs: { getState(): { readonly activeTabId: string | null } };
  readonly store: { getState(): { readonly mapPath: string | null; readonly mapLoaded: boolean; readonly isMapLoading: boolean } };
  /** Whether the view shows players' level of the scene, its map image loaded. A reader whose players are not shown one level of the scene leaves it out. */
  readonly level?: { shows(): boolean };
}

/** A view's facts, and what tells of each change of them: its tabs and store, and its level beside the store. */
export interface TrackedSources extends ViewFacts {
  readonly tabs: ViewFacts['tabs'] & { subscribe(listener: () => void): () => void };
  readonly store: ViewFacts['store'] & { subscribe(listener: () => void): () => void };
  /** `viewed`: the level the view shows, whose change a reader that follows levels hears of. */
  readonly level?: NonNullable<ViewFacts['level']> & { viewed(): string | null; follow(listener: () => void): () => void };
}

/**
 * A change of the presented scene's standing in the tracked view, or of the view while the standing stayed: a
 * reader may hold or show its picture again at a change of the active tab or of the level shown, whatever the standing was.
 */
export interface StandingChange {
  readonly now: Standing;
  readonly before: Standing;
  /** Whether the view's store changed, or what the reader shows of the tab (`check(true)`): a reader shown the scene hears of it even where the standing stayed. */
  readonly changed: boolean;
  /** Whether the view's active tab changed. */
  readonly tabChanged: boolean;
  /** Whether the level the view shows changed. */
  readonly levelChanged: boolean;
  /** Whether the level source told of its change: the view's map image finished loading a level's background. */
  readonly levelLoaded: boolean;
}

/** The presented scene's standing in one view, as it follows the view. */
export interface PresentedSceneTracker {
  /** The standing now, read anew. */
  readonly standing: Standing;
  /** Reads the standing again (the tracked tab changed), telling the listener as a change of the view does; `changed`, also where it stayed. */
  check(changed?: boolean): void;
  stop(): void;
}

/** Where `tab` stands in a view. */
export function standingOf(sources: ViewFacts, tab: TrackedTab | null): Standing {
  if (tab === null || sources.tabs.getState().activeTabId !== tab.id) return 'away';
  const { mapPath, mapLoaded, isMapLoading } = sources.store.getState();
  if (!mapLoaded || isMapLoading || mapPath !== tab.filePath) return 'loading';
  return sources.level === undefined || sources.level.shows() ? 'shown' : 'other-level';
}

/**
 * Follows where the presented tab `tab()` stands in one view: every change of the view's tabs, store and level
 * is read, and `listener` hears each change of the standing, of the store, of the active tab and of the level shown, with the standing before.
 */
export function trackPresentedScene(sources: TrackedSources, tab: () => TrackedTab | null, listener: (change: StandingChange) => void): PresentedSceneTracker {
  let last = standingOf(sources, tab());
  let activeTab = sources.tabs.getState().activeTabId;
  let viewed = sources.level?.viewed() ?? null;
  const read = (changed: boolean, levelLoaded: boolean): void => {
    const before = last;
    last = standingOf(sources, tab());
    const tabChanged = activeTab !== (activeTab = sources.tabs.getState().activeTabId);
    const levelChanged = viewed !== (viewed = sources.level?.viewed() ?? null);
    if (last !== before || changed || tabChanged || levelChanged || levelLoaded) listener({ now: last, before, changed, tabChanged, levelChanged, levelLoaded });
  };
  const check = (changed = false): void => read(changed, false);
  const stops = [sources.tabs.subscribe(() => check()), sources.store.subscribe(() => check(true)), ...(sources.level ? [sources.level.follow(() => read(false, true))] : [])];
  return {
    get standing(): Standing {
      return standingOf(sources, tab());
    },
    check,
    stop: () => {
      for (const stop of stops) stop();
    },
  };
}
