import type { Workspace, WorkspaceLeaf } from 'obsidian';
import { getActiveWorkspaceLeaf } from './embeddedLeafFocus';

/**
 * Returns true when the currently active Obsidian workspace leaf
 * contains an Atlas VTT view (map canvas or player view).
 *
 * When `viewId` is provided, checks that the **specific** view's
 * container lives inside the active leaf — this is essential when
 * multiple Atlas views are open side-by-side.
 *
 * The active leaf is looked for in the focused window's document (`activeDocument`): a leaf in a
 * popout lies in the popout's, and the main window's then holds no active leaf.
 */
export function isActiveAtlasLeaf(viewId?: string): boolean {
  const activeLeaf = activeDocument.querySelector('.workspace-leaf.mod-active');
  if (!activeLeaf) return false;

  // Scoped check: does THIS view live inside the active leaf?
  if (viewId) {
    return activeLeaf.querySelector(`[data-view-id="${viewId}"]`) !== null;
  }

  // Broad check: does the active leaf contain any atlas view?
  return (
    activeLeaf.querySelector('.atlas-react-ui-container') !== null ||
    activeLeaf.querySelector('#atlas-pixi-canvas-debug') !== null ||
    activeLeaf.querySelector('.view-content[data-type="atlas-vtt"]') !== null
  );
}

/**
 * Returns true when a keyboard shortcut scope is currently active.
 *
 * For content inside an Obsidian workspace leaf, this means that leaf must be active.
 * For portaled modals/overlays outside the workspace leaf tree, this means focus must
 * currently live inside the provided scope.
 */
export function isShortcutScopeActive(scope: Element | null, viewId?: string): boolean {
  if (scope) {
    const workspaceLeaf = scope.closest('.workspace-leaf');
    if (workspaceLeaf) {
      return workspaceLeaf.classList.contains('mod-active');
    }

    const activeElement = scope.doc.activeElement;
    if (activeElement !== null && scope.contains(activeElement)) {
      return true;
    }
  }

  return isActiveAtlasLeaf(viewId);
}

type FocusWorkspaceLike = Pick<Workspace, 'getActiveViewOfType' | 'setActiveLeaf'>;

/**
 * Reclaim workspace ownership for a custom Atlas view when another leaf keeps
 * a focused editor/input alive after a tab switch.
 */
export function claimWorkspaceLeafFocus(
  workspace: FocusWorkspaceLike | null | undefined,
  leaf: WorkspaceLeaf | null | undefined,
  container: HTMLElement | null,
): void {
  if (!workspace || !leaf || !container) {
    return;
  }

  if (getActiveWorkspaceLeaf(workspace) !== leaf) {
    workspace.setActiveLeaf(leaf, { focus: false });
  }

  const targetLeafEl = container.closest('.workspace-leaf');
  const activeElement = document.activeElement;
  const activeLeafEl = activeElement instanceof HTMLElement
    ? activeElement.closest('.workspace-leaf')
    : null;

  const shouldFocusContainer =
    activeElement === document.body ||
    activeElement === null ||
    (targetLeafEl !== null && activeLeafEl !== null && activeLeafEl !== targetLeafEl);

  if (shouldFocusContainer && typeof container.focus === 'function') {
    if (container.tabIndex < 0) {
      container.tabIndex = -1;
    }
    container.focus({ preventScroll: true });
  }
}
