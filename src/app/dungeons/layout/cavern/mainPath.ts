/**
 * The main path of a cave floor, two cells wide: from where the floor is entered (the entrance,
 * or the stairwell from above) to where it is left (the stairwell down) or to the boss room. It
 * is found before the cave is shaped, as a walk of 2 × 2 blocks over the route's rooms, the cells
 * of its doors and the wall beside each, and the side walls of its tunnels, so every block it
 * takes can become floor.
 */

import { type StairSpot, approachCells, spotRect } from '../../floors/stairSpots';
import { cellKey, cellsOf, floorRect, inRect } from '../../geometry';
import type { CellPoint, DungeonRoom } from '../../model';
import { hops, neighbours, openDoor } from '../../roomGraph';
import { type Rng, rngFrom } from '../../rng';
import { type Noise2, fractalNoise } from '../../water/noise';
import { CaveGrid, type CaveFloorPlan, NEAR4, NEAR8, unkey } from './caveGrid';
import { MinHeap } from '../minHeap';
import { type LaneOwner, crossingConflict, entranceDoor, laneConflict, laneOwners } from './laneCells';

export { claimLane } from './laneCells';

/** How much dearer a block may be to walk on than the cheapest, and over how many cells that changes. */
const WANDER = 2.5;
const WANDER_PERIOD = 4;
/** The seed of the layout's lane cost: fixed, so every check of a layout finds the same lane. */
const WANDER_SEED = 0x5ca1ab1e;
const wanderNoise = fractalNoise(rngFrom(WANDER_SEED), 1, 0.5, WANDER_PERIOD);

/** The cost of stepping onto the block at (ax, ay): 1, and up to `weight` more where the noise is high. */
function noiseCost(noise: Noise2, weight: number): (ax: number, ay: number) => number {
  return (ax, ay) => 1 + weight * Math.max(0, noise(ax + 1, ay + 1) + 0.5);
}

/** The cost of stepping onto the block at (ax, ay): the same on every device and in every check of a layout. */
const wander = noiseCost(wanderNoise, WANDER);
/** The winding lane a floor is shaped with: dearer and finer, its own per floor. */
const WINDING = 20;
const WINDING_PERIOD = 4.5;

/** How a lane is found: what each block costs, whether it may wind out into the rock its chambers may swell into, and whether the walk is guided towards its goal (A*). */
export interface LaneWay {
  cost: (ax: number, ay: number) => number;
  swell: boolean;
  guided: boolean;
}

const LAYOUT_WAY: LaneWay = { cost: wander, swell: false, guided: false };

/** The way a floor's shaping finds its lane: winding from side to side, past its chambers' rectangles where it may. */
export function windingWay(rng: Rng): LaneWay {
  const noise = fractalNoise(rng, 1, 0.5, WINDING_PERIOD);
  return { cost: noiseCost(noise, WINDING), swell: true, guided: true };
}

export type LaneEnd = { kind: 'entrance' } | { kind: 'stair'; spot: StairSpot } | { kind: 'room'; id: number };

function roomOfEnd(floor: Pick<CaveFloorPlan, 'rooms' | 'doors'>, end: LaneEnd): number {
  if (end.kind === 'room') return end.id;
  if (end.kind === 'entrance') return floor.doors[entranceDoor(floor)]?.to ?? -1;
  const r = spotRect(end.spot);
  return floor.rooms.find((room) => room.kind === 'room' && inRect(floorRect(room), r.x0, r.y0) && inRect(floorRect(room), r.x1, r.y1))?.id ?? -1;
}

/** The rooms from one end to the other by the fewest open doors; none where no way leads. */
export function mainRoute(floor: Pick<CaveFloorPlan, 'rooms' | 'doors'>, from: LaneEnd, to: LaneEnd): number[] {
  const start = roomOfEnd(floor, from);
  const goal = roomOfEnd(floor, to);
  if (start < 0 || goal < 0) return [];
  const adjacent = neighbours(floor.rooms.length, floor.doors, openDoor);
  const back = new Map<number, number>([[start, start]]);
  const queue = [start];
  for (let head = 0; head < queue.length && !back.has(goal); head++) {
    const at = queue[head]!;
    for (const next of adjacent[at] ?? []) {
      if (back.has(next)) continue;
      back.set(next, at);
      queue.push(next);
    }
  }
  if (!back.has(goal)) return [];
  const route = [goal];
  while (route[0] !== start) route.unshift(back.get(route[0]!)!);
  return route;
}

