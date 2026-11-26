import type { Plugin } from 'obsidian';
import { ContextMenuBridge } from '../input/contextMenuBridge';
import { inEveryDocument } from '../platform/atlasDocuments';

/**
 * A finger's long press opens the menus a right-click opens, in every window Atlas renders in
 * (`ContextMenuBridge`); gone with a window that closes and with Atlas. A mouse never meets it.
 */
export function registerTouchContextMenus(plugin: Plugin): void {
  inEveryDocument(plugin, (doc) => {
    const bridge = new ContextMenuBridge(doc);
    return () => bridge.destroy();
  });
}
