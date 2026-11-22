import type { Plugin, Workspace } from 'obsidian';

/**
 * Runs `enter` for every document Atlas renders in: the main window's and each popout's, now and
 * as windows open. What `enter` returns runs when its window closes, or when the returned function
 * is called, which stops following windows too.
 */
export function followEveryDocument(workspace: Workspace, enter: (doc: Document) => () => void): () => void {
  const leaving = new Map<Document, () => void>();
  const start = (doc: Document): void => {
    if (!leaving.has(doc)) leaving.set(doc, enter(doc));
  };
  const stop = (doc: Document): void => {
    leaving.get(doc)?.();
    leaving.delete(doc);
  };
  start(document);
  workspace.iterateAllLeaves((leaf) => start(leaf.view.containerEl.doc));
  const opened = workspace.on('window-open', (_workspaceWindow, win) => start(win.document));
  const closed = workspace.on('window-close', (_workspaceWindow, win) => stop(win.document));
  return () => {
    workspace.offref(opened);
    workspace.offref(closed);
    for (const doc of Array.from(leaving.keys())) stop(doc);
  };
}

/** `followEveryDocument` for as long as Atlas runs. */
export function inEveryDocument(plugin: Plugin, enter: (doc: Document) => () => void): void {
  plugin.register(followEveryDocument(plugin.app.workspace, enter));
}
