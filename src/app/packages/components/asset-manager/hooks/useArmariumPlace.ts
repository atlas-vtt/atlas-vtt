import { useCallback, useEffect, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { ArmariumHosts } from '../../../../armarium/armariumHosts';
import { ARMARIUM_PAGE_URL, isArmariumPageUrl } from '../../../../armarium/armariumUrls';
import type { ExternalImport } from '../../../../services/collectionBundle/externalImport';
import { MOTION_NORMAL_MS } from '../../../../utils/motion';

/** The Armarium as a place of the asset manager, beside the library's tabs. */
export interface ArmariumPlace {
  /** The store fills the content area in place of the library. */
  shown: boolean;
  /**
   * The store's frame exists: from the store's first showing until the window closes, hidden while the library is
   * shown, so going back to the store shows its page as it was left instead of loading it anew.
   */
  framed: boolean;
  /** The library is rendered: while it is shown, and for as long as the store takes to fade in over it. */
  libraryShown: boolean;
  /** Changes with Reload: the store's frame mounts anew and loads the page from the store's front. */
  frameKey: number;
  /** The page the frame opens on: the store's front, or a listing a share just published. */
  page: string;
  show: (page?: string) => void;
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
  const [framed, setFramed] = useState(false);
  const [libraryLeaving, setLibraryLeaving] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [page, setPage] = useState(ARMARIUM_PAGE_URL);
  const [pendingImport, setPendingImport] = useState<ExternalImport | undefined>(handedImport);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    if (!isOpen) return;
    // An opening shows its place at once: the window's own motion brings it in.
    setShown(request > 0);
    setFramed(request > 0);
    setLibraryLeaving(false);
  }, [isOpen, request]);

  useEffect(() => {
    if (!libraryLeaving) return undefined;
    const timer = window.setTimeout(() => setLibraryLeaving(false), MOTION_NORMAL_MS);
    return (): void => window.clearTimeout(timer);
  }, [libraryLeaving]);

  const show = useCallback((target?: string): void => {
    if (!shownRef.current) setLibraryLeaving(true);
    setShown(true);
    setFramed(true);
    // A page is opened in a frame of its own; the front is shown as the frame last left it.
    if (typeof target === 'string' && isArmariumPageUrl(target)) {
      setPage(target);
      setFrameKey((key) => key + 1);
    }
  }, []);
  const leave = useCallback((): void => {
    setShown(false);
    setLibraryLeaving(false);
  }, []);
  const reload = useCallback((): void => {
    setPage(ARMARIUM_PAGE_URL);
    setFrameKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (handedImport) setPendingImport(handedImport);
  }, [handedImport]);

  useEffect(() => {
    if (!isOpen) return undefined;
    // Attached anew whenever `shown` changes: the window that shows the store is the newest.
    return ArmariumHosts.forApp(app).attach({ show, review: setPendingImport });
  }, [app, isOpen, shown, show]);

  return { shown, framed, libraryShown: !shown || libraryLeaving, frameKey, page, show, leave, reload, pendingImport };
}
