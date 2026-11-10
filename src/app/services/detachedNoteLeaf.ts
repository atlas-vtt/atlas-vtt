import type { App, OpenViewState, TFile, WorkspaceLeaf } from 'obsidian';
import { runInBackground } from '../utils/backgroundTask';
import { getActiveWorkspaceLeaf, suppressActiveLeaf } from '../utils/embeddedLeafFocus';

/** Marks a leaf (and its tab header) Atlas shows inside its own UI; `note-preview-window.scss` hides such tab headers. */
export const ATLAS_PREVIEW_ATTRIBUTE = 'data-atlas-preview';

export interface DetachedNoteLeafOptions {
  /** The leaf that stays active; the one active now when unset. */
  keepActive?: WorkspaceLeaf | null | undefined;
  openState?: OpenViewState | undefined;
}

/**
 * Opens `file` in a leaf of its own, taken out of the workspace's split, so a
 * note can be edited inside Atlas' UI with Obsidian's real editor while the
 * active leaf stays where it was. Obsidian's own activation is held off while
 * the leaf is made and the file loads, so no other tab flashes into view.
 * The caller appends `leaf.view.containerEl` where the note should show and
 * closes the leaf with `closeDetachedNoteLeaf` when it is done. Null when the
 * note could not be opened; throws when the workspace could make no leaf.
 */
export async function openDetachedNoteLeaf(app: App, file: TFile, options: DetachedNoteLeafOptions = {}): Promise<WorkspaceLeaf | null> {
  const workspace = app.workspace;
  const keepActive = options.keepActive ?? getActiveWorkspaceLeaf(workspace);
  const restoreActiveLeaf = suppressActiveLeaf(workspace);
  let leaf: WorkspaceLeaf | null = null;
  try {
    // A workspace without a tab group to make a leaf in throws: the caller hears of it.
    // Typed as always a leaf, but a workspace in the middle of changing may give none.
    leaf = workspace.getLeaf(true);
    if (leaf) {
      leaf.containerEl?.setAttribute(ATLAS_PREVIEW_ATTRIBUTE, 'true');
      leaf.tabHeaderEl?.setAttribute(ATLAS_PREVIEW_ATTRIBUTE, 'true');
      // Out of the split, so the leaf never becomes the active view.
      leaf.detach();
      try {
        await leaf.openFile(file, options.openState);
      } catch (error) {
        console.error('[Atlas] Could not open the note in a leaf of its own:', error);
        leaf.detach();
        leaf = null;
      }
    }
  } finally {
    // Whatever threw (the workspace may have no tab group to make a leaf in), the workspace
    // gets setActiveLeaf back: a release is counted once however often it runs.
    restoreActiveLeaf();
    if (keepActive) workspace.setActiveLeaf(keepActive, { focus: false });
  }
  if (leaf && !leaf.view) {
    console.error('[Atlas] The note\'s view disappeared after opening the file.');
    leaf.detach();
    return null;
  }
  return leaf;
}

/**
 * Takes a leaf `openDetachedNoteLeaf` made out of Atlas' UI and closes it.
 * Its view is emptied before the leaf is detached, which saves what was typed
 * and keeps the note out of Obsidian's "Undo close tab".
 */
export function closeDetachedNoteLeaf(leaf: WorkspaceLeaf): void {
  leaf.view?.containerEl.remove();
  runInBackground(leaf.setViewState({ type: 'empty' }).then(() => leaf.detach()), 'Closing a note shown inside Atlas');
}
