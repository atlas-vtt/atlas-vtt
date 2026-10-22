import { App, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { ATLAS_VIEW_TYPE, isAtlasView } from '../atlasViewType';

function getExistingAtlasLeaf(app: App): WorkspaceLeaf | null {
  return app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)[0] ?? null;
}

/** The loaded Atlas view, or null when none is open (or it is still deferred). */
export function getLoadedAtlasView(app: App): AtlasView | null {
  const view = getExistingAtlasLeaf(app)?.view;
  return isAtlasView(view) ? view : null;
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

  let leaf = app.workspace.getMostRecentLeaf();
  if (!leaf || leaf.getViewState().pinned) {
    leaf = app.workspace.getLeaf('tab');
  }

  await leaf.loadIfDeferred();
  await leaf.setViewState({ type: ATLAS_VIEW_TYPE, state: { file: mapFile.path } });
  await app.workspace.revealLeaf(leaf);
}

/**
 * Folds duplicate Atlas leaves (e.g. from drag-to-split) into the first one,
 * re-opening their maps there as scene tabs.
 */
function mergeDuplicateAtlasLeaves(app: App): void {
  const [primaryLeaf, ...extraLeaves] = app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE);
  if (!primaryLeaf || extraLeaves.length === 0) return;

  for (const extraLeaf of extraLeaves) {
    const extraView = extraLeaf.view;
    const file = isAtlasView(extraView) ? extraView.file : null;
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

/** Keeps a single Atlas leaf: leaves split off by the user fold back into it as scene tabs. */
export function registerAtlasLeafSync(plugin: Plugin): void {
  plugin.registerEvent(
    plugin.app.workspace.on('layout-change', () => mergeDuplicateAtlasLeaves(plugin.app))
  );
}
