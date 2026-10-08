import { useCallback, useRef, type RefCallback, type RefObject } from 'react';

/** On the body while an asset manager's overlay is in its document; `styles/main.scss` lifts Obsidian's menus above the overlay by it. */
export const ASSET_MANAGER_OPEN_CLASS = 'atlas-asset-manager-open';

/**
 * The overlays in each document. Opening the asset manager while it is open mounts the new
 * overlay before the old one has finished closing, and a popout has a body of its own.
 */
const overlaysOf = new Map<HTMLElement, number>();

function overlayCame(body: HTMLElement): void {
  overlaysOf.set(body, (overlaysOf.get(body) ?? 0) + 1);
  body.classList.add(ASSET_MANAGER_OPEN_CLASS);
}

/** An overlay counted before `releaseOverlayBodyClass` leaves nothing to take: the class may be a later plugin's by then. */
function overlayWent(body: HTMLElement): void {
  const overlays = overlaysOf.get(body);
  if (overlays === undefined) return;
  if (overlays > 1) {
    overlaysOf.set(body, overlays - 1);
    return;
  }
  overlaysOf.delete(body);
  body.classList.remove(ASSET_MANAGER_OPEN_CLASS);
}

/** Takes the class off every body. For the plugin's unload, which does not wait for an overlay to finish closing. */
export function releaseOverlayBodyClass(): void {
  for (const body of overlaysOf.keys()) body.classList.remove(ASSET_MANAGER_OPEN_CLASS);
  overlaysOf.clear();
}

/**
 * A ref for the asset manager's overlay, which also fills `overlay`. The body of the overlay's
 * document carries `ASSET_MANAGER_OPEN_CLASS` for as long as an overlay is mounted there, its
 * closing animation included. A class and not `body:has()`: see `scripts/root-has.js`.
 * It takes `null` instead of returning a ref cleanup: framer-motion calls the ref it forwards
 * with `null` and drops what the ref returns.
 */
export function useOverlayBodyClass(overlay: RefObject<HTMLDivElement | null>): RefCallback<HTMLDivElement> {
  const marked = useRef<HTMLElement | null>(null);
  return useCallback((element: HTMLDivElement | null): void => {
    overlay.current = element;
    const body = element?.ownerDocument.body ?? null;
    if (body === marked.current) return;
    if (marked.current) overlayWent(marked.current);
    if (body) overlayCame(body);
    marked.current = body;
  }, [overlay]);
}
