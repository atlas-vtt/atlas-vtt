import type { CellDir, DungeonDoor, DungeonStair } from '../../model';
import { stackOf, stairEnd } from '../../floors/floorStack';
import type { StairEnd } from '../../floors/stairSpots';
import type { Vec } from '../geometry';
import type { VisibleFloor } from '../visibleDungeon';
import { drawFlight } from '../terrain/raised';
import type { Hand } from './hand';
import { polyPath } from './paths';
import { drawWindows } from './windows';
import { doorAnchor, doorMiddle } from '../../geometry';
import { type CaveWayDraw, type CaveWayPart, caveWay } from '../cave/caveArt';

/**
 * Passages and stairs, drawn once through a hand. An opening is the gap the walls leave (nothing
 * more); a door is a planked leaf hung between two dressed jambs; steps are treads across the
 * passage, darker towards the low end; a stairwell between floors goes down into the dark on the
 * floor above and comes up through a break line on the floor below, walled round on both. A secret
 * door is wall.
 */

/** Maps a point of a door's own frame (u across the way, v along it, −0.5..0.5) into cells: round its cell's middle, or its edge's. */
function cellFrame(door: Pick<DungeonDoor, 'x' | 'y' | 'dir' | 'edge' | 'wide'>): (u: number, v: number) => Vec {
  const { dir } = door;
  const o = doorAnchor(door);
  return (u, v) => ({ x: o.x + -dir.y * u + dir.x * v, y: o.y + dir.x * u + dir.y * v });
}

/**
 * Where a door's leaf and jambs stand across its way (`u` of its frame): its cell, or a house's
 * doorway as the floors either side reach it, so jambs never lie over the ink of a wall it meets.
 */
function doorSpan(door: DungeonDoor, dungeon: VisibleFloor): [number, number] {
  const shape = door.edge ? dungeon.house?.doorways.get(door) : undefined;
  if (!shape) return [-0.5, 0.5];
  const mid = doorMiddle(door);
  const ends = door.dir.y !== 0 ? [shape.x, shape.x + shape.w].map((x) => (x - mid.x) * -door.dir.y) : [shape.y, shape.y + shape.h].map((y) => (y - mid.y) * door.dir.x);
  return [Math.min(...ends), Math.max(...ends)];
}

export function drawPassages(hand: Hand): void {
  const { env } = hand.scene;
  // A cave's ways each by its registered drawing (`cave/caveArt.ts`); a part not drawn yet as below.
  const way = (part: CaveWayPart): CaveWayDraw | undefined => caveWay(part, env);
  const drawn = (part: CaveWayPart): boolean => way(part) !== undefined;
  for (const part of ['narrows', 'crawl', 'scree', 'pitch', 'aven'] as const) way(part)?.(hand);
  for (const door of env.dungeon.doors) {
    if (door.kind === 'door' && !drawn('narrows')) drawDoor(hand, door);
    else if (door.kind === 'steps' && !drawn('scree')) drawFlight(hand, { x: door.x, y: door.y, w: 1, h: 1 }, door.descends ? door.dir : flip(door.dir), 0, 0.22);
  }
  drawWindows(hand);
  for (const stair of env.dungeon.floor.stairs) {
    const end = stairwellEnd(env.dungeon, stair);
    const part = stairPart(stair, end);
    if (!part || !drawn(part)) drawStairwell(hand, stair, end);
  }
}

/** The end of a stairwell the floor shown holds: its upper end where the stairs lead to a floor below. */
export function stairwellEnd(dungeon: Pick<VisibleFloor, 'model' | 'index'>, stair: DungeonStair): StairEnd {
  return stairEnd(stackOf(dungeon.model), dungeon.index, stair.to);
}

const flip = (d: CellDir): CellDir => ({ x: -d.x as CellDir['x'], y: -d.y as CellDir['y'] });

