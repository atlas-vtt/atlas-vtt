import type { CaveWay } from '../../../caveModel';
import type { DungeonDoor } from '../../../model';
import type { Rng } from '../../../rng';
import type { ArtScene } from '../../art/artScene';
import type { Hand } from '../../art/hand';
import { clipFloors, traceRings } from '../../art/outline';
import { shapeRings, type Vec } from '../../geometry';
import { wallInkWidth } from '../../wallInk';

/**
 * Which way a door shown is passed, for the drawing: a walk unless an open door names another way.
 * A secret door stays the hidden crawl whatever it names, and a scree step stays a slope.
 */
export function drawnWay(door: DungeonDoor): CaveWay | null {
  if (door.kind !== 'opening' && door.kind !== 'door') return null;
  return door.way ?? 'walk';
}

/** The doors on show passed by `way`. */
export function doorsOfWay(hand: Hand, way: CaveWay): DungeonDoor[] {
  return hand.scene.env.dungeon.doors.filter(door => drawnWay(door) === way);
}

/** A seeded stream for one door's drawing, so a door's stones and side never move when another door changes. */
export function doorRng(hand: Hand, door: DungeonDoor, part: string): Rng {
  return hand.scene.env.rng(`way:${part}:${door.x},${door.y}`);
}

/**
 * Clips to the rock beyond the floor's outline and its wall ink, Engraved's second cut included,
 * so what is drawn there never lies over the floor or the walls the scene puts on that ink.
 */
export function clipToRock(scene: ArtScene): void {
  const { ctx, style } = scene.env;
  const { grid } = scene;
  // Intersect the outside of each floor piece; their grown outlines are already shared geometry.
  for (const shape of scene.floors) {
    ctx.beginPath();
    ctx.rect(grid.x0, grid.y0, grid.w / grid.res, grid.h / grid.res);
    traceRings(ctx, shapeRings(shape, wallInkWidth(style) + 0.05, scene.frame.pxPerCell));
    ctx.clip('evenodd');
  }
}

/** Clips to the floor inside its outline: what is drawn there never covers the wall ink, where the scene's walls lie. */
export function clipToFloor(scene: ArtScene): void {
  clipFloors(scene);
}

/** Draws `draw` within `clip`, putting the context back after. */
export function clipped(hand: Hand, clip: (scene: ArtScene) => void, draw: () => void): void {
  const { ctx } = hand.scene.env;
  ctx.save();
  clip(hand.scene);
  draw();
  ctx.restore();
}

/** A line from `a` to `b` broken into `teeth` sharp turns `amplitude` either side, as a survey marks a squeeze. */
export function zigzag(a: Vec, b: Vec, teeth: number, amplitude: number): Vec[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const points: Vec[] = [a];
  for (let k = 1; k < teeth * 2; k++) {
    const t = k / (teeth * 2);
    const side = k % 2 ? amplitude : -amplitude;
    points.push({ x: a.x + (b.x - a.x) * t + n.x * side, y: a.y + (b.y - a.y) * t + n.y * side });
  }
  points.push(b);
  return points;
}
