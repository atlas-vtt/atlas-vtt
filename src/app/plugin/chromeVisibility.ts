import type { Plugin, View, WorkspaceLeaf } from 'obsidian';
import { ATLAS_VIEW_TYPE } from '../atlasViewType';
import { DASHBOARD_VIEW_TYPE } from '../dashboard-view';
import { DUNGEON_GENERATOR_VIEW_TYPE } from '../dungeon-generator-view';
import { SOUND_VIEW_TYPE } from '../sound-view';
import { TEMPLATE_EDITOR_VIEW_TYPE } from '../statblocks/editor/templateEditorState';
import { STATBLOCK_NOTE_CLASS } from '../statblocks/notes/openEditors';

const HIDE_STATUS_BAR_CLASS = 'atlas-hide-status-bar';
const HIDE_WINDOW_CONTROLS_CLASS = 'atlas-hide-window-controls';
const STATUS_BAR_VIEW_TYPES = [ATLAS_VIEW_TYPE, DASHBOARD_VIEW_TYPE, TEMPLATE_EDITOR_VIEW_TYPE];
const WINDOW_CONTROLS_VIEW_TYPES = [...STATUS_BAR_VIEW_TYPES, SOUND_VIEW_TYPE, DUNGEON_GENERATOR_VIEW_TYPE];

/** Whether a view's bottom-right corner holds Atlas UI: a map, a template editor, a note with its statblock beside it. */
function coversStatusBar(view: View): boolean {
  return STATUS_BAR_VIEW_TYPES.includes(view.getViewType()) || view.containerEl.hasClass(STATBLOCK_NOTE_CLASS);
}

/** Whether a view is an Atlas page whose top-right corner (a map's widgets) lies under the window's own buttons. */
function coversWindowControls(view: View): boolean {
  return WINDOW_CONTROLS_VIEW_TYPES.includes(view.getViewType());
}

/**
 * Hides Obsidian's chrome where it would cover the active Atlas view: the
 * status bar over its bottom-right corner, and, in a frameless window on
 * Windows and Linux, the minimise, maximise and close buttons over its
 * top-right corner (they show again while hovered). macOS draws its own
 * traffic lights at the top left, which no rule touches. A note's statblock
 * may come or go while the note is active, so the panel's own event asks
 * again. The rules live in `styles/main.scss`.
 */
export function registerChromeVisibility(plugin: Plugin): void {
  let active: WorkspaceLeaf | null = plugin.app.workspace.getMostRecentLeaf();
  const bodies = new Set<HTMLElement>();
  const update = (): void => {
    if (!active) return;
    document.body.toggleClass(HIDE_STATUS_BAR_CLASS, coversStatusBar(active.view));
    // Each window has buttons of its own, which follow the view last active there.
    const body = active.view.containerEl.doc.body;
    bodies.add(body);
    body.toggleClass(HIDE_WINDOW_CONTROLS_CLASS, coversWindowControls(active.view));
  };

  plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', (leaf) => {
    if (!leaf) return;
    active = leaf;
    update();
  }));
  plugin.registerEvent(plugin.app.workspace.on('atlas-vtt:statblock-panel-changed', update));
  plugin.register(() => {
    document.body.removeClass(HIDE_STATUS_BAR_CLASS);
    bodies.forEach((body) => body.removeClass(HIDE_WINDOW_CONTROLS_CLASS));
  });

  update();
}
