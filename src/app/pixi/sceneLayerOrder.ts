/**
 * The order Atlas stacks a scene's layers in, bottom first. The map and the grid sit
 * at the bottom by child index (the map at 0, the grid just above it); the others by
 * `zIndex`. Pure, with no PIXI imports.
 */
export const SCENE_LAYER_ORDER = ['map', 'grid', 'tokens', 'texts', 'drawings', 'fog'] as const;
export type SceneLayer = typeof SCENE_LAYER_ORDER[number];

/** `zIndex` in the viewport of the layers placed by it. */
export const SCENE_LAYER_Z = {
  tokens: 0,
  texts: 500,
  /** Above tokens and texts, below fog so hidden areas stay hidden. */
  drawings: 900,
  fog: 1000,
} as const satisfies Partial<Record<SceneLayer, number>>;
