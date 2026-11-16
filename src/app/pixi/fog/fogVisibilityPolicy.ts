/** How opaque the fog is drawn: as opaque as the GM chose in the GM's view (`gmOpacity`), opaque for players and in the session view. */
export function resolveFogPreviewAlpha(params: {
  isPlayerView: boolean;
  isGMView: boolean;
  gmOpacity: number;
}): number {
  if (params.isPlayerView) {
    return 1.0;
  }
  return params.isGMView ? params.gmOpacity : 1.0;
}

/**
 * Whether a canvas shows the GM's own view, where the fog tool's marks belong: not session view,
 * not the palette's player mode, and not a peek, which `showsPlayers` tells while the store's
 * view switches still say the GM's.
 */
export function showsGmView(state: { isGMView: boolean; isPlayerView: boolean }, showsPlayers?: () => boolean | null): boolean {
  return state.isGMView && !state.isPlayerView && showsPlayers?.() !== true;
}
