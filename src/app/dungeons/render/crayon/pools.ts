import type { ArtScene } from '../art/artScene';
import { hash2 } from '../art/noise';
import { clipFloors } from '../art/outline';
import type { Field, PathFn } from '../art/paths';
import type { Pens } from '../engraved/pens';
import { inkShore, type WaterPainter } from '../engraved/water';
import { scatter } from '../grounds/paint';
import { pointsBounds, type Bounds, type Vec } from '../geometry';
import { withAlpha } from '../palette';
import { CRAYONS } from './colours';
import type { CrayonBox } from './crayonBox';

/** Where water and molten rock are coloured at full strength, in cells from the shore. */
const DEEP = 1.6;

/** How far towards full strength a liquid is at a point, by its depth there, `reach` times `DEEP` deep at full. */
export function depthStrength(depth: Field, reach = 1): Field {
  return (x, y) => Math.min(1, depth(x, y) / (DEEP * reach));
}
/** Ripples: one place for a stroke every this many cells, and the share of places that get one. */
const RIPPLE_STEP = 0.42;
const RIPPLE_SHARE = 0.4;

/**
 * Water as a hand colours it: blue crayon, light at the shore and heavier inward, the deep part of a
 * body deeper blue; a few pencilled ripples lying level on it, and the shore and its contours in
 * graphite, as Engraved draws them.
 */
export function crayonWater(box: CrayonBox): WaterPainter {
  return (scene, pens, trace, outlines, depth, deep, deepness = null) => paintCrayonWater(scene, pens, box, trace, outlines, depth, deep, deepness);
}

function paintCrayonWater(scene: ArtScene, pens: Pens, box: CrayonBox, trace: PathFn, outlines: readonly Vec[][], depth: Field, deep: boolean, deepness: Field | null): void {
  const { ctx } = scene.env;
  ctx.save();
  clipFloors(scene);
  ctx.beginPath();
  trace(ctx);
  ctx.fillStyle = pens.water;
  ctx.fill();
  ctx.clip();
  const bounds = pointsBounds(outlines.flat());
  const shallow = depthStrength(depth);
  box.colourIn(trace, { colour: CRAYONS.water, cover: 0.85, passes: 3 }, (x, y) => 0.45 + 0.55 * shallow(x, y), bounds);
  const deepAt = deep ? depthStrength(depth, 2) : deepness;
  if (deepAt) box.colourIn(trace, { colour: CRAYONS.deepWater, cover: 0.6, passes: 2 }, deepAt, bounds);
  ripples(scene, pens, depth, bounds);
  ctx.restore();
  inkShore(scene, pens, trace, outlines, deep);
}

/** Short level strokes, slightly bowed, scattered over the water away from its shore. */
function ripples(scene: ArtScene, pens: Pens, depth: Field, bounds: Bounds): void {
  const { ctx, dungeon } = scene.env;
  const seed = dungeon.model.seed;
  ctx.beginPath();
  for (const p of scatter(bounds, 1 / RIPPLE_STEP ** 2, seed + 31)) {
    if (p.t > RIPPLE_SHARE || depth(p.x, p.y) < 0.3) continue;
    const half = 0.1 + 0.14 * hash2(Math.round(p.x * 64), Math.round(p.y * 64), seed + 34);
    const bow = (hash2(Math.round(p.x * 64), Math.round(p.y * 64), seed + 35) - 0.5) * 0.05;
    ctx.moveTo(p.x - half, p.y);
    ctx.quadraticCurveTo(p.x, p.y + bow, p.x + half, p.y);
  }
  ctx.strokeStyle = withAlpha(pens.ink, 0.7);
  ctx.lineWidth = 0.011;
  ctx.lineCap = 'round';
  ctx.stroke();
}
