import type { ArtScene } from '../art/artScene';
import { drawColumns } from '../art/columns';
import { drawDebris } from '../art/debris';
import { drawPassages } from '../art/passages';
import { drawProps } from '../art/drawProps';
import { drawWallLights } from '../art/drawWallLights';
import { drawGrid } from '../grid';
import { drawTerrainGround, drawTerrainOpenings, drawTerrainStanding } from '../terrain/drawTerrain';
import { stoneColours } from './colours';
import { drawFloor } from './floor';
import { stoneHand } from './hand';
import { drawRock } from '../rock';
import { drawShade } from './shade';
import { drawWallBand, drawWallEdge } from './walls';
import { drawPools } from './water';
import { drawWeathering } from './weathering';
import { drawHouseMass } from '../house/houseWalls';
import { groundsPainter } from '../grounds';
import { stoneGroundsPaint } from '../grounds/stonePaint';
import { stoneGrowth } from './growth';
import { type CaveGroundPainting, type CaveGroundPart, builtSurround, caveGround } from '../cave/caveArt';

/**
 * Stone & shadow, bottom to top: the rock, the wall's course, a cave's ways out, the floor, water, terrain on the
 * ground and raised floors, moss and plants, light and shade, the grid, climbers with the wall's
 * ink running under their upper leaves, then rubble, whatever stands, columns and what climbs
 * them, passages and stairs, and holes in the floor with their bridges.
 */
export function paintStone(scene: ArtScene): void {
  const { env } = scene;
  const c = stoneColours(env.palette, env.view.monochrome);
  const hand = stoneHand(scene, c);
  const colours = { water: c.water, cloth: c.cloth };
  const growth = stoneGrowth(scene, hand, c);
  const cave = (part: CaveGroundPart): CaveGroundPainting | undefined => caveGround(part, env);
  const surround = builtSurround(env) ? cave('surround') : undefined;
  const grounds = groundsPainter(hand, () => stoneGroundsPaint(hand, c));
  grounds.ground();
  if (!drawHouseMass(hand)) {
    if (surround) surround.stone(scene, c);
    else drawRock(env);
    (cave('edge')?.stone ?? drawWallBand)(scene, c);
  }
  cave('mouth')?.stone(scene, c);
  (cave('floor')?.stone ?? drawFloor)(scene, c);
  drawPools(scene, c);
  drawTerrainGround(hand, colours);
  drawWeathering(scene);
  growth.ground();
  drawShade(scene, c);
  grounds.shade();
  drawGrid(env);
  growth.climbers();
  drawWallEdge(scene, c);
  growth.overWalls();
  drawDebris(hand);
  drawProps(hand, c.water, c.cloth);
  drawWallLights(hand, c.water, c.cloth);
  drawTerrainStanding(hand, colours);
  drawColumns(hand);
  growth.columns();
  drawPassages(hand);
  drawTerrainOpenings(hand);
  grounds.standing();
}
