import { traceShapes, type FloorShape } from '../geometry';
import type { ArtScene } from '../art/artScene';
import { viewBounds } from '../art/artScene';
import { floorStones, type FloorStone } from '../art/floorStones';
import { valueNoise } from '../art/noise';
import { clipFloors } from '../art/outline';
import { withAlpha } from '../palette';
import type { Pens } from './pens';

/** The floor, and the joints of its stones as faint engraved lines, broken where worn, kept light so tokens stand out. */
export function drawFloor(scene: ArtScene, pens: Pens): void {
  const { ctx } = scene.env;
  ctx.save();
  ctx.beginPath();
  traceShapes(ctx, scene.floors);
  ctx.fillStyle = pens.floor;
  ctx.fill();
  ctx.restore();
  drawFloorJoints(scene, pens);
}

/** The stones the floor on show is laid with, over the drawing's window. */
export function floorStonesOf(scene: ArtScene): FloorStone[] {
  const { dungeon, style } = scene.env;
  return floorStones(style.floor, viewBounds(scene.frame, 1), dungeon.model.seed, (x, y) => dungeon.field.distance(x, y) < 0.9);
}

/** The joints of the floor's `stones` alone, over whatever the floor is; only on the floors `within` if given. */
export function drawFloorJoints(scene: ArtScene, pens: Pens, within?: readonly FloorShape[], stones: readonly FloorStone[] = floorStonesOf(scene)): void {
  const { ctx, dungeon } = scene.env;
  const seed = dungeon.model.seed;
  ctx.save();
  clipFloors(scene);
  if (within) {
    ctx.beginPath();
    traceShapes(ctx, within);
    ctx.clip();
  }
  ctx.beginPath();
  for (const { poly } of stones) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      // Each joint once: the edge running right or down.
      if (b.x < a.x || (b.x === a.x && b.y < a.y)) continue;
      const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.12));
      let drawing = false;
      for (let k = 0; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n;
        const y = a.y + ((b.y - a.y) * k) / n;
        if (valueNoise(x * 2.3, y * 2.3, seed + 9) > 0.68) drawing = false;
        else if (!drawing) {
          ctx.moveTo(x, y);
          drawing = true;
        } else ctx.lineTo(x, y);
      }
    }
  }
  ctx.strokeStyle = withAlpha(pens.ink, 0.16);
  ctx.lineWidth = 0.009;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}