/** The cells a lane end's blocks must lie in, and of which they must hold one of `touch`. */
function endArea(floor: CaveFloorPlan, end: LaneEnd, side: 'upper' | 'lower'): { area: Set<string>; touch: Set<string> } {
  const keys = (cells: readonly CellPoint[]): Set<string> => new Set(cells.map((c) => cellKey(c.x, c.y)));
  if (end.kind === 'room') {
    const room = floor.rooms[end.id];
    const cells = room ? cellsOf(floorRect(room)) : [];
    return { area: keys(cells), touch: keys(cells) };
  }
  if (end.kind === 'stair') {
    const rows = approachCells(end.spot, side);
    return { area: keys([...cellsOf(spotRect(end.spot)), ...rows]), touch: keys(rows) };
  }
  const door = floor.doors[entranceDoor(floor)];
  if (!door) return { area: new Set(), touch: new Set() };
  const row = [-1, 0, 1].map((s) => ({ x: door.x + s * door.dir.y, y: door.y + s * door.dir.x }));
  return { area: keys([...row, ...row.map((c) => ({ x: c.x + door.dir.x, y: c.y + door.dir.y }))]), touch: keys([{ x: door.x, y: door.y }]) };
}

const blockCells = (ax: number, ay: number): CellPoint[] => [
  { x: ax, y: ay },
  { x: ax + 1, y: ay },
  { x: ax, y: ay + 1 },
  { x: ax + 1, y: ay + 1 },
];

/** Blocks lying in the end's area and holding one of its touch cells. */
function endBlocks(end: { area: Set<string>; touch: Set<string> }, ok: (x: number, y: number) => boolean): string[] {
  const out = new Set<string>();
  for (const key of end.touch) {
    const { x, y } = unkey(key);
    for (const [ax, ay] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]] as const) {
      const cells = blockCells(ax, ay);
      if (cells.every((c) => end.area.has(cellKey(c.x, c.y)) && ok(c.x, c.y))) out.add(cellKey(ax, ay));
    }
  }
  return [...out];
}

/** A block's number: its corner's place, for the walk's maps. */
const blockId = (ax: number, ay: number): number => (ax + 32768) * 65536 + (ay + 32768);
const blockAt = (id: number): CellPoint => ({ x: Math.floor(id / 65536) - 32768, y: (id % 65536) - 32768 });

/**
 * A walk of 2 × 2 blocks from the start's blocks to the goal's over cells `owners` allow; its
 * cells, or null. It goes the cheapest way over a gently varying cost (`price`), so where a
 * tunnel leaves it room the lane winds from side to side rather than running straight.
 */
function blockWalk(start: { area: Set<string>; touch: Set<string> }, goal: { area: Set<string>; touch: Set<string> }, owners: LaneOwner, price: LaneWay['cost'], guided = false): CellPoint[] | null {
  const ok = (x: number, y: number): boolean => owners(x, y) !== null;
  const ids = (keys: readonly string[]): number[] => keys.map((key) => {
    const { x, y } = unkey(key);
    return blockId(x, y);
  });
  const goals = new Set(ids(endBlocks(goal, ok)));
  // The cost of stepping onto each block met, Infinity where it does not fit: worked out once a block.
  const weights = new Map<number, number>();
  const weightOf = (id: number, ax: number, ay: number): number => {
    let w = weights.get(id);
    if (w === undefined) {
      w = ok(ax, ay) && ok(ax + 1, ay) && ok(ax, ay + 1) && ok(ax + 1, ay + 1) ? price(ax, ay) : Infinity;
      weights.set(id, w);
    }
    return w;
  };
  // Guided, the walk goes first where the steps left can be fewest (every step costs 1 at least), as A* does.
  const goalBlocks = [...goals].map(blockAt);
  const lefts = new Map<number, number>();
  const left = (id: number): number => {
    if (!guided) return 0;
    let steps = lefts.get(id);
    if (steps === undefined) {
      const { x, y } = blockAt(id);
      steps = Infinity;
      for (const g of goalBlocks) steps = Math.min(steps, Math.abs(g.x - x) + Math.abs(g.y - y));
      lefts.set(id, steps);
    }
    return steps;
  };
  const back = new Map<number, number>();
  const cost = new Map<number, number>();
  const open = new MinHeap<number>();
  for (const id of ids(endBlocks(start, ok))) {
    back.set(id, id);
    cost.set(id, 0);
    open.push(id, left(id));
  }
  let found: number | null = null;
  for (let next = open.pop(); next && found === null; next = open.pop()) {
    const at = next.item;
    const spent = cost.get(at)!;
    if (next.cost > spent + left(at)) continue;
    if (goals.has(at)) {
      found = at;
      break;
    }
    const { x: ax, y: ay } = blockAt(at);
    for (const [dx, dy] of NEAR4) {
      const id = blockId(ax + dx, ay + dy);
      const w = weightOf(id, ax + dx, ay + dy);
      const step = spent + w;
      if (w === Infinity || step >= (cost.get(id) ?? Infinity)) continue;
      back.set(id, at);
      cost.set(id, step);
      open.push(id, step + left(id));
    }
  }
  if (found === null) return null;
  const lane = new Map<string, CellPoint>();
  for (let id = found; ; id = back.get(id)!) {
    const { x: ax, y: ay } = blockAt(id);
    for (const c of blockCells(ax, ay)) lane.set(cellKey(c.x, c.y), c);
    if (back.get(id) === id) break;
  }
  return [...lane.values()].reverse();
}

