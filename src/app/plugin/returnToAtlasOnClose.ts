import { Plugin, Workspace, WorkspaceLeaf } from 'obsidian';
import { ATLAS_VIEW_TYPE } from '../atlasViewType';

function isOpen(workspace: Workspace, leaf: WorkspaceLeaf): boolean {
  let open = false;
  workspace.iterateAllLeaves((candidate) => {
    if (candidate === leaf) open = true;
  });
  return open;
}

/**
 * Obsidian activates the right-hand neighbour of a closed tab, and opens new
 * tabs right after the active one. A note opened from the Atlas view (a
 * statblock, a pin's note) therefore closes onto an unrelated tab. When the
 * active tab closes and the tab active before it was the Atlas view, return
 * to the Atlas view instead.
 */
export function registerReturnToAtlasOnClose(plugin: Plugin): void {
  const { workspace } = plugin.app;
  let current: WorkspaceLeaf | null = null;
  let previous: WorkspaceLeaf | null = null;

  plugin.registerEvent(workspace.on('active-leaf-change', (leaf) => {
    if (!leaf || leaf === current) return;

    const atlasLeaf = previous;
    const closedFromAtlas = current !== null
      && atlasLeaf !== null
      && leaf !== atlasLeaf
      && !isOpen(workspace, current)
      && workspace.getLeavesOfType(ATLAS_VIEW_TYPE).includes(atlasLeaf);

    if (closedFromAtlas) {
      previous = null;
      current = atlasLeaf;
      workspace.setActiveLeaf(atlasLeaf, { focus: true });
      return;
    }

    previous = current;
    current = leaf;
  }));
}
