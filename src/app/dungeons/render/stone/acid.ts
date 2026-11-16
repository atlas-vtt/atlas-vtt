import type { Vec } from '../geometry';
import { pointsBounds } from '../geometry';
import type { ArtScene } from '../art/artScene';
import { clipFloors } from '../art/outline';
import type { Field, PathFn } from '../art/paths';
import { withAlpha } from '../palette';
import type { StoneColours } from './colours';

/** Bubbles per cell of acid, and their radius in cells. */
const BUBBLES = { perCell: 0.9, min: 0.04, max: 0.12 };

/**
 * What sets acid apart from lava under the same murky fill: bubbles rising through it, pale rings
 * with a dark core, fewer near the shore, and a corroded stain on the floor round its edge.
 */
export function drawAcidDetail(scene: ArtScene, c: StoneColours, outlines: readonly Vec[][], trace: PathFn, depth: Field): void {
  const { ctx } = scene.env;
  const points = outlines.flat();
  if (!points.length) return;
  // The stain: the floor eaten dark just outside the shore.
  ctx.save();
  clipFloors(scene);
  ctx.beginPath();
  trace(ctx);
  ctx.strokeStyle = withAlpha(c.dark ? '#000000' : '#3a3a12', 0.28);
  ctx.lineWidth = 0.16;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
  const b = pointsBounds(points);
  const rng = scene.env.rng('acid');
  const count = Math.round((b.maxX - b.minX) * (b.maxY - b.minY) * BUBBLES.perCell);
  ctx.save();
  clipFloors(scene);
  ctx.beginPath();
  trace(ctx);
  ctx.clip();
  for (let k = 0; k < count; k++) {
    const x = b.minX + rng() * (b.maxX - b.minX);
    const y = b.minY + rng() * (b.maxY - b.minY);
    const r = BUBBLES.min + rng() * (BUBBLES.max - BUBBLES.min);
    if (depth(x, y) < r * 1.5) continue;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30, 44, 10, 0.35)';
    ctx.fill();
    ctx.lineWidth = r * 0.35;
    ctx.strokeStyle = 'rgba(214, 240, 140, 0.7)';
    ctx.stroke();
  }
  ctx.restore();
}
