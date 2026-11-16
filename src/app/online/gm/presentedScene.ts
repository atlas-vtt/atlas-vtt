import type { App, WorkspaceLeaf } from 'obsidian';
import type { PresentedSceneSource } from '../../services/presentedScene';
import type { TabMetaState } from '../../stores/tabMetaStore';
import { field } from './atlasLighting.ts';
import type { SceneState } from './atlasView.ts';

/** Atlas's command that shows the active map tab's scene on the player view, as the eye on a scene tab does. */
export const PRESENT_COMMAND = 'atlas-vtt:send-map-to-player-view';

/** The scene tab Atlas presents to its player view (`PresentedScene`): its tab id, map file and level. */
export interface Presented {
  readonly tabId: string;
  readonly filePath: string;
  /** The level of a scene with several that players see; unset is the first. */
  readonly levelId?: string;
}

/** A view's scene tabs (`AtlasView.tabMetaStore`), as far as the companion reads them. */
export interface TabSource {
  getState(): Pick<TabMetaState, 'tabs' | 'activeTabId'>;
  subscribe(listener: () => void): () => void;
}

/** The presented tab as found in an open Atlas view: its leaf, the view's tabs, and the tab's id, file and name now. */
export interface PresentedTab {
  readonly leaf: WorkspaceLeaf;
  readonly tabs: TabSource;
  readonly tabId: string;
  readonly filePath: string;
  readonly name: string;
  /** The level players see, as Atlas presents it; unset is the first. */
  readonly levelId?: string;
}

/** The state of a zustand store (Atlas's are functions with the store methods on them), or undefined for anything else. */
function stateOf(store: unknown): unknown {
  if ((typeof store !== 'object' && typeof store !== 'function') || store === null || !('getState' in store)) return undefined;
  const read: unknown = store.getState;
  return typeof read === 'function' ? (read as () => unknown).call(store) : undefined;
}

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** The presented scene `state` names, or null for anything else. */
export function readPresented(state: unknown): Presented | null {
  if (typeof state !== 'object' || state === null) return null;
  const { tabId, filePath, levelId } = state as Record<string, unknown>;
  if (!isText(tabId) || !isText(filePath)) return null;
  return isText(levelId) ? { tabId, filePath, levelId } : { tabId, filePath };
}

/** Atlas's presented scene as its plugin instance offers it (`presentedScene`), or null when it has none. */
export function presentedSceneSource(app: App): PresentedSceneSource | null {
  // Obsidian keeps the loaded plugins by id in `app.plugins.plugins`.
  const source = field(field(field(field(app, 'plugins'), 'plugins'), 'atlas-vtt'), 'presentedScene');
  return typeof field(source, 'get') === 'function' && typeof field(source, 'onChange') === 'function' ? (source as PresentedSceneSource) : null;
}

/** What `showPresentedElsewhere` registered with: the presented scene it told, and the call that stops it. */
export interface ShownElsewhere {
  readonly source: object;
  readonly stop: () => void;
}

/**
 * Tells Atlas that players see its presented scene online, so its eye on a scene tab moves the table
 * to the scene instead of opening the local player window. Null for an Atlas without the call.
 */
export function showPresentedElsewhere(app: App): ShownElsewhere | null {
  const source = presentedSceneSource(app);
  // Read at runtime: the vendored Atlas types predate `showElsewhere`.
  const show = field(source, 'showElsewhere');
  if (source === null || typeof show !== 'function') return null;
  const stop: unknown = show.call(source);
  if (typeof stop !== 'function') return null;
  const end = stop as () => void;
  return { source, stop: () => end() };
}

/**
 * The scene tab Atlas shows its players ("Show … on the player view"), whether or not its player
 * window is open; null while it presents nothing or cannot be read.
 */
export function presentedScene(app: App): Presented | null {
  return readPresented(presentedSceneSource(app)?.get());
}

/** A view's scene tabs, or null when it has none the companion can read (another view, another Atlas version). */
export function tabSourceOf(view: unknown): TabSource | null {
  const tabs: unknown = typeof view === 'object' && view !== null && 'tabMetaStore' in view ? view.tabMetaStore : undefined;
  if ((typeof tabs !== 'object' && typeof tabs !== 'function') || tabs === null) return null;
  if (!('subscribe' in tabs) || typeof tabs.subscribe !== 'function') return null;
  const state = stateOf(tabs);
  return typeof state === 'object' && state !== null && 'tabs' in state && Array.isArray(state.tabs) ? (tabs as TabSource) : null;
}

const isPlayerView = (view: unknown): boolean => {
  const state = stateOf(typeof view === 'object' && view !== null && 'atlasStore' in view ? view.atlasStore : undefined);
  return typeof state === 'object' && state !== null && 'isPlayerView' in state && state.isPlayerView === true;
};

/**
 * The open Atlas tab Atlas presents: the tab with the presented id, else (tab ids made anew) the first
 * tab of the presented file, as Atlas reconnects its player window; null when no open view has it.
 */
export function findPresentedTab(leaves: readonly WorkspaceLeaf[], presented: Presented | null): PresentedTab | null {
  if (presented === null) return null;
  let byFile: PresentedTab | null = null;
  for (const leaf of leaves) {
    const tabs = tabSourceOf(leaf.view);
    if (tabs === null || isPlayerView(leaf.view)) continue;
    for (const tab of tabs.getState().tabs) {
      const found = { leaf, tabs, tabId: tab.id, filePath: tab.filePath, name: tab.displayName, ...(presented.levelId ? { levelId: presented.levelId } : {}) };
      if (tab.id === presented.tabId) return found;
      if (byFile === null && tab.filePath === presented.filePath) byFile = found;
    }
  }
  return byFile;
}

/**
 * Whether a view's store holds the presented tab's scene now: the tab is active and its scene loaded.
 * Whichever of its levels the GM looks at, online players go on seeing theirs: each the floor their
 * token stands on, those without one the presented level (`SceneShare`).
 */
export function showsPresented(state: Pick<SceneState, 'mapPath' | 'mapLoaded' | 'isMapLoading'>, presented: PresentedTab): boolean {
  return presented.tabs.getState().activeTabId === presented.tabId && state.mapPath === presented.filePath && state.mapLoaded && !state.isMapLoading;
}

interface Commands {
  executeCommandById(id: string): boolean;
}

const commandsOf = (app: App): Commands | null => {
  const commands: unknown = (app as unknown as { commands?: unknown }).commands;
  return typeof commands === 'object' && commands !== null && 'executeCommandById' in commands && typeof commands.executeCommandById === 'function' ? (commands as Commands) : null;
};

/**
 * Shows the active scene tab of `leaf` on Atlas's player view through Atlas's own command (it presents
 * the scene, with or without the player window), so players online and at the table see the same
 * scene; false when Atlas has no such command.
 */
export function presentOnPlayerView(app: App, leaf: WorkspaceLeaf): boolean {
  const commands = commandsOf(app);
  if (commands === null) return false;
  // Atlas's command presents the active view's tab: the view whose control was pressed.
  app.workspace.setActiveLeaf(leaf, { focus: false });
  return commands.executeCommandById(PRESENT_COMMAND);
}
