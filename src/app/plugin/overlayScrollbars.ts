import type { Plugin } from 'obsidian';
import { inEveryDocument } from '../platform/atlasDocuments';
import { OverlayScrollbars } from '../ui/overlayScrollbars/OverlayScrollbars';
import { canDrawOverlayScrollbars } from '../ui/overlayScrollbars/scrollAreas';

/**
 * Gives Atlas' scroll areas their overlay scrollbars in the main window and in every popout, and takes them away
 * when a window closes or Atlas unloads (the stylesheet that hides the native ones goes with Atlas too). A web
 * view that cannot draw them gets none and keeps its own.
 */
export function registerOverlayScrollbars(plugin: Plugin): void {
  inEveryDocument(plugin, (doc) => {
    if (!canDrawOverlayScrollbars(doc.defaultView)) return () => undefined;
    const scrollbars = new OverlayScrollbars(doc);
    return () => scrollbars.destroy();
  });
}
