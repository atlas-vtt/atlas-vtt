import type { DungeonModel, DungeonRoom } from '../model';
import type { MapLayout } from '../render/layoutSize';
import { visibleFloor } from '../render/visibleDungeon';
import type { DungeonView } from '../style';

/** One blot of ink the map grows from: a room's floor, or the last wave that settles the rest. */
export interface RevealSeed {
  /** Its middle, in the bitmap's pixels. */
  x: number;
  y: number;
  /** How far it reaches once grown, its wobble included. */
  radius: number;
  /** When it starts to grow and how long it takes, as shares of the whole reveal. */
  start: number;
  grow: number;
  /** Phases of its edge's wobble, fixed per room so a dungeon always grows alike. */
  phase: [number, number, number];
}

export interface RevealPlan {
  seeds: RevealSeed[];
  /** The wave from the entrance that brings in the rock, the paper and the passages last. */
  wave: RevealSeed;
  /** The whole reveal, in milliseconds. */
  durationMs: number;
  /** The soft edge of every blot, in the bitmap's pixels. */
  feather: number;
}

/** When the rooms begin and how long one takes to bloom, as shares of the reveal. */
const FIRST_START = 0.04;
const LAST_START = 0.52;
const ROOM_GROW = 0.34;
const WAVE_START = 0.48;
/** How much of a room's turn the order it was grown in decides; distance from the entrance decides the rest, so rooms of one level ripple outward. */
const LEVEL_SHARE = 0.55;
/** Beyond a room's corners, so its wobbling edge still covers them once grown. */
const ROOM_REACH = 1.45;
/** A few levels of rooms play quicker than a deep dungeon, never too quick to follow nor too slow to wait for. */
const BASE_MS = 1300;
const PER_LEVEL_MS = 90;
const MAX_MS = 2300;

/** How many rooms lie between `room` and the first room, following each room's parent. */
function depthOf(room: DungeonRoom, byId: ReadonlyMap<number, DungeonRoom>, depths: Map<number, number>): number {
  const known = depths.get(room.id);
  if (known !== undefined) return known;
  let depth = 0;
  const seen = new Set<number>([room.id]);
  for (let parent = room.parent; parent !== null; ) {
    const above = byId.get(parent);
    if (!above || seen.has(above.id)) break;
    seen.add(above.id);
    const cached = depths.get(above.id);
    if (cached !== undefined) {
      depth += cached + 1;
      break;
    }
    depth += 1;
    parent = above.parent;
  }
  depths.set(room.id, depth);
  return depth;
}

/** A stable fraction of a turn from a room's id, so its wobble is its own. */
function phaseOf(id: number, k: number): number {
  return ((Math.sin((id + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1 * Math.PI * 2;
}

/**
 * How the map of `floor` grows out of nothing: every room shown as a blot from its middle, in the
 * order the generator grew them (the first room, then the rooms grown from it, and so on), rooms of
 * one level rippling outward from the entrance, then one wave from the entrance over the whole bitmap. `map` is the
 * bitmap's layout (its cells, its pixels per cell).
 */
export function revealPlan(model: DungeonModel, view: Pick<DungeonView, 'secrets'>, map: MapLayout, floor: number, size: { width: number; height: number }): RevealPlan {
  const rooms = visibleFloor(model, view, floor).rooms;
  const byId = new Map(rooms.map((room) => [room.id, room] as const));
  const depths = new Map<number, number>();
  const levels = rooms.map((room) => depthOf(room, byId, depths));
  const deepest = Math.max(0, ...levels);
  const toPx = (cellX: number, cellY: number): { x: number; y: number } => ({
    x: (cellX - map.originCell.x) * map.pxPerCell,
    y: (cellY - map.originCell.y) * map.pxPerCell,
  });

  const entrance = rooms.find((room) => room.parent === null) ?? rooms[0];
  const centreOf = (room: DungeonRoom): { x: number; y: number } => toPx(room.x + room.w / 2, room.y + room.h / 2);
  const origin = entrance ? centreOf(entrance) : { x: size.width / 2, y: size.height / 2 };
  const distances = rooms.map((room) => {
    const { x, y } = centreOf(room);
    return Math.hypot(x - origin.x, y - origin.y);
  });
  const farthestRoom = Math.max(1, ...distances);

  const seeds = rooms.map((room, index): RevealSeed => {
    const order = LEVEL_SHARE * (deepest > 0 ? levels[index]! / deepest : 0) + (1 - LEVEL_SHARE) * (distances[index]! / farthestRoom);
    return {
      ...centreOf(room),
      radius: (Math.hypot(room.w, room.h) / 2) * map.pxPerCell * ROOM_REACH,
      start: FIRST_START + order * (LAST_START - FIRST_START),
      grow: ROOM_GROW,
      phase: [phaseOf(room.id, 1), phaseOf(room.id, 2), phaseOf(room.id, 3)],
    };
  }).sort((a, b) => a.start - b.start);

  const corners: [number, number][] = [[0, 0], [size.width, 0], [0, size.height], [size.width, size.height]];
  const farthest = Math.max(...corners.map(([x, y]) => Math.hypot(x - origin.x, y - origin.y)));
  return {
    seeds,
    wave: { x: origin.x, y: origin.y, radius: farthest * 1.25, start: WAVE_START, grow: 1 - WAVE_START, phase: [0.4, 2.1, 4.3] },
    durationMs: Math.min(MAX_MS, BASE_MS + PER_LEVEL_MS * (deepest + 1)),
    feather: Math.max(3, map.pxPerCell * 0.4),
  };
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** How far a seed has grown at `t` (0 to 1 of the reveal): 0 before it starts, 1 once grown. */
export function grownAt(seed: RevealSeed, t: number, wave = false): number {
  const local = Math.min(1, Math.max(0, (t - seed.start) / seed.grow));
  return wave ? easeInOutCubic(local) : easeOutCubic(local);
}

/** `plan` for a bitmap `sx` times as wide and `sy` times as tall as the one it was made for. */
export function scaledPlan(plan: RevealPlan, sx: number, sy: number): RevealPlan {
  const reach = Math.max(sx, sy);
  const scale = (seed: RevealSeed): RevealSeed => ({ ...seed, x: seed.x * sx, y: seed.y * sy, radius: seed.radius * reach });
  return { ...plan, seeds: plan.seeds.map(scale), wave: scale(plan.wave), feather: plan.feather * reach };
}
