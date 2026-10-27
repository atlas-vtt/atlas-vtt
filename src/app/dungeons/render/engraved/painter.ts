import type { ArtScene } from '../art/artScene';
import { drawColumns } from '../art/columns';
import { drawDebris } from '../art/debris';
import { drawPassages } from '../art/passages';
import { drawProps } from '../art/drawProps';
import { drawWallLights } from '../art/drawWallLights';
import { drawGrid } from '../grid';
import { drawTerrainGround, drawTerrainOpenings, drawTerrainStanding } from '../terrain/drawTerrain';
import { drawFloor } from './floor';
import { engravedHand } from './hand';
import { pensOf, type Pens } from './pens';
import { drawRock } from '../rock';
import { drawShade } from './shade';
import { drawWalls } from './walls';
import { drawPools } from './water';
import { engravedGrowth } from './growth';
import { drawHouseMass } from '../house/houseWalls';
import { groundsPainter } from '../grounds';
import { engravedGroundsPaint } from '../grounds/engravedPaint';
import { type CaveGroundPainting, type CaveGroundPart, builtSurround, caveGround } from '../cave/caveArt';

/**
 * Engraved, the copperplate, bottom to top: the rock, a cave's ways out, the floor and its faint joints,
 * water, terrain on the ground and raised floors, moss and plants, hatched shadows, the grid,
 * climbers with the wall's cut running under their upper leaves, then rubble, whatever stands,
 * columns and what climbs them, passages and stairs, and holes with their bridges. Ink and its paper.
 */
export function paintEngraved(scene: ArtScene): void {
  const pens = pensOf(scene);
  const hand = engravedHand(scene, pens);
  const colours = { water: pens.water, cloth: pens.floor };
  const growth = engravedGrowth(scene, hand, pens);
  const cave = (part: CaveGroundPart): CaveGroundPainting | undefined => caveGround(part, scene.env);
  const surround = builtSurround(scene.env) ? cave('surround') : undefined;
  const grounds = groundsPainter(hand, () => engravedGroundsPaint(hand, pens));
  grounds.ground();
  const house = drawHouseMass(hand);
  if (!house) {
    if (surround) surround.engraved(scene, pens);
    else drawRock(scene.env);
  }
  cave('mouth')?.engraved(scene, pens);
  (cave('floor')?.engraved ?? drawFloor)(scene, pens);
  drawPools(scene, pens);
  drawTerrainGround(hand, colours);
  growth.ground();
  drawShade(scene, pens);
  grounds.shade();
  drawGrid(scene.env);
  growth.climbers();
  (cave('edge')?.engraved ?? ((art: ArtScene, p: Pens): void => drawWalls(art, p, !house)))(scene, pens);
  growth.overWalls();
  drawDebris(hand);
  drawProps(hand, pens.water, pens.floor);
  drawWallLights(hand, pens.water, pens.floor);
  drawTerrainStanding(hand, colours);
  drawColumns(hand);
  growth.columns();
  drawPassages(hand);
  drawTerrainOpenings(hand);
  grounds.standing();
}