/** The cave drawing a stairwell's end takes: a scree slope, a pitch from above or an aven from below; none for stairs. */
function stairPart(stair: Pick<DungeonStair, 'way'>, end: StairEnd): CaveWayPart | null {
  if (stair.way === 'scree') return 'scree';
  if (stair.way === 'pitch') return end === 'upper' ? 'pitch' : 'aven';
  return null;
}

/** A door: a leaf of planks bound with iron, hung between two dressed jambs set into the walls. */
function drawDoor(hand: Hand, door: DungeonDoor): void {
  const [lo, hi] = doorSpan(door, hand.scene.env.dungeon);
  const centre = (lo + hi) / 2;
  const frame = cellFrame(door);
  const at = (u: number, v: number): Vec => frame(centre + u, v);
  const quad = (u0: number, v0: number, u1: number, v1: number): Vec[] => [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
  const jamb = 0.15;
  const width = (hi - lo) / 2;
  for (const side of [-1, 1]) {
    const q = side < 0 ? quad(-width, -0.15, -width + jamb, 0.15) : quad(width - jamb, -0.15, width, 0.15);
    hand.surface(polyPath(q), 'dressed');
    hand.edges(q, true);
  }
  const half = width - jamb + 0.03;
  const leaf = quad(-half, -0.075, half, 0.075);
  hand.surface(polyPath(leaf), 'wood');
  hand.line([-0.18, 0, 0.18].map(u => [at(u, -0.075), at(u, 0.075)]), 'fine');
  for (const v of [-0.04, 0.04]) {
    const band = quad(-half, v - 0.012, half, v + 0.012);
    hand.surface(polyPath(band), 'metal');
  }
  hand.edges(leaf, true);
}

/**
 * A stairwell between floors, on the floor it goes down from (`upper`) or comes up to (`lower`):
 * the same treads on both, walled round. Going down, the treads sink into the dark at the low end;
 * coming up, past a break line where they pass through the ceiling, they fade.
 */
function drawStairwell(hand: Hand, stair: DungeonStair, end: StairEnd): void {
  const along = stair.down.x !== 0 ? stair.w : stair.h;
  const across = stair.down.x !== 0 ? stair.h : stair.w;
  const cx = stair.x + stair.w / 2;
  const cy = stair.y + stair.h / 2;
  // u across the treads, v along the way down.
  const at = (u: number, v: number): Vec => ({ x: cx + -stair.down.y * u + stair.down.x * v, y: cy + stair.down.x * u + stair.down.y * v });
  const top = -along / 2;
  const half = across / 2;
  drawFlight(hand, { x: stair.x, y: stair.y, w: stair.w, h: stair.h }, stair.down, 0.02, 0.2);
  const whole = [at(-half, top), at(half, top), at(half, -top), at(-half, -top)];
  if (end === 'upper') {
    // Deeper and deeper towards the low end, until the treads sink into the dark below.
    hand.tone((x, y) => {
      const v = (x - cx) * stair.down.x + (y - cy) * stair.down.y;
      const t = (v - top) / along;
      return Math.max(0, Math.min(1, (t - 0.35) / 0.65)) ** 1.6;
    }, { minX: stair.x, minY: stair.y, maxX: stair.x + stair.w, maxY: stair.y + stair.h }, polyPath(whole), 'depth');
  } else {
    const cut = top + along * 0.4;
    const faded = [at(-half, top), at(half, top), at(half, cut), at(-half, cut)];
    hand.tone(() => 0.35, { minX: stair.x, minY: stair.y, maxX: stair.x + stair.w, maxY: stair.y + stair.h }, polyPath(faded), 'shade');
    const kink = 0.06;
    hand.line([[at(-half, cut + kink), at(-kink, cut + kink), at(0, cut - kink), at(kink, cut + kink * 1.6), at(kink * 2, cut - kink * 0.5), at(half, cut - kink * 0.5)]], 'heavy');
  }
  // The well is walled round on both floors, so the stairs read as one shaft.
  hand.line([whole], 'heavy', true);
}
