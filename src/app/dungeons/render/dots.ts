import { shapeBounds, unionBounds } from './geometry';
import { bandSeeds, poissonDisc } from './poisson';
import { strokeWidth, type RenderEnv } from './renderEnv';

/**
 * Stippling: Poisson-disc dots out to the hatching distance, each as wide as the thick stroke at
 * the wall and shrinking to nothing at the band's edge.
 */
export function drawDots(env: RenderEnv): void {
  const { ctx, palette, style, dungeon } = env;
  const field = dungeon.field;
  const distance = style.surround.reach;
  const thick = strokeWidth(env, style.strokes.thick);
  const spacing = Math.max(thick / Math.max(style.surround.size, 0.1), thick * 1.2);
  const boxes = dungeon.floors.map(shape => shapeBounds(shape));
  const bounds = unionBounds(boxes.map(b => ({ minX: b.minX - distance - 1, minY: b.minY - distance - 1, maxX: b.maxX + distance + 1, maxY: b.maxY + distance + 1 })));
  const samples = poissonDisc(
    bounds,
    spacing,
    (x, y) => {
      const d = field.distance(x, y);
      return d > -spacing && d < distance;
    },
    bandSeeds(dungeon, boxes, distance / 3),
    env.rng('dots'),
  );
  ctx.save();
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  for (const p of samples) {
    const d = Math.max(0, field.distance(p.x, p.y));
    const r = (thick / 2) * (1 - d / distance);
    if (r <= thick * 0.08) continue;
    ctx.moveTo(p.x + r, p.y);
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}
