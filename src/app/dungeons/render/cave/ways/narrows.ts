import { doorCells } from '../../../geometry';
import type { CellDir, DungeonDoor } from '../../../model';
import type { Hand } from '../../art/hand';
import { traceRings } from '../../art/outline';
import { polyPath } from '../../art/paths';
import { pointsBounds, shapeRings, type Bounds, type Vec } from '../../geometry';
import { wallInkWidth } from '../../wallInk';

/** Across (u) and along (v), in map coordinates: the hand's light never turns with the way. */
export interface WayFrame {
  at: (u: number, v: number) => Vec;
  along: number;
  across: number;
  bounds: Bounds;
  /** The way down, along `v`. */
  down: CellDir;
  progress: (x: number, y: number) => number;
}

export function wayFrame(box: { x: number; y: number; w: number; h: number }, down: CellDir): WayFrame {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const along = down.x ? box.w : box.h;
  return {
    at: (u, v) => ({ x: cx - down.y * u + down.x * v, y: cy + down.x * u + down.y * v }),
    along,
    across: down.x ? box.h : box.w,
    bounds: { minX: box.x, minY: box.y, maxX: box.x + box.w, maxY: box.y + box.h },
    down,
    progress: (x, y) => Math.max(0, Math.min(1, 0.5 + ((x - cx) * down.x + (y - cy) * down.y) / along)),
  };
}

export function doorFrame(door: DungeonDoor, down = door.dir): WayFrame {
  const b = pointsBounds(doorCells(door));
  return wayFrame({ x: b.minX, y: b.minY, w: b.maxX - b.minX + 1, h: b.maxY - b.minY + 1 }, down);
}

/** Rock shoulders outside the full-width route, with a chipped face towards the opening. */
export function drawNarrows(hand: Hand): void {
  const { scene } = hand;
  const doors = scene.env.dungeon.doors.filter(door => door.kind === 'opening' || door.kind === 'door');
  if (!doors.length) return;
  const { ctx, style } = scene.env;
  const { grid } = scene;
  ctx.save();
  // The floor outline bends inside a cell: preserve its ink, including Engraved's second cut.
  // Intersect the outside of each floor piece; their grown outlines are already shared geometry.
  for (const shape of scene.floors) {
    ctx.beginPath();
    ctx.rect(grid.x0, grid.y0, grid.w / grid.res, grid.h / grid.res);
    traceRings(ctx, shapeRings(shape, wallInkWidth(style) + 0.05, scene.frame.pxPerCell));
    ctx.clip('evenodd');
  }
  for (const door of doors) {
    const { at, across } = doorFrame(door);
    for (const side of [-1, 1]) {
      const edge = across / 2;
      const p = (u: number, v: number): Vec => at(side * (edge + u), v);
      const poly = [p(0.21, -0.43), p(0.09, -0.30), p(0.055, -0.12), p(0.035, 0.04), p(0.075, 0.22), p(0.18, 0.43), p(0.26, 0.32), p(0.24, -0.18)];
      hand.surface(polyPath(poly), 'rock');
      hand.edges(poly, true);
      hand.line([[p(0.14, -0.28), p(0.12, -0.12), p(0.17, -0.02)], [p(0.12, 0.19), p(0.19, 0.28)]], 'fine');
    }
  }
  ctx.restore();
}
