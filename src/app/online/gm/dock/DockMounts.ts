import type { WorkspaceLeaf } from 'obsidian';
import { ATLAS_VIEW_TYPE, sceneStoreOf } from '../atlasView.ts';
import { Dock, type DockDeps } from './Dock.ts';

/** The part of Obsidian's workspace the mounts read. */
export interface DockWorkspace {
  getLeavesOfType(type: string): WorkspaceLeaf[];
}

/** A map view's container element; Obsidian's `View.containerEl`. */
function containerOf(leaf: WorkspaceLeaf): HTMLElement | null {
  const view: unknown = leaf.view;
  return typeof view === 'object' && view !== null && 'containerEl' in view && view.containerEl !== null && typeof view.containerEl === 'object' ? (view.containerEl as HTMLElement) : null;
}

/**
 * One control per open Atlas map view: works out which views need one when the layout is ready and on
 * every layout change, keeps one per view object, and removes them all on unload. The player view and
 * the dashboard are other view types; a map view whose store says it is a player view gets none.
 */
export class DockMounts {
  private readonly workspace: DockWorkspace;
  private readonly deps: DockDeps;
  private readonly docks = new Map<object, Dock>();

  constructor(workspace: DockWorkspace, deps: DockDeps) {
    this.workspace = workspace;
    this.deps = deps;
  }

  /** Mounts a control on every map view that lacks one, and removes those of views that are gone. */
  sync(): void {
    const seen = new Set<object>();
    for (const leaf of this.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)) {
      const store = sceneStoreOf(leaf);
      const container = containerOf(leaf);
      if (store === null || container === null || (store.getState() as { isPlayerView?: boolean }).isPlayerView === true) continue;
      const view = leaf.view;
      seen.add(view);
      const dock = this.docks.get(view);
      // A view moved into another window keeps its object; its control listens on the old window.
      if (dock !== undefined && dock.win === container.win) continue;
      dock?.dispose();
      this.docks.set(view, new Dock(leaf, container, store, this.deps));
    }
    for (const [view, dock] of this.docks) {
      if (seen.has(view)) continue;
      dock.dispose();
      this.docks.delete(view);
    }
  }

  /** The control on a leaf's view. */
  dockOf(leaf: WorkspaceLeaf): Dock | undefined {
    return this.docks.get(leaf.view);
  }

  /** Removes every control, giving the toolbar its room back. */
  dispose(): void {
    for (const dock of this.docks.values()) dock.dispose();
    this.docks.clear();
  }
}
