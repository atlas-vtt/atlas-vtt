import { viewBounds, type ArtScene } from '../art/artScene';
import { hash2 } from '../art/noise';
import { clipFloors, traceRings } from '../art/outline';
import { polyPath, polysPath, runsPath, type Field, type PathFn } from '../art/paths';
import { engravedWayOut, groundsOf, wayGroundRing } from '../cave/mouth/wayOutGround';
import { engravedFractures } from '../cave/ground/floor';
import { drawFloorJoints, floorStonesOf } from '../engraved/floor';
import type { Pens } from '../engraved/pens';
import { shapeBounds, traceShapes, type Bounds, type FloorShape } from '../geometry';
import { withAlpha } from '../palette';
import { boardPlanks, boardSeams, boardsRunAlongX } from './boards';
import type { CrayonBox } from './crayonBox';
import { floorsByMaterial } from './floorMaterials';
import { CRAYON_GROUNDS, colourGround, fadedFields, groundFields, type GroundPattern } from './ground';

/**
 * Crayon's floors, every one coloured in as the forest's clearings are (`ground.ts`), each in its
 * own material: a built floor's flagstones in grey stone with its joints pencilled and some stones
 * a shade darker, a stable's packed earth, a house's boards in wood with their seams (its kitchen,
 * scullery, bathroom and cellar flagged in stone), and a cave's bare rock with its faults.
 */

/** How much darker a darker flagstone or board is: one light coat of its own. */
const SHADE = { cover: 0.22, passes: 1 } as const;
/** The share of stones and boards a shade darker. */
const SHADED = 0.38;

/** A built floor or a house's: the vellum, each material's ground and its joints or seams. */
export function crayonFloor(scene: ArtScene, pens: Pens, box: CrayonBox): void {
  box.paper((path) => traceShapes(path, scene.floors));
  const fields = groundFields(scene.env.dungeon.model.seed);
  const b = viewBounds(scene.frame, 1);
  for (const [material, shapes] of floorsByMaterial(scene)) {
    if (material === 'boards') drawBoards(scene, pens, box, shapes, fields, b);
    else {
      colourGround(box, (path) => traceShapes(path, shapes), CRAYON_GROUNDS[material], fields, b);
      if (material === 'stone') shadeFlagstones(scene, pens, box, shapes, b);
    }
  }
}

/** Some flagstones a shade darker, so the floor reads as stones laid side by side; then the joints. */
function shadeFlagstones(scene: ArtScene, pens: Pens, box: CrayonBox, shapes: readonly FloorShape[], b: Bounds): void {
  const { ctx } = scene.env;
  const stones = floorStonesOf(scene);
  const darker = stones.filter((stone) => stone.tone < SHADED).map((stone) => stone.poly);
  if (darker.length) {
    ctx.save();
    clip(scene, shapes);
    box.colourIn(polysPath(darker), { colour: CRAYON_GROUNDS.stone[0].colour, ...SHADE }, undefined, b);
    ctx.restore();
  }
  drawFloorJoints(scene, pens, shapes, stones);
}

/** Boards along each room's longer side, coloured along their grain, some a shade darker, their seams pencilled. */
function drawBoards(scene: ArtScene, pens: Pens, box: CrayonBox, shapes: readonly FloorShape[], fields: Record<GroundPattern, Field>, b: Bounds): void {
  const { ctx, dungeon } = scene.env;
  const seed = dungeon.model.seed;
  for (const alongX of [true, false]) {
    const laid = shapes.filter((shape) => boardsRunAlongX(shapeBounds(shape)) === alongX);
    if (!laid.length) continue;
    const planks = laid.flatMap((shape) => boardPlanks(shapeBounds(shape), alongX, seed));
    // Nearly along the grain, a little off as a hand lays it.
    const grain = (alongX ? 0 : Math.PI / 2) + (hash2(seed, alongX ? 1 : 2, 0x60a2) - 0.5) * 0.12;
    colourGround(box, (path) => traceShapes(path, laid), CRAYON_GROUNDS.boards, fields, b, grain);
    ctx.save();
    clip(scene, laid);
    const darker = planks.filter((plank) => plank.tone < SHADED).map((plank) => plank.poly);
    if (darker.length) box.colourIn(polysPath(darker), { colour: CRAYON_GROUNDS.boards[1].colour, ...SHADE, angle: grain }, undefined, b);
    ctx.beginPath();
    runsPath(boardSeams(planks, alongX, seed))(ctx);
    ctx.strokeStyle = withAlpha(pens.ink, 0.2);
    ctx.lineWidth = 0.009;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }
}

/** Clips to the floors and, within them, to `shapes`. */
function clip(scene: ArtScene, shapes: readonly FloorShape[]): void {
  const { ctx } = scene.env;
  clipFloors(scene);
  ctx.beginPath();
  traceShapes(ctx, shapes);
  ctx.clip();
}

/** The ground of a cave's ways out, Engraved's, then coloured in as its floor is, fading with it. */
export function crayonCaveMouth(scene: ArtScene, pens: Pens, box: CrayonBox): void {
  engravedWayOut(scene, pens);
  const fields = groundFields(scene.env.dungeon.model.seed);
  const b = viewBounds(scene.frame, 1);
  for (const ground of groundsOf(scene)) {
    colourGround(box, polyPath(wayGroundRing(scene, ground.way)), CRAYON_GROUNDS.cave, fadedFields(fields, (x, y) => ground.strength({ x, y })), b);
  }
}

/** A cave's floor: the vellum, bare rock coloured in, and its faults in graphite. */
export function crayonCaveFloor(scene: ArtScene, pens: Pens, box: CrayonBox): void {
  const rock: PathFn = (path) => traceRings(path, scene.floorRings);
  box.paper(rock);
  colourGround(box, rock, CRAYON_GROUNDS.cave, groundFields(scene.env.dungeon.model.seed), viewBounds(scene.frame, 1));
  engravedFractures(scene, pens);
}
