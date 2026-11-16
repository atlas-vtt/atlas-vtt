import { firesLit } from '../fireSites';
import { glyphFit, propGlyph } from '../propShapes';
import { propsAsDrawn } from '../propsAsDrawn';
import { drawGlyph } from './glyph';
import type { Hand } from './hand';
import { clipFloors } from './outline';

/**
 * The props of the rooms on show, where the view shows them, each in the hand's finish, their fires
 * burning where the dungeon is lived in. In a cave
 * the walls wander off the cell grid, so the props are clipped to the floor as drawn (the walls'
 * ink lies outside it and stays whole) and its wall pieces hang on the drawn wall (`propsAsDrawn`).
 */
export function drawProps(hand: Hand, water: string, cloth: string): void {
  const { scene } = hand;
  const { dungeon, view, ctx } = scene.env;
  if (!view.props) return;
  const cave = dungeon.floor.cave !== undefined;
  const house = dungeon.floor.walls === 'edges';
  const lit = firesLit(dungeon.model);
  if (cave) {
    ctx.save();
    clipFloors(scene);
  }
  for (const prop of propsAsDrawn(dungeon)) {
    const glyph = propGlyph(prop.kind, house, lit);
    if (!glyph || !dungeon.roomShapes.has(prop.room)) continue;
    drawGlyph(hand, { ...prop, fit: glyphFit(prop) }, glyph, water, cloth);
  }
  if (cave) ctx.restore();
}
