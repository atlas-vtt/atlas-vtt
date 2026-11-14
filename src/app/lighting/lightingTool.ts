/** How the lighting tool draws walls: corner by corner, or as a stroke. */
export type WallToolMode = 'point-to-point' | 'freeform';

/** What the lighting tool does with a click. */
export type WallToolSubMode = 'draw' | 'place-light' | 'light-zone' | 'level-surface' | 'explored-memory' | 'rooms';

/**
 * The lighting tool's choices, held in the view's store: the bar above the toolbar sets them, the
 * tool's menu reads them, and the lighting controller hands them on to its editors.
 */
export interface LightingToolOptions {
  mode: WallToolSubMode;
  drawMode: WallToolMode;
  /** The light preset the lights mode puts down; null is the collection's default light (`chosenLightPreset`). */
  lightPreset: string | null;
}

/** The tool opens on rooms, the first of its modes. */
export const DEFAULT_LIGHTING_TOOL: LightingToolOptions = { mode: 'rooms', drawMode: 'point-to-point', lightPreset: null };
