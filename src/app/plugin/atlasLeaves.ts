import { App, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { ATLAS_VIEW_TYPE, isAtlasView } from '../atlasViewType';
import { inMainWindow, keepAtlasInMainWindow, mainWindowLeaf, showMainWindowNotice } from './atlasMainWindow';

function getExistingAtlasLeaf(app: App): WorkspaceLeaf | null {
  return app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)[0] ?? null;
}

/** The loaded Atlas view, or null when none is open (or it is still deferred). */
export function getLoadedAtlasView(app: App): AtlasView | null {
  const view = getExistingAtlasLeaf(app)?.view;
  return isAtlasView(view) ? view : null;
}

/** The loaded Atlas view whose map is held by `store`, or null when no view shows it. */
export function atlasViewOfStore(app: App, store: unknown): AtlasView | null {
  const view = getLoadedAtlasView(app);
  return view?.getStore() === store ? view : null;
}

/** The Atlas view, first loading its leaf if Obsidian deferred it (background tabs after a restart). */
export async function loadAtlasView(app: App): Promise<AtlasView | null> {
  const leaf = getExistingAtlasLeaf(app);
  if (!leaf) return null;
  await leaf.loadIfDeferred();
  return isAtlasView(leaf.view) ? leaf.view : null;
}

/**
 * Opens a map in the Atlas view. Only one Atlas leaf exists at a time, so an
 * already open view receives the map as a scene tab instead of a new leaf.
 */
export async function openMapInView(app: App, mapFile: TFile): Promise<void> {
  const existingLeaf = getExistingAtlasLeaf(app);

  if (existingLeaf) {
    await app.workspace.revealLeaf(existingLeaf);
    const atlasView = existingLeaf.view;
    if (!isAtlasView(atlasView)) return;

    const existingTab = atlasView.tabMetaStore.getState().getTabByFilePath(mapFile.path);
    if (existingTab) {
      await atlasView.switchToTab(existingTab.id);
    } else {
      await atlasView.onLoadFile(mapFile);
    }
    return;
  }

  // In the main window, also while a popout has the focus: Atlas runs there alone
  let leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
  if (!leaf || leaf.getViewState().pinned) {
    leaf = mainWindowLeaf(app.workspace);
  }

  await leaf.loadIfDeferred();
  await leaf.setViewState({ type: ATLAS_VIEW_TYPE, state: { file: mapFile.path } });
  await app.workspace.revealLeaf(leaf);
}

/**
 * Folds duplicate Atlas leaves (e.g. from drag-to-split or "Open in new window") into the first
 * one in the main window, re-opening their maps there as scene tabs.
 */
function mergeDuplicateAtlasLeaves(app: App): void {
  const { workspace } = app;
  const leaves = workspace.getLeavesOfType(ATLAS_VIEW_TYPE);
  // None in the main window yet: they fold once one is back there (`keepAtlasInMainWindow`)
  const primaryLeaf = leaves.find((leaf) => inMainWindow(workspace, leaf));
  const extraLeaves = leaves.filter((leaf) => leaf !== primaryLeaf);
  if (!primaryLeaf || extraLeaves.length === 0) return;

  for (const extraLeaf of extraLeaves) {
    const extraView = extraLeaf.view;
    const file = isAtlasView(extraView) ? extraView.file : null;
    if (!inMainWindow(workspace, extraLeaf)) showMainWindowNotice();
    extraLeaf.detach();

    if (file && isAtlasView(primaryLeaf.view)) {
      void primaryLeaf.view.onLoadFile(file);
    }
  }
  void app.workspace.revealLeaf(primaryLeaf);
}

/** Closes the scene tab of a map file, if the Atlas view has it open. */
export function closeMapTab(app: App, mapPath: string): void {
  const atlasView = getLoadedAtlasView(app);
  const tab = atlasView?.tabMetaStore.getState().getTabByFilePath(mapPath);
  if (atlasView && tab) void atlasView.closeTab(tab.id);
}

/**
 * Keeps a single Atlas leaf, in the main window: leaves split off by the user fold back into it
 * as scene tabs, and the one leaf moves back from a popout (`keepAtlasInMainWindow`).
 */
export function registerAtlasLeafSync(plugin: Plugin): void {
  const { app } = plugin;
  const keep = (): void => {
    mergeDuplicateAtlasLeaves(app);
    keepAtlasInMainWindow(app);
  };
  plugin.registerEvent(app.workspace.on('layout-change', keep));
  // A workspace restored with the map in a popout
  app.workspace.onLayoutReady(keep);
}
