import type { ArtScene } from '../art/artScene';
import { pathBounds, type PathFn } from '../art/paths';
import { drawGridCanvas, fieldOf, gridOver, rgbaCanvas } from '../art/raster';
import type { Canvas2D } from '../geometry';
import { parseHex } from '../palette';
import type { WoodsClump } from './woodsMass';
import { bareLimbs } from './treeShapes';

/** `colour` laid within `path`, as strong at each point as `alpha` says (0..1): worn ground, grass in patches. */
export function colourIn(scene: ArtScene, path: PathFn, colour: string, alpha: (x: number, y: number) => number): void {
  const box = pathBounds(path);
  if (!box) return;
  const { ctx } = scene.env;
  const grid = gridOver(box.minX, box.minY, box.maxX, box.maxY, scene.grid.res);
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.clip();
  drawGridCanvas(ctx, grid, rgbaCanvas(grid, parseHex(colour), fieldOf(grid, (x, y) => Math.max(0, Math.min(1, alpha(x, y))))));
  ctx.restore();
}

/** A bare tree's limbs in `colour`, thick at the trunk and thinning outwards, `width` its trunk's stroke in cells. */
export function strokeLimbs(ctx: Canvas2D, { clump }: WoodsClump, colour: string, width: number): void {
  const limbs = bareLimbs(clump.centre, clump.radius, Math.floor(clump.centre.x * 7349 + clump.centre.y * 3083));
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const limb of limbs) {
    // From the trunk a limb is whole; a fork or twig off it thinner.
    ctx.lineWidth = width * (limb[0] === clump.centre ? 1 : 0.55);
    ctx.beginPath();
    limb.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }
  // The trunk seen from above, where the limbs meet.
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(clump.centre.x, clump.centre.y, width * 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