/** How many times a lane whose owners would touch is given up at that cell and found anew. */
const LANE_RETRIES = 24;

/**
 * The lane's cells, two wide all the way, from `from` to `to` along `route`; null where no such
 * way fits. A stairwell is left from the row past its low end, the way down reached by the row
 * before its high end. Two rooms' cells of the lane never touch but round the narrows joining them.
 */
export function wideLane(grid: CaveGrid, floor: CaveFloorPlan, route: readonly number[], from: LaneEnd, to: LaneEnd, way: LaneWay = LAYOUT_WAY): CellPoint[] | null {
  if (route.length === 0) return null;
  const start = endArea(floor, from, 'lower');
  const goal = endArea(floor, to, 'upper');
  const banned = new Set<string>();
  const owners = laneOwners(grid, floor, route, [start.area, goal.area], banned, undefined, way.swell);
  for (let tries = 0; tries <= LANE_RETRIES; tries++) {
    const lane = blockWalk(start, goal, owners, way.cost, way.guided);
    if (!lane) return null;
    const conflict = crossingConflict(grid, floor, route, lane) ?? laneConflict(grid, lane, owners);
    if (conflict === null) return lane;
    banned.add(conflict);
  }
  return null;
}

/** Whether a two-cell lane fits from `from` to `to` on floor `index`: what a cave floor's layout must allow. */
export function laneFits(floor: CaveFloorPlan, from: LaneEnd, to: LaneEnd, index = -1): boolean {
  const route = mainRoute(floor, from, to);
  return route.length > 0 && wideLane(new CaveGrid(floor, index), floor, route, from, to) !== null;
}

/** Where a floor's main path ends without a way down: the boss room, else the normal room farthest by doors from where it starts. */
export function finalEnd(floor: Pick<CaveFloorPlan, 'rooms' | 'doors'>, from: LaneEnd, boss = true): LaneEnd {
  const bossRoom = boss ? floor.rooms.find((room) => room.boss) : undefined;
  if (bossRoom) return { kind: 'room', id: bossRoom.id };
  const distance = hops(neighbours(floor.rooms.length, floor.doors, openDoor), roomOfEnd(floor, from));
  const normal = floor.rooms.filter((room) => room.kind === 'room' && Number.isFinite(distance[room.id]));
  const far = normal.reduce<DungeonRoom | undefined>((best, room) => (!best || (distance[room.id] ?? 0) > (distance[best.id] ?? 0) ? room : best), undefined);
  return { kind: 'room', id: far?.id ?? 0 };
}

/** The first stairwell of a floor that leads to `to`: the way the main path takes. */
function firstStair(floor: Pick<CaveFloorPlan, 'stairs'>, to: number): StairSpot | undefined {
  return [...floor.stairs].filter((s) => s.to === to).sort((a, b) => (a.link ?? 0) - (b.link ?? 0))[0];
}

/** Where floor `index` of `count` is entered and left by its main path. */
export function laneEnds(index: number, count: number, floor: CaveFloorPlan, boss: boolean): [LaneEnd, LaneEnd] {
  const above = index > 0 ? firstStair(floor, index - 1) : undefined;
  const from: LaneEnd = above ? { kind: 'stair', spot: above } : { kind: 'entrance' };
  const below = index < count - 1 ? firstStair(floor, index + 1) : undefined;
  if (below) return [from, { kind: 'stair', spot: below }];
  return [from, finalEnd(floor, from, boss)];
}

/**
 * Whether a stairwell that would end on floor `index` (its upper end) keeps clear of the floor's
 * main path, which runs on to its first stairwell down: a second way between floors never takes
 * cells the first way needs.
 */
export function clearOfLane(floor: CaveFloorPlan, index: number): (spot: StairSpot) => boolean {
  const [from, to] = laneEnds(index, index + 2, floor, false);
  const route = mainRoute(floor, from, to);
  const lane = route.length ? wideLane(new CaveGrid(floor, index), floor, route, from, to) : null;
  if (!lane) return () => true;
  const keys = new Set(lane.map((c) => cellKey(c.x, c.y)));
  return (spot) => {
    const r = spotRect(spot);
    const home = floor.rooms.find((room) => inRect(floorRect(room), r.x0, r.y0));
    const kept = [...cellsOf(r), ...approachCells(spot, 'upper'), ...approachCells(spot, 'lower')];
    // Its cells may not be lane, nor lie beside lane outside its own room, which a tunnel would then touch.
    return !kept.some(
      (c) =>
        keys.has(cellKey(c.x, c.y)) ||
        NEAR8.some(([dx, dy]) => {
          const n = { x: c.x + dx, y: c.y + dy };
          return keys.has(cellKey(n.x, n.y)) && !(home && inRect(floorRect(home), n.x, n.y));
        }),
    );
  };
}
