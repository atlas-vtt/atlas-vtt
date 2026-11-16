import { traceShapes, type Vec } from '../geometry';
import { mixColours, withAlpha } from '../palette';
import type { ArtScene } from '../art/artScene';
import { viewBounds } from '../art/artScene';
import { floorStones } from '../art/floorStones';
import { TO_LIGHT } from '../art/light';
import { clipFloors } from '../art/outline';
import { insetConvex, traceRounded } from '../art/polygons';
import type { StoneColours } from './colours';
import { cellPattern } from './patterns';
import { grainTile, tileTexels } from './textures';

/**
 * The floor: stones of the look's pattern, each its own faint shade, joints sunk a little and their
 * lip towards the light catching it, the stone's grain over all. Kept calm: the shades lie close,
 * so tokens and the grid stay what the eye finds first.
 */

const SHADES = 6;
const GAP = 0.011;

export function drawFloor(scene: ArtScene, c: StoneColours): void {
  const { ctx, dungeon, style } = scene.env;
  ctx.save();
  ctx.beginPath();
  traceShapes(ctx, scene.floors);
  ctx.fillStyle = c.floor;
  ctx.fill();
  clipFloors(scene);
  const b = viewBounds(scene.frame, 1);
  const stones = floorStones(style.floor, b, dungeon.model.seed, (x, y) => dungeon.field.distance(x, y) < 0.9);
  const bins: Vec[][][] = Array.from({ length: SHADES }, () => []);
  for (const stone of stones) {
    const inner = insetConvex(stone.poly, GAP);
    if (inner) bins[Math.min(SHADES - 1, Math.floor(stone.tone * SHADES))]!.push(inner);
  }
  ctx.fillStyle = c.joint;
  ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
  const spread = c.mono ? 0.02 : c.dark ? 0.04 : 0.028;
  const round = style.floor === 'cobble' ? 0.07 : 0.025;
  for (let k = 0; k < SHADES; k++) {
    const polys = bins[k]!;
    if (!polys.length) continue;
    ctx.beginPath();
    for (const poly of polys) traceRounded(ctx, poly, round);
    const t = (k / (SHADES - 1) - 0.5) * 2 * spread;
    ctx.fillStyle = t > 0 ? mixColours(c.floor, '#ffffff', t) : mixColours(c.floor, c.dark ? '#000000' : c.line, -t);
    ctx.fill();
    ctx.lineWidth = 0.008;
    ctx.save();
    ctx.translate(TO_LIGHT.x * 0.005, TO_LIGHT.y * 0.005);
    ctx.strokeStyle = withAlpha(c.light, c.dark ? 0.05 : 0.2);
    ctx.stroke();
    ctx.restore();
  }
  if (scene.raster) {
    ctx.fillStyle = cellPattern(ctx, grainTile(0.014, tileTexels(2.2)), 2.2);
    ctx.globalAlpha = c.mono ? 0.5 : 1;
    ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
  }
  ctx.restore();
}
