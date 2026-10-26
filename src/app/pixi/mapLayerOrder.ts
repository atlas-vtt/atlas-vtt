/**
 * Where the viewport's layers stand that the lighting must not darken. The lighting composite
 * (`LIGHTING_Z_INDEX`, 90) lights everything beneath it like the floor, so marks and tools left
 * at the default zIndex of 0 sank into the dark with the map. These stand above it, below the
 * tokens' nameplates and bars (`TOKEN_UI_Z_INDEX`, 100). The grid stays beneath the tokens and is
 * drawn unlit by the composite itself (`GridMark`).
 */
export const MAP_LAYER_Z = {
  /** The cells under tokens being placed by hand, and their ripples when put down (GM only). */
  placementCells: 91,
  /** The hover, press and Shift-preview highlight of linked hexes (GM only). */
  hexLinks: 92,
  /** The marker on the token whose turn it is: above the lighting, below the tokens' bars. */
  turn: 96,
  /** Note pins (GM only). */
  pins: 98,
  /** The selection frame and the marquee or lasso being drawn. */
  selection: 99,
  /** The ruler being drawn and the measurements left on the map. */
  measure: 99,
  /** The rotate and resize handles of a selected text. */
  textHandles: 99,
  /** The grid alignment tool's points, edges and cursor. */
  gridAlignment: 99,
  /** The button above a group selection that turns it: above the tokens' bars, which must not cover it. */
  groupRotate: 101,
  /** Text objects and the preview of the one being placed. */
  text: 500,
  /** Tokens being placed by hand (GM only): above everything on the map but the laser. */
  placement: 1100,
} as const;
