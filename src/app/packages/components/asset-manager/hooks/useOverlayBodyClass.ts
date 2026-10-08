import { useCallback, useRef, type RefCallback, type RefObject } from 'react';

/** On the body while the asset manager's overlay is in its document; `styles/main.scss` lifts Obsidian's menus above the overlay by it. */
export const ASSET_MANAGER_OPEN_CLASS = 'atlas-asset-manager-open';

/**
 * A ref for the asset manager's overlay, which also fills `overlay`. The body of the overlay's
 * document carries `ASSET_MANAGER_OPEN_CLASS` for as long as the overlay is mounted, its closing
 * animation included. A class and not `body:has()`: see `tests/unit/stylesheetRootHas.test.ts`.
 * It takes `null` instead of returning a ref cleanup: framer-motion calls the ref it forwards
 * with `null` and drops what the ref returns.
 */
export function useOverlayBodyClass(overlay: RefObject<HTMLDivElement | null>): RefCallback<HTMLDivElement> {
  const marked = useRef<HTMLElement | null>(null);
  return useCallback((element: HTMLDivElement | null): void => {
    overlay.current = element;
    marked.current?.classList.remove(ASSET_MANAGER_OPEN_CLASS);
    marked.current = element?.ownerDocument.body ?? null;
    marked.current?.classList.add(ASSET_MANAGER_OPEN_CLASS);
  }, [overlay]);
}
