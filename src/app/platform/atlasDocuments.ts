import type { Plugin } from 'obsidian';

/**
 * Runs `enter` for every document Atlas renders in: the main window's and each popout's, now and
 * as windows open. What `enter` returns runs when its window closes, or with Atlas' unload.
 */
export function inEveryDocument(plugin: Plugin, enter: (doc: Document) => () => void): void {
  const leaving = new Map<Document, () => void>();
  const start = (doc: Document): void => {
    if (!leaving.has(doc)) leaving.set(doc, enter(doc));
  };
  const stop = (doc: Document): void => {
    leaving.get(doc)?.();
    leaving.delete(doc);
  };
  start(document);
  plugin.app.workspace.iterateAllLeaves((leaf) => start(leaf.view.containerEl.doc));
  plugin.registerEvent(plugin.app.workspace.on('window-open', (_workspaceWindow, win) => start(win.document)));
  plugin.registerEvent(plugin.app.workspace.on('window-close', (_workspaceWindow, win) => stop(win.document)));
  plugin.register(() => {
    for (const doc of Array.from(leaving.keys())) stop(doc);
  });
}
