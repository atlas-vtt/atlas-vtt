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
