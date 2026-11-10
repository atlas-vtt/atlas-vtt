import type { Plugin, View, WorkspaceLeaf } from 'obsidian';
import { ATLAS_VIEW_TYPE } from '../atlasViewType';
import { DASHBOARD_VIEW_TYPE } from '../dashboard-view';
import { TEMPLATE_EDITOR_VIEW_TYPE } from '../statblocks/editor/templateEditorState';
import { STATBLOCK_NOTE_CLASS } from '../statblocks/notes/openEditors';

const HIDE_STATUS_BAR_CLASS = 'atlas-hide-status-bar';
const HIDING_VIEW_TYPES = [ATLAS_VIEW_TYPE, DASHBOARD_VIEW_TYPE, TEMPLATE_EDITOR_VIEW_TYPE];

/** Whether a view's bottom-right corner holds Atlas UI: a map, a template editor, a note with its statblock beside it. */
function coversStatusBar(view: View): boolean {
  return HIDING_VIEW_TYPES.includes(view.getViewType()) || view.containerEl.hasClass(STATBLOCK_NOTE_CLASS);
}

/**
 * Hides Obsidian's status bar while the active view is one whose bottom-right
 * corner it would cover. A note's statblock may come or go while the note is
 * active, so the panel's own event asks again. The rule lives in `styles/main.scss`.
 */
export function registerStatusBarVisibility(plugin: Plugin): void {
  let active: WorkspaceLeaf | null = plugin.app.workspace.getMostRecentLeaf();
  const update = (): void => {
    if (active) document.body.toggleClass(HIDE_STATUS_BAR_CLASS, coversStatusBar(active.view));
  };

  plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', (leaf) => {
    if (!leaf) return;
    active = leaf;
    update();
  }));
  plugin.registerEvent(plugin.app.workspace.on('atlas-vtt:statblock-panel-changed', update));
  plugin.register(() => document.body.removeClass(HIDE_STATUS_BAR_CLASS));

  update();
}
