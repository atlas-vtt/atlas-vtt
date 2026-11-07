import { tracePolygon, traceShapes, type Vec } from './geometry';
import type { RenderEnv } from './renderEnv';

/** Restricts drawing to the floors and any `more` rings, until the caller restores the context. */
export function clipToFloors(env: RenderEnv, more: readonly (readonly Vec[])[] = []): void {
  const { ctx, dungeon } = env;
  ctx.beginPath();
  traceShapes(ctx, dungeon.floors);
  for (const ring of more) tracePolygon(ctx, ring);
  ctx.clip();
}
