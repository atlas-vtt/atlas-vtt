import type { Plugin } from 'obsidian';
import { keepReactOffDocument, releaseLibraryGlobals, takeLibraryGlobals } from '../react/libraryGlobals';

/**
 * Keeps what React and framer-motion put on the page from outliving Atlas (`libraryGlobals.ts`): React
 * is kept off the main window's document and every popout's, and framer-motion's window listener is
 * removed when Atlas unloads. Call before anything of Atlas renders.
 */
export function registerPageListenerRelease(plugin: Plugin): void {
  const globals = takeLibraryGlobals();
  const docs = new Set<Document>();
  const keepOff = (doc: Document): void => {
    docs.add(doc);
    keepReactOffDocument(globals, doc);
  };
  keepOff(document);
  plugin.app.workspace.iterateAllLeaves((leaf) => keepOff(leaf.view.containerEl.doc));
  plugin.registerEvent(plugin.app.workspace.on('window-open', (_workspaceWindow, win) => keepOff(win.document)));
  plugin.registerEvent(plugin.app.workspace.on('window-close', (_workspaceWindow, win) => docs.delete(win.document)));
  plugin.register(() => releaseLibraryGlobals(globals, docs));
}
