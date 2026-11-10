import type { ArtScene } from '../art/artScene';
import { drawColumns } from '../art/columns';
import { drawDebris } from '../art/debris';
import type { Hand } from '../art/hand';
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
import { drawPools, paintWater, type WaterPainter } from './water';
import { engravedGrowth } from './growth';
import { drawHouseMass } from '../house/houseWalls';
import { groundsPainter } from '../grounds';
import { engravedGroundsPaint } from '../grounds/engravedPaint';
import type { GroundsPaint } from '../grounds/paint';
import { type CaveGroundPainting, type CaveGroundPart, builtSurround, caveGround } from '../cave/caveArt';

/**
 * What a direction that draws Engraved's plan brings to it: its pens and hand, the pens plants
 * are drawn with, how it paints the grounds, the rock round the walls (where no built surround or
 * house takes its place), the floor (a cave's too, if it draws one of its own), and its water.
 */
export interface EngravedKit {
  pens: Pens;
  hand: Hand;
  plantPens: Pens;
  groundsPaint: () => GroundsPaint;
  rock: (scene: ArtScene) => void;
  floor: (scene: ArtScene, pens: Pens) => void;
  /** A cave's floor and the ground of its ways out, where the direction draws them otherwise than the cave registry's engraved ones. */
  caveFloor?: (scene: ArtScene, pens: Pens) => void;
  caveMouth?: (scene: ArtScene, pens: Pens) => void;
  water: WaterPainter;
}

/** Engraved's own kit: ink and its paper. */
function engravedKit(scene: ArtScene): EngravedKit {
  const pens = pensOf(scene);
  const hand = engravedHand(scene, pens);
  return { pens, hand, plantPens: pens, groundsPaint: () => engravedGroundsPaint(hand, pens), rock: art => drawRock(art.env), floor: drawFloor, water: paintWater };
}

/**
 * Engraved, the copperplate, bottom to top: the rock, a cave's ways out, the floor and its faint joints,
 * water, terrain on the ground and raised floors, moss and plants, hatched shadows, the grid,
 * climbers with the wall's cut running under their upper leaves, then rubble, whatever stands,
 * columns and what climbs them, passages and stairs, and holes with their bridges. Ink and its paper,
 * or another direction's `kit` in the same order (Crayon's).
 */
export function paintEngraved(scene: ArtScene, kit: EngravedKit = engravedKit(scene)): void {
  const { pens, hand } = kit;
  const colours = { water: pens.water, cloth: pens.floor };
  const growth = engravedGrowth(scene, hand, kit.plantPens);
  const cave = (part: CaveGroundPart): CaveGroundPainting | undefined => caveGround(part, scene.env);
  const surround = builtSurround(scene.env) ? cave('surround') : undefined;
  const grounds = groundsPainter(hand, kit.groundsPaint);
  grounds.ground();
  const house = drawHouseMass(hand);
  if (!house) {
    if (surround) surround.engraved(scene, pens);
    else kit.rock(scene);
  }
  const mouth = cave('mouth');
  if (mouth) (kit.caveMouth ?? mouth.engraved)(scene, pens);
  const caveFloor = cave('floor');
  (caveFloor ? (kit.caveFloor ?? caveFloor.engraved) : kit.floor)(scene, pens);
  drawPools(scene, pens, kit.water);
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
