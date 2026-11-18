import { useCallback, useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { ArmariumHosts } from '../../../../armarium/armariumHosts';
import type { ExternalImport } from '../../../../services/collectionBundle/externalImport';

/** The Armarium as a place of the asset manager, beside the library's tabs. */
export interface ArmariumPlace {
  /** The store fills the content area in place of the library. */
  shown: boolean;
  /** Changes with Reload: the store's frame mounts anew and loads the page from the store's front. */
  frameKey: number;
  show: () => void;
  /** Back to the library, where the GM left it. */
  leave: () => void;
  reload: () => void;
  /** The newest bundle an install handed this window for its import review. */
  pendingImport: ExternalImport | undefined;
}

/**
 * Whether the asset manager shows the Armarium. Each opening starts on the library unless the Armarium was asked for
 * (`request` above 0, raised by every such request); a request while open shows it too. While open, the window is
 * an `ArmariumHost`, so an install started from its store is reviewed over it; showing the store makes it the newest.
 * `handedImport` is a bundle its owner handed over before the window was a host (`GlobalAssetManagerService`).
 */
export function useArmariumPlace(app: App, isOpen: boolean, request: number, handedImport?: ExternalImport): ArmariumPlace {
  const [shown, setShown] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [pendingImport, setPendingImport] = useState<ExternalImport | undefined>(handedImport);

  useEffect(() => {
    if (isOpen) setShown(request > 0);
  }, [isOpen, request]);

  const show = useCallback((): void => setShown(true), []);
  const leave = useCallback((): void => setShown(false), []);
  const reload = useCallback((): void => setFrameKey((key) => key + 1), []);

  useEffect(() => {
    if (handedImport) setPendingImport(handedImport);
  }, [handedImport]);

  useEffect(() => {
    if (!isOpen) return undefined;
    // Attached anew whenever `shown` changes: the window that shows the store is the newest.
    return ArmariumHosts.forApp(app).attach({ show, review: setPendingImport });
  }, [app, isOpen, shown, show]);

  return { shown, frameKey, show, leave, reload, pendingImport };
}
