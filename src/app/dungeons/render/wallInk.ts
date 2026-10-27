import { REFERENCE_CELL_PX, type DungeonStyle } from '../style';

/**
 * How far a style's wall ink reaches outside the floor, in cells: the crisp line of Stone & shadow,
 * the heavy cut of Engraved. A scene's walls lie on its middle (`scene/toWalls.ts`).
 */
export function wallInkWidth(style: Pick<DungeonStyle, 'strokes'>): number {
  return style.strokes.thick / REFERENCE_CELL_PX;
}
