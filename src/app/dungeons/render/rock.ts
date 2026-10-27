import { drawBricks } from './bricks';
import { drawDots } from './dots';
import { traceShapes, tracePolygon, type Vec } from './geometry';
import { drawHatching } from './hatching';
import { filledPockets } from './pockets';
import { withAlpha } from './palette';
import { strokeWidth, type RenderEnv } from './renderEnv';
import { drawStonework } from './stonework';

/**
 * The rock round the walls, in the look's mode (`DungeonSurround.mode`), under the walls and the
 * floor. Rock the rooms close in on is filled whole, except in stippling, which thins out alone.
 * The rock parts before every entrance, so the way leads on into the open.
 */
export function drawRock(env: RenderEnv): void {
  const { ctx } = env;
  ctx.save();
  clipLanes(env, env.dungeon.open);
  drawRockMode(env);
  ctx.restore();
}

function drawRockMode(env: RenderEnv): void {
  const { mode } = env.style.surround;
  if (mode !== 'dots') fillPockets(env);
  switch (mode) {
    case 'hatching':
      drawRockBand(env);
      drawHatching(env);
      return;
    case 'none':
      drawRockBand(env);
      return;
    case 'stonework':
      drawStonework(env);
      return;
    case 'bricks':
      drawBricks(env);
      return;
    case 'dots':
      drawDots(env);
      return;
  }
}

/** The band of rock colour round the walls: every floor grown by the reach, round-cornered, its edge feathered. */
function drawRockBand(env: RenderEnv): void {
  const { ctx, palette, dungeon } = env;
  const reach = env.style.surround.reach;
  ctx.save();
  ctx.fillStyle = palette.rock;
  ctx.beginPath();
  traceShapes(ctx, dungeon.floors, reach, reach);
  ctx.fill();
  ctx.strokeStyle = withAlpha(palette.rock, 0.4);
  ctx.lineWidth = strokeWidth(env, env.style.strokes.normal * 2);
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/** Fills the narrow pockets of rock between rooms with the rock colour. */
function fillPockets(env: RenderEnv): void {
  const pockets = filledPockets(env.dungeon, env.style.surround.reach);
  if (pockets.length === 0) return;
  const { ctx, palette } = env;
  ctx.save();
  ctx.fillStyle = palette.rock;
  ctx.beginPath();
  for (const { ring } of pockets) tracePolygon(ctx, ring);
  ctx.fill();
  ctx.restore();
}

/** Keeps drawing out of the open ground before each entrance (`VisibleDungeon.open`). */
function clipLanes(env: RenderEnv, open: readonly Vec[][]): void {
  if (open.length === 0) return;
  const { ctx, dungeon } = env;
  const b = dungeon.bounds;
  ctx.beginPath();
  ctx.rect(b.minX - 10, b.minY - 10, b.maxX - b.minX + 20, b.maxY - b.minY + 20);
  for (const ground of open) tracePolygon(ctx, ground);
  ctx.clip('evenodd');
}
