/**
 * Opening a native statblock note (§7.1): the note opens in a leaf like any
 * note, and its statblock shows beside it in the same view (note-panel/).
 * Every way in is behind the `statblockEditor` experimental switch.
 */

import { TFile, type App, type WorkspaceLeaf } from 'obsidian';
import { showNotice } from '../../ui/notice';
import { experimentalFeatureOn } from '../../experimental/experimentalFeatures';
import { NoteStatblockPanels } from './note-panel/noteStatblockPanels';
import { t } from '../../i18n';

/** Where a statblock is opened from; the map's open beside the map, never over it. */
export type StatblockEditorEntry = 'map' | 'asset-manager' | 'command' | 'note' | 'link-dialog';

export interface OpenStatblockEditorOptions {
  notePath: string;
  /** The entry point's collection; resolved from the note's tokens when absent. */
  collectionId?: string | null;
  from?: StatblockEditorEntry;
  /** Focus the first empty value, as after creating the statblock. */
  focusFirstEmpty?: boolean;
}

/** The map view's type (`ATLAS_VIEW_TYPE`); not imported, which would load the whole map view. */
const MAP_VIEW_TYPE = 'atlas-vtt';
/** Leaves a note may open in, replacing what they show. */
const REPLACEABLE_VIEW_TYPES: ReadonlySet<string> = new Set(['markdown', 'empty']);

/** Every leaf of every window. A callback that returns a value stops Obsidian's iteration, so the body is a block. */
function allLeaves(app: App): WorkspaceLeaf[] {
  const leaves: WorkspaceLeaf[] = [];
  app.workspace.iterateAllLeaves((leaf) => {
    leaves.push(leaf);
  });
  return leaves;
}

function viewTypeOf(leaf: WorkspaceLeaf): string {
  return leaf.getViewState().type;
}

/** The note a leaf shows, read from its view state so that a deferred leaf (no view yet) answers too. */
export function leafNotePath(leaf: WorkspaceLeaf): string | null {
  const state = leaf.getViewState();
  const file = state.state?.file;
  return state.type === 'markdown' && typeof file === 'string' ? file : null;
}

/**
 * Where the note opens: the leaf already showing it, else the current leaf
 * when it shows a note or nothing, else a new tab. A map is never replaced:
 * from the map, or with a map as the current leaf, the note splits to its
 * right, so the canvas stays in view.
 */
function noteLeafFor(app: App, notePath: string, from: StatblockEditorEntry | undefined): WorkspaceLeaf {
  const leaves = allLeaves(app);
  const showing = leaves.find((leaf) => leafNotePath(leaf) === notePath);
  if (showing) return showing;
  const current = app.workspace.getMostRecentLeaf();
  const map = current && viewTypeOf(current) === MAP_VIEW_TYPE
    ? current
    : from === 'map' ? leaves.find((leaf) => viewTypeOf(leaf) === MAP_VIEW_TYPE) : undefined;
  if (map) return app.workspace.createLeafBySplit(map, 'vertical');
  if (current && REPLACEABLE_VIEW_TYPES.has(viewTypeOf(current))) return current;
  return app.workspace.getLeaf('tab');
}

/** Opens a native statblock note, or focuses the leaf already showing it; its statblock shows beside it, also when hidden. */
export async function openStatblockEditor(app: App, options: OpenStatblockEditorOptions): Promise<void> {
  if (!experimentalFeatureOn(app, 'statblockEditor')) return;
  const file = app.vault.getAbstractFileByPath(options.notePath);
  if (!(file instanceof TFile)) {
    showNotice(t('statblockEditor.notFound', { path: options.notePath }));
    return;
  }
  const leaf = noteLeafFor(app, file.path, options.from);
  if (leafNotePath(leaf) !== file.path) await leaf.openFile(file, { active: true });
  // A leaf in a tab that is not shown may stay deferred.
  await leaf.loadIfDeferred();
  app.workspace.setActiveLeaf(leaf, { focus: true });
  NoteStatblockPanels.forApp(app)?.reveal(leaf, {
    collectionId: options.collectionId,
    focusFirstEmpty: options.focusFirstEmpty,
  });
}
