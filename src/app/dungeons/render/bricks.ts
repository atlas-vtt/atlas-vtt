import { traceShapes } from './geometry';
import { strokeWidth, type RenderEnv } from './renderEnv';
import { edgePlaces } from './shapeEdges';

/**
 * Courses of bricks: rings around the floors, the outermost at the hatching distance, each
 * filled with the shading colour and inked where it is the edge of all of them, with short ticks
 * across every course a brick length apart.
 */
export function drawBricks(env: RenderEnv): void {
  const { ctx, palette, style, dungeon } = env;
  const courses = Math.max(1, Math.round(style.surround.strokes) - 1);
  const distance = style.surround.reach;
  const brick = Math.max(style.surround.size, 0.1);
  const ink = strokeWidth(env, style.surround.stroke);
  const rng = env.rng('bricks');
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  ctx.strokeStyle = palette.ink;
  for (let k = courses; k >= 1; k--) {
    const outer = (distance * k) / courses;
    const inner = (distance * (k - 1)) / courses;
    ctx.beginPath();
    traceShapes(ctx, dungeon.outlines, outer, outer);
    ctx.lineWidth = ink * 2;
    ctx.stroke();
    ctx.fillStyle = palette.rock;
    ctx.fill();
    ctx.beginPath();
    for (const shape of dungeon.outlines) {
      // Bricks of one course stagger against the next by a random phase.
      const phase = rng() * brick;
      for (const place of edgePlaces(shape, inner, brick, phase)) {
        const reach = outer - inner;
        ctx.moveTo(place.point.x, place.point.y);
        ctx.lineTo(place.point.x + place.normal.x * reach, place.point.y + place.normal.y * reach);
      }
    }
    ctx.lineWidth = ink;
    ctx.stroke();
  }
  ctx.restore();
}
