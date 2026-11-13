/**
 * Where the viewport's layers stand that the lighting must not darken. The lighting composite
 * (`LIGHTING_Z_INDEX`, 90) lights everything beneath it like the floor, so marks and tools left
 * at the default zIndex of 0 sank into the dark with the map. These stand above it, below the
 * tokens' nameplates and bars (`TOKEN_UI_Z_INDEX`, 100). The grid stays beneath the tokens and is
 * drawn unlit by the composite itself (`GridMark`).
 */
export const MAP_LAYER_Z = {
  /** The map image, beneath everything. */
  mapImage: -2,
  /** Water, lava and acid moving on the map image, beneath the grid and all the lighting lights after the map. */
  liquids: -1,
  /**
   * Drawings and texts put on the map: above the map image and its liquids, under the grid, the
   * measured areas and the tokens, so a filled room keeps its grid lines and the lighting lights
   * it like the floor.
   */
  annotationsOnMap: -0.5,
  /**
   * The bodies of measured areas (their wash, the cells they cover, their outline): lit like the
   * floor and covered by the tokens. The grid and the tokens stand at 0 too and lie in the order
   * they were added, so the layer is put between them (`placeUnderTokens`).
   */
  measureBodies: 0,
  /** The cells under tokens being placed by hand, and their ripples when put down (GM only). */
  placementCells: 91,
  /** The hover, press and Shift-preview highlight of linked hexes (GM only). */
  hexLinks: 92,
  /** Stairs between levels: their outlines and badges, and the editor's corners (GM only). */
  levelLinks: 93,
  /** The marker on the token whose turn it is: above the lighting, below the tokens' bars. */
  turn: 96,
  /** Note pins (GM only). */
  pins: 98,
  /** The selection frame and the marquee or lasso being drawn. */
  selection: 99,
  /** The ruler being drawn and the measurements left on the map. */
  measure: 99,
  /** The grid alignment tool's points, edges and cursor. */
  gridAlignment: 99,
  /** The button above a group selection that turns it: above the tokens' bars, which must not cover it. */
  groupRotate: 101,
  /** Drawings and texts above the tokens, in their one order: above the lighting, below the fog, so what is hidden stays hidden. */
  annotations: 900,
  /**
   * The names of pins: above the fog (1000), so a name is never cut off by it. A name shows only
   * where its pin does: every pin for the GM, for players only pins out of the fog (`PlayerPins`).
   */
  pinNames: 1010,
  /** Tokens being placed by hand (GM only): above everything on the map but the laser. */
  placement: 1100,
} as const;
