import type { App, WorkspaceLeaf } from 'obsidian';
import type { PresentedScene } from '../../services/presentedScene';
import type { TabMetaState } from '../../stores/tabMetaStore';
import { mapViewOf, type SceneState } from './atlasView.ts';

/** Atlas's command that shows the active map tab's scene on the player view, as the eye on a scene tab does. */
export const PRESENT_COMMAND = 'atlas-vtt:send-map-to-player-view';

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

/**
 * The open Atlas tab Atlas presents: the tab with the presented id, else (tab ids made anew) the first
 * tab of the presented file, as Atlas reconnects its player window; null when no open view has it.
 */
export function findPresentedTab(leaves: readonly WorkspaceLeaf[], presented: PresentedScene | null): PresentedTab | null {
  if (presented === null) return null;
  let byFile: PresentedTab | null = null;
  for (const leaf of leaves) {
    const view = mapViewOf(leaf);
    if (view === null || view.atlasStore.getState().isPlayerView === true) continue;
    const tabs = view.tabMetaStore;
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
