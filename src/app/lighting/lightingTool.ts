import type { TapPlacing } from '../types/tapPlacing';

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

/**
 * What a finger's tap places with the lighting tool (`TapPlacing`): while a wall chain, a zone or
 * an opening is `underWay`, its next corner; otherwise a light, or the first corner of one of
 * those, where walls' ends and markers are dragged too. Null where a press begins a stroke: walls
 * drawn freehand, the memory's brush, a room's shape.
 */
export function lightingTapPlacing({ mode, drawMode }: LightingToolOptions, underWay: boolean): TapPlacing | null {
  if (underWay) return 'taps';
  if (mode === 'rooms' || mode === 'explored-memory' || (mode === 'draw' && drawMode === 'freeform')) return null;
  return 'press';
}
