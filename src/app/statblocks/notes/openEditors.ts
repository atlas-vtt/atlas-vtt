/**
 * The Markdown views that hold a note, in every window (spike S2).
 *
 * - A deferred leaf (a background tab after a reload) has no `MarkdownView` yet, though
 *   `getLeavesOfType('markdown')` lists it: only `instanceof MarkdownView` tells. Views are
 *   objects of the main window's realm in popouts too, so `instanceof` holds there.
 * - In Reading view the view's editor is a hidden, stale buffer: a transaction there is lost.
 *   Only views in an editing mode take writes; any view gives the note's text through
 *   `getViewData()`, which in Reading view follows edits made in other leaves.
 */

import { MarkdownView, type App } from 'obsidian';

/** On the container of a Markdown view while its statblock shows beside the note; writes prefer that view's editor. */
export const STATBLOCK_NOTE_CLASS = 'atlas-sb-note';

/** Every loaded Markdown view in the workspace, in any window and mode. */
export function loadedMarkdownViews(app: App): MarkdownView[] {
  const views: MarkdownView[] = [];
  app.workspace.iterateAllLeaves((leaf) => {
    // A block body: a truthy return value would stop the iteration.
    if (leaf.view instanceof MarkdownView) views.push(leaf.view);
  });
  return views;
}

/** The loaded Markdown views of a note, in any window and mode. */
export function loadedViewsOf(app: App, path: string): MarkdownView[] {
  return loadedMarkdownViews(app).filter((view) => view.file?.path === path);
}

/** The view whose editor holds the note and takes writes: an editing one, one showing its statblock first; null when none. */
export function editingViewOf(app: App, path: string): MarkdownView | null {
  const editing = loadedViewsOf(app, path).filter(isEditing);
  return editing.find(showsStatblock) ?? editing[0] ?? null;
}

/** The view to read the note from: an editing one (it holds unsaved typing), else one in Reading view; null when none. */
export function bufferViewOf(app: App, path: string): MarkdownView | null {
  const views = loadedViewsOf(app, path);
  return views.find(isEditing) ?? views[0] ?? null;
}

/** Whether the view shows its note's statblock beside it. */
function showsStatblock(view: MarkdownView): boolean {
  return view.containerEl.classList.contains(STATBLOCK_NOTE_CLASS);
}

/** Live Preview and Source mode; Obsidian names both `source`. */
function isEditing(view: MarkdownView): boolean {
  return view.getMode() === 'source';
}
