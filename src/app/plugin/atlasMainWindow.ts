import type { App, ViewState, Workspace, WorkspaceLeaf } from 'obsidian';
import { ATLAS_VIEW_TYPE, isAtlasView } from '../atlasViewType';
import { t } from '../i18n';
import { showNotice } from '../ui/notice';

/** How often a move waits for a leaf Obsidian is still opening a view in, and how long between tries. */
const BUSY_RETRIES = 5;
const BUSY_RETRY_MS = 100;

/** Leaves being moved back, so a layout change during a move starts no second one. */
const moving = new WeakSet<WorkspaceLeaf>();

/**
 * Whether `leaf` lies in Obsidian's main window (its sidebars included), not in a popout. A leaf
 * outside every window (detached) counts as the main window's: Obsidian reports `rootSplit` for it.
 */
export function inMainWindow(workspace: Workspace, leaf: WorkspaceLeaf): boolean {
  return leaf.getContainer() === workspace.rootSplit;
}

/**
 * A leaf in the main window's main area for a map: an empty tab there is taken, else a new tab
 * opens beside the tab used last. Never a popout's, whichever window has the focus.
 */
export function mainWindowLeaf(workspace: Workspace): WorkspaceLeaf {
  const recent = workspace.getMostRecentLeaf(workspace.rootSplit);
  if (!recent) return workspace.createLeafInParent(workspace.rootSplit, 0);
  if (recent.view.getViewType() === 'empty') return recent;
  // A new tab opens beside the tab used last, which is this one once it is the active leaf
  workspace.setActiveLeaf(recent, { focus: false });
  const leaf = workspace.getLeaf('tab');
  if (inMainWindow(workspace, leaf)) return leaf;
  leaf.detach();
  return workspace.createLeafInParent(recent.parent, 0);
}

/**
 * The view state `leaf`'s map opens with again: its scene tabs, the active one and each tab's
 * camera. A view in a popout never loads its scene (`AtlasView.onOpen`), so the scene it was
 * opened on is in its `file` alone.
 */
function stateToReopen(leaf: WorkspaceLeaf): ViewState {
  const { type, state, pinned } = leaf.getViewState();
  const reopened: Record<string, unknown> = { ...state };
  const view = leaf.view;
  if (typeof reopened.file !== 'string' && isAtlasView(view) && view.file) reopened.file = view.file.path;
  return { type, state: reopened, active: true, ...(pinned === undefined ? {} : { pinned }) };
}

/**
 * Moves the map in `leaf` from a popout back into the main window: its view closes there first,
 * which saves what is pending of its scene, and the main window's leaf opens the map from its
 * view state, so its scenes load fresh there. Nothing of a scene is written by the move itself.
 * False when Obsidian is still opening a view in `leaf`, which then stays where it is.
 */
async function moveToMainWindow(workspace: Workspace, leaf: WorkspaceLeaf): Promise<boolean> {
  const state = stateToReopen(leaf);
  await leaf.setViewState({ type: 'empty' });
  if (leaf.view.getViewType() === ATLAS_VIEW_TYPE) return false;
  leaf.detach();
  const target = mainWindowLeaf(workspace);
  await target.setViewState(state);
  await workspace.revealLeaf(target);
  return true;
}

/** Tells the GM that Atlas runs in the main window, and how to use two screens instead. */
export function showMainWindowNotice(): void {
  showNotice(t('view.mainWindowOnly'));
}

async function bringBack(app: App, leaf: WorkspaceLeaf, retries: number): Promise<void> {
  moving.add(leaf);
  try {
    if (await moveToMainWindow(app.workspace, leaf)) {
      showMainWindowNotice();
      return;
    }
  } finally {
    moving.delete(leaf);
  }
  if (retries > 0) window.setTimeout(() => keepLeafInMainWindow(app, leaf, retries - 1), BUSY_RETRY_MS);
}

function keepLeafInMainWindow(app: App, leaf: WorkspaceLeaf, retries: number): void {
  const { workspace } = app;
  if (moving.has(leaf) || leaf.view.getViewType() !== ATLAS_VIEW_TYPE || inMainWindow(workspace, leaf)) return;
  bringBack(app, leaf, retries).catch((error: unknown) => {
    console.error('[Atlas] Could not move the map back into the main window:', error);
  });
}

/**
 * Atlas runs in Obsidian's main window only: a map in a popout (a tab dragged out, "Move to new
 * window", "Open in new window", a workspace restored that way) goes back to the main window
 * with its scenes, and a notice says how to use two screens instead. The players' window and
 * every other Atlas view may live in popouts.
 */
export function keepAtlasInMainWindow(app: App): void {
  for (const leaf of app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)) keepLeafInMainWindow(app, leaf, BUSY_RETRIES);
}
