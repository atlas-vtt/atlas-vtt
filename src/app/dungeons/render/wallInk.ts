import { REFERENCE_CELL_PX, type DungeonStyle } from '../style';

/**
 * How far a style's wall ink reaches outside the floor, in cells: the crisp line of Stone & shadow,
 * the heavy cut of Engraved. A scene's walls lie on its middle (`scene/toWalls.ts`).
 */
export function wallInkWidth(style: Pick<DungeonStyle, 'strokes'>): number {
  return style.strokes.thick / REFERENCE_CELL_PX;
}

/** A hair past the ink's own width, where its softened edge still shows. */
const INK_EDGE = 0.02;

/**
 * How deep the ground before an entrance is cleared of wall ink, in cells: the ink across the mouth
 * and its softened edge, no more. A cave's floor may flank that ground, and its wall keeps its ink
 * up to there, where the scene's wall along it ends too (`scene/toWalls.ts`).
 */
export function mouthInkReach(style: Pick<DungeonStyle, 'strokes'>): number {
  return wallInkWidth(style) + INK_EDGE;
}
