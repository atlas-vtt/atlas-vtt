import type { GlyphDraw, FamilyGlyphs, GlyphFit } from '../../propShapes';
import type { GlyphPen } from '../../glyphPen';
import { columnFormation, curtain, flowstone, stalagmites } from './dripstone';
import { ENGRAVED_FINISH, STONE_FINISH, type Finish } from './finish';
import { MUSHROOM_LIFT, mushroomsEngraved, mushroomsSilhouette, mushroomsStone } from './mushrooms';
import { boulder, crystals } from './rocks';
import { COLUMN_SOLID, boulderSilhouette, columnSilhouette, crystalsSilhouette, moundsSilhouette } from './shapes';

type Drawing = (pen: GlyphPen, fit: GlyphFit, finish: Finish) => void;

/** One drawing, finished by each painter in its own manner. */
function painted(draw: Drawing): { stone: GlyphDraw; engraved: GlyphDraw } {
  return { stone: (pen, fit) => draw(pen, fit, STONE_FINISH), engraved: (pen, fit) => draw(pen, fit, ENGRAVED_FINISH) };
}

/** What nature built and grew in a cave: dripstone and flowstone of pale calcite, crystals, fallen rock and mushrooms. */
export const GLYPHS: FamilyGlyphs = {
  stalagmites: { material: 'stone', radius: 0.4, lift: 0.7, silhouette: moundsSilhouette, ...painted(stalagmites) },
  'column-formation': {
    material: 'stone', radius: 0.4, lift: 1, silhouette: columnSilhouette,
    tall: { halfW: COLUMN_SOLID, halfH: COLUMN_SOLID, round: true },
    ...painted(columnFormation),
  },
  flowstone: { material: 'stone', radius: 0.5, lift: 0, ...painted(flowstone) },
  curtain: { material: 'stone', radius: 0.5, lift: 0, ...painted(curtain) },
  crystals: { material: 'stone', radius: 0.4, lift: 0.5, silhouette: crystalsSilhouette, ...painted(crystals) },
  boulder: { material: 'rock', radius: 0.36, lift: 0.6, silhouette: boulderSilhouette, ...painted(boulder) },
  // Its caps are lit by the vegetation's own painting; the grain of plain stone lies over them.
  mushrooms: { material: 'stone', radius: 0.4, lift: MUSHROOM_LIFT, silhouette: mushroomsSilhouette, stone: mushroomsStone, engraved: mushroomsEngraved },
};
