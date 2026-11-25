import type { Plugin } from 'obsidian';
import { followEveryDocument } from '../platform/atlasDocuments';
import { keepReactOffDocument, releaseLibraryGlobals, takeLibraryGlobals } from '../react/libraryGlobals';

/**
 * Keeps what React and framer-motion put on the page from outliving Atlas (`libraryGlobals.ts`): React
 * is kept off the main window's document and every popout's, and framer-motion's window listener is
 * removed when Atlas unloads. Call before anything of Atlas renders.
 */
export function registerPageListenerRelease(plugin: Plugin): void {
  const globals = takeLibraryGlobals();
  const docs = new Set<Document>();
  const stopFollowing = followEveryDocument(plugin.app.workspace, (doc) => {
    docs.add(doc);
    keepReactOffDocument(globals, doc);
    return () => docs.delete(doc);
  });
  plugin.register(() => {
    releaseLibraryGlobals(globals, docs);
    stopFollowing();
  });
}
