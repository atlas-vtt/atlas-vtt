/** A map's size in world pixels. */
export interface MapSize { width: number; height: number }

interface SizedSprite { width: number; height: number; destroyed: boolean }

/** The loaded background's size, read from the view's renderer; 0 × 0 while none is loaded. */
export function loadedMapSize(view: { readonly renderer?: { getBackgroundSprite(): SizedSprite | null } | null }): MapSize {
  const sprite = view.renderer?.getBackgroundSprite() ?? null;
  if (!sprite || sprite.destroyed || !(sprite.width > 0) || !(sprite.height > 0)) return { width: 0, height: 0 };
  return { width: sprite.width, height: sprite.height };
}
