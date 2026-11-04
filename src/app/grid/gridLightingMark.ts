import { Graphics, type Container } from 'pixi.js';

/** The colour the lighting composite paints a marked grid in. */
export interface GridMarkColor {
  color: number;
  /** The colour was picked to contrast with the map, lit: the composite draws it white where the ambient light is low, whatever the lights. */
  contrasting: boolean;
}

/**
 * The grid as dynamic lighting draws it: unlit and still under the tokens. The lighting composite
 * lights everything beneath it, the grid included, so while it draws, the grid draws no colour:
 * it erases the scene's alpha where its lines and numbers lie, tokens drawn after it fill the
 * alpha in again, and the composite paints the grid's colour wherever alpha is missing.
 * `LightingEngine` marks it exactly while its composite draws, never without one.
 */
export interface UnlitGrid {
  setMarking(on: boolean): void;
  /** What the composite paints, or null while the grid is not marked or not shown. */
  markColor(): GridMarkColor | null;
}

/**
 * An opaque backing over the map's rect, drawn first in the grid with `max`: it leaves the colour
 * beneath alone and makes the alpha 1, so the alpha the grid erases is the grid's alone, also
 * over a transparent map and in a render target cleared to transparent (a thumbnail).
 */
export function createMarkBacking(x: number, y: number, width: number, height: number): Graphics {
  const backing = new Graphics({ label: 'grid-mark-backing' });
  backing.rect(x, y, width, height).fill({ color: 0x000000, alpha: 1 });
  backing.blendMode = 'max';
  return backing;
}

/** Marks the grid for the composite, or lets it draw itself. */
export function applyGridMark(grid: Container, backing: Graphics, on: boolean): void {
  grid.blendMode = on ? 'erase' : 'inherit';
  backing.visible = on;
}
