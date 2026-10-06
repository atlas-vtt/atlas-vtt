import { Plugin, WorkspaceLeaf } from 'obsidian';
import { ATLAS_VIEW_TYPE } from '../atlas-view';
import { DASHBOARD_VIEW_TYPE } from '../dashboard-view';

const HIDE_STATUS_BAR_CLASS = 'atlas-hide-status-bar';
const FULL_BLEED_VIEW_TYPES = [ATLAS_VIEW_TYPE, DASHBOARD_VIEW_TYPE];

/**
 * Hides Obsidian's status bar while an Atlas view is active, since it would
 * cover the bottom-right corner of the map. The rule lives in `styles/main.scss`.
 */
export function registerStatusBarVisibility(plugin: Plugin): void {
  const update = (leaf: WorkspaceLeaf | null): void => {
    if (!leaf) return;
    document.body.toggleClass(HIDE_STATUS_BAR_CLASS, FULL_BLEED_VIEW_TYPES.includes(leaf.view.getViewType()));
  };

  plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', update));
  plugin.register(() => document.body.removeClass(HIDE_STATUS_BAR_CLASS));

  update(plugin.app.workspace.getMostRecentLeaf());
}
