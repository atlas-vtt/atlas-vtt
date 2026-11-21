import type { Plugin } from 'obsidian';
import { OverlayScrollbars } from '../ui/overlayScrollbars/OverlayScrollbars';
import { canDrawOverlayScrollbars } from '../ui/overlayScrollbars/scrollAreas';

/**
 * Gives Atlas' scroll areas their overlay scrollbars in the main window and in every popout, and takes them away
 * when a window closes or Atlas unloads (the stylesheet that hides the native ones goes with Atlas too). A web
 * view that cannot draw them gets none and keeps its own.
 */
export function registerOverlayScrollbars(plugin: Plugin): void {
  const documents = new Map<Document, OverlayScrollbars>();
  const start = (doc: Document): void => {
    if (!documents.has(doc) && canDrawOverlayScrollbars(doc.defaultView)) documents.set(doc, new OverlayScrollbars(doc));
  };
  const stop = (doc: Document): void => {
    documents.get(doc)?.destroy();
    documents.delete(doc);
  };
  start(document);
  plugin.app.workspace.iterateAllLeaves((leaf) => start(leaf.view.containerEl.doc));
  plugin.registerEvent(plugin.app.workspace.on('window-open', (_workspaceWindow, win) => start(win.document)));
  plugin.registerEvent(plugin.app.workspace.on('window-close', (_workspaceWindow, win) => stop(win.document)));
  plugin.register(() => {
    for (const doc of Array.from(documents.keys())) stop(doc);
  });
}
