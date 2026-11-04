import { unionRings } from '../clipShapes';
import { shapeRings, type Vec } from '../geometry';
import type { ArtScene } from './artScene';
import { windowClearing } from '../houseShapes';
import { mouthClearing, mouthsOf } from './mouths';
import { shownWindows } from './windows';
import { polyPath, type PathFn } from './paths';

/** Rings of the union of the floors grown by `grow` cells (rectangles keep square corners). */
export function grownRings(scene: ArtScene, grow: number): Vec[][] {
  return unionRings(scene.floors.flatMap(shape => shapeRings(shape, grow, scene.frame.pxPerCell)));
}

export function traceRings(path: CanvasPath, rings: readonly (readonly Vec[])[]): void {
  for (const ring of rings) polyPath(ring)(path);
}

/**
 * Clips to everything but the ground just beyond each way in, where no wall stands, and a house's
 * windows, where its outer wall is cut: as deep as what the caller draws reaches past the floor's
 * edge, `reach` cells.
 */
export function clipOutsideMouths(scene: ArtScene, reach: number, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D = scene.env.ctx): void {
  const mouths = mouthsOf(scene.env.dungeon);
  const windows = shownWindows(scene.env.dungeon);
  if (mouths.length === 0 && windows.length === 0) return;
  const g = scene.grid;
  ctx.beginPath();
  ctx.rect(g.x0, g.y0, g.w / g.res, g.h / g.res);
  for (const mouth of mouths) polyPath(mouthClearing(mouth, reach))(ctx);
  for (const window of windows) polyPath(windowClearing(window, reach))(ctx);
  ctx.clip('evenodd');
}

/** Whether the rock lies to the left of a ring's edge from `a` to `b`; the way into the rock. */
export function rockSide(scene: ArtScene, a: Vec, b: Vec): Vec {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const mx = (a.x + b.x) / 2 + n.x * 0.02;
  const my = (a.y + b.y) / 2 + n.y * 0.02;
  return scene.env.dungeon.field.distance(mx, my) > 0 ? n : { x: -n.x, y: -n.y };
}

/** Clips to the floors. */
export function clipFloors(scene: ArtScene, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D = scene.env.ctx): void {
  ctx.beginPath();
  traceRings(ctx, scene.floorRings);
  ctx.clip();
}

export type { PathFn };

/**
 * Traces the line a wall's ink `ink` wide is stroked along and sets the stroke: the floor's edge,
 * twice as wide with mitred corners (the caller's clip keeps its outer half); in a cave the walls'
 * own line, `ink` wide with round corners, so where rock thins to a point the ink ends where the
 * scene's walls do (`scene/toWalls.ts` lays them on this line).
 */
export function traceWallInk(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, scene: ArtScene, ink: number): void {
  if (scene.env.dungeon.floor.cave) {
    traceRings(ctx, grownRings(scene, ink / 2));
    ctx.lineWidth = ink;
    ctx.lineJoin = 'round';
    return;
  }
  traceRings(ctx, scene.floorRings);
  ctx.lineWidth = ink * 2;
  ctx.lineJoin = 'miter';
}
