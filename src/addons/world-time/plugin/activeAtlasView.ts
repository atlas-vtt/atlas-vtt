import type { Plugin, WorkspaceLeaf } from 'obsidian';
import { AtlasView, ATLAS_VIEW_TYPE } from 'src/app/atlas-view';

/**
 * The Atlas scene the GM used last. Side panes (the timeline) act on it even
 * while they have the focus themselves. Player views never count.
 */
export class ActiveAtlasView {
  private last: AtlasView | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly plugin: Plugin) {
    plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', (leaf) => this.track(leaf)));
    plugin.registerEvent(plugin.app.workspace.on('layout-change', () => {
      if (this.last && !this.isOpen(this.last)) this.set(null);
    }));
    plugin.app.workspace.onLayoutReady(() => this.track(plugin.app.workspace.getMostRecentLeaf()));
  }

  get(): AtlasView | null {
    if (this.last && this.isOpen(this.last)) return this.last;
    const fallback = this.plugin.app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)
      .map((leaf) => leaf.view)
      .find((view): view is AtlasView => view instanceof AtlasView && !view.getStore().getState().isPlayerView);
    return fallback ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private isOpen(view: AtlasView): boolean {
    return this.plugin.app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE).some((leaf) => leaf.view === view);
  }

  private track(leaf: WorkspaceLeaf | null): void {
    const view = leaf?.view;
    if (view instanceof AtlasView && !view.getStore().getState().isPlayerView && view !== this.last) this.set(view);
  }

  private set(view: AtlasView | null): void {
    this.last = view;
    for (const listener of this.listeners) listener();
  }
}
