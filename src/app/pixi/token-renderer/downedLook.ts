/** How a downed token looks. Part of the shared drawing contract; no PIXI imports. */
export const DOWNED_LOOK = {
  /** The skull's height as a share of the token's diameter. */
  skullShare: 0.46,
  /** The skull is a quiet marker: the grey token already says most of it. */
  markerOpacity: 0.72,
} as const;
