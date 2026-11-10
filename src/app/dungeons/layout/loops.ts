/**
 * Loops: extra doors between rooms that share a long enough wall. The first closes a ring through
 * the way from the first room to the farthest, so a party has a choice where it matters; the rest,
 * about one per eight rooms, cut the longest ways short. None leads into the boss room, which
 * stays behind the one room before it. Secret shortcuts come later
 * (`addSecretLoops`), once the secret wings are known.
 */

import type { CellDir, CellPoint } from '../model';
import type { DungeonParams } from '../params';
import { type CellRect, inRect, intersection } from '../geometry';
import { type KeyedRng, type Rng, chance, pick } from '../rng';
import { farthestRoom, hops, neighbours, openDoor, shortestPath } from '../roomGraph';
import { rollLoopWay } from './cavern/veins/caveExits';
import { layoutEdges } from './costs';
import { pathCosts } from './graph';
import { normalCount } from './grow';
import { RoomIndex } from './roomIndex';
import { drawDoorKind } from './sizes';
import { REGULAR_ZONE, type WorkLayout, type WorkRoom, doorMayOpen, floorOf, isNormal, liveRooms, roomRect } from './workLayout';

/** Ordinary loops only shorten ways longer than this. */
const MIN_LOOP_COST = 5;
/** The loop through the main way may be shorter, but no tighter than three rooms round. */
const MIN_MAIN_LOOP_COST = 3;
/** Rooms per loop. */
const ROOMS_PER_LOOP = 8;
/** Floors this small may have no loop at all. */
const SMALL_FLOOR = 5;
/** A loop door keeps off the cells of other doors and those beside them. */
const NEAR_DOOR: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

interface LoopSpot {
  cell: CellPoint;
  /** From room `a` into room `b`. */
  dir: CellDir;
}

export interface LoopCandidate {
  a: number;
  b: number;
  spots: LoopSpot[];
}

function spotsAlong(a: WorkRoom, b: WorkRoom, cells: CellPoint[], d: CellDir): LoopSpot[] {
  const fa = floorOf(a);
  const fb = floorOf(b);
  return cells.filter((c) => inRect(fa, c.x - d.x, c.y - d.y) && inRect(fb, c.x + d.x, c.y + d.y)).map((cell) => ({ cell, dir: d }));
}

/** Door cells in the straight wall two rooms share (never its corners); none for a wall under 3 cells. */
function sharedWallSpots(a: WorkRoom, b: WorkRoom): LoopSpot[] {
  const wall = intersection(roomRect(a), roomRect(b));
  if (!wall) return [];
  const cells: CellPoint[] = [];
  for (let y = wall.y0; y <= wall.y1; y++) for (let x = wall.x0; x <= wall.x1; x++) cells.push({ x, y });
  let spots: LoopSpot[] = [];
  if (wall.x0 === wall.x1) {
    spots = spotsAlong(a, b, cells, { x: 1, y: 0 });
    if (spots.length === 0) spots = spotsAlong(a, b, cells, { x: -1, y: 0 });
  } else if (wall.y0 === wall.y1) {
    spots = spotsAlong(a, b, cells, { x: 0, y: 1 });
    if (spots.length === 0) spots = spotsAlong(a, b, cells, { x: 0, y: -1 });
  }
  const length = Math.max(wall.x1 - wall.x0, wall.y1 - wall.y0) + 1;
  return length >= 3 ? spots : [];
}

/**
 * Pairs of rooms that a door could join, with where it could stand; `allow` picks the pairs, and
 * pairs already joined count only with `relink`.
 */
export function loopCandidates(layout: WorkLayout, allow: (a: WorkRoom, b: WorkRoom) => boolean, relink = false): LoopCandidate[] {
  const linked = new Set(layout.doors.map((d) => `${Math.min(d.from ?? -1, d.to ?? -1)}:${Math.max(d.from ?? -1, d.to ?? -1)}`));
  const doorCells = new Set(layout.doors.map((d) => `${d.x},${d.y}`));
  const nearDoor = (c: CellPoint): boolean => NEAR_DOOR.some(([dx, dy]) => doorCells.has(`${c.x + dx},${c.y + dy}`));
  const rooms = liveRooms(layout);
  const rects = rooms.map(roomRect);
  const index = new RoomIndex();
  rects.forEach((rect, k) => index.add(k, rect));
  const out: LoopCandidate[] = [];
  rooms.forEach((a, k) => {
    for (const m of index.touching(rects[k] as CellRect)) {
      if (m <= k) continue;
      const b = rooms[m] as WorkRoom;
      if (!allow(a, b)) continue;
      if (!relink && linked.has(`${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`)) continue;
      const spots = sharedWallSpots(a, b).filter((spot) => !nearDoor(spot.cell) && doorMayOpen(layout, spot.cell, spot.dir));
      if (spots.length > 0) out.push({ a: a.id, b: b.id, spots });
    }
  });
  return out;
}

/**
 * The walking cost between each candidate's rooms as the doors stand now: the doors read once, and
 * the costs from a room worked out once, from whichever end of a pair more candidates share (doors
 * are walked both ways at one cost). A cave floor has hundreds of candidates, and working the costs
 * out anew for each took most of a floor's attempt.
 */
function costsBetween(layout: WorkLayout, candidates: readonly LoopCandidate[]): number[] {
  const edges = layoutEdges(layout);
  const shared = new Map<number, number>();
  for (const { a, b } of candidates) for (const id of [a, b]) shared.set(id, (shared.get(id) ?? 0) + 1);
  const from = new Map<number, number[]>();
  const costsFrom = (id: number): number[] => {
    let costs = from.get(id);
    if (!costs) {
      costs = pathCosts(edges, id);
      from.set(id, costs);
    }
    return costs;
  };
  return candidates.map(({ a, b }) => {
    if (from.has(a)) return costsFrom(a)[b] ?? Infinity;
    if (from.has(b) || (shared.get(b) ?? 0) > (shared.get(a) ?? 0)) return costsFrom(b)[a] ?? Infinity;
    return costsFrom(a)[b] ?? Infinity;
  });
}

/** Places a loop door at one of the candidate's spots, and drops the candidates whose spots it crowds. */
export function placeLoop(rng: Rng, layout: WorkLayout, candidate: LoopCandidate, kind: 'secret' | null, pending: LoopCandidate[]): LoopCandidate[] {
  const spot = pick(rng, candidate.spots);
  const rooms = [layout.rooms[candidate.a], layout.rooms[candidate.b]];
  const corridors = rooms.every((room) => room && !isNormal(room));
  layout.doors.push({ x: spot.cell.x, y: spot.cell.y, dir: spot.dir, kind: kind ?? drawDoorKind(rng, corridors), from: candidate.a, to: candidate.b, loop: true });
  return pending
    .filter((c) => c !== candidate)
    .map((c) => ({ ...c, spots: c.spots.filter((s) => Math.abs(s.cell.x - spot.cell.x) + Math.abs(s.cell.y - spot.cell.y) > 1) }))
    .filter((c) => c.spots.length > 0);
}

/** The way from the first room to the one farthest from it, through doors a party finds; before any room is removed. */
export function mainWay(layout: WorkLayout): number[] {
  const adjacent = neighbours(layout.rooms.length, layout.doors, openDoor);
  return shortestPath(adjacent, 0, farthestRoom(hops(adjacent, 0)));
}

/**
 * How many loops a floor of this many normal rooms gets: about one per eight, at least one past
 * five rooms; a cave whose character asks for more loops (it curves back, it leaves no passage
 * dead) gets that many times as many. A string and a burrow, one way on throughout, get only the
 * loop their main way needs.
 */
function loopTarget(rng: Rng, normals: number, params: DungeonParams): number {
  const roll = rng();
  if (normals <= SMALL_FLOOR) return roll < 0.5 ? 1 : 0;
  if (params.string || params.cave?.veins?.rules.oneWayOn) return 1;
  const perLoop = ROOMS_PER_LOOP / (params.cave?.veins?.rules.loops ?? 1);
  return Math.max(1, Math.round(normals / perLoop + roll * 0.8 - 0.4));
}

/** A candidate among those whose ways are longest (within a fifth of the longest), so loops vary. */
function longCandidate(rng: Rng, layout: WorkLayout, candidates: readonly LoopCandidate[], minCost: number): LoopCandidate | null {
  const costs = costsBetween(layout, candidates);
  const ranked = candidates.map((candidate, k) => ({ candidate, cost: costs[k] ?? Infinity })).filter((r) => Number.isFinite(r.cost) && r.cost > minCost);
  if (ranked.length === 0) return null;
  const longest = Math.max(...ranked.map((r) => r.cost));
  return pick(rng, ranked.filter((r) => r.cost >= longest * 0.8)).candidate;
}

/**
 * Whether the ring a door between a candidate's rooms would close passes through a room of `way`,
 * the rooms joined by the open doors; the walk from each room is worked out once for every candidate.
 */
function ringsMeeting(layout: WorkLayout, way: ReadonlySet<number>): (candidate: LoopCandidate) => boolean {
  const adjacent = neighbours(layout.rooms.length, layout.doors, openDoor);
  const fromEnd = new Map<number, number[]>();
  return ({ a, b }) => {
    let toB = fromEnd.get(b);
    if (!toB) {
      toB = hops(adjacent, b);
      fromEnd.set(b, toB);
    }
    // The way begins and ends at the pair's rooms, so either on `way` settles it without walking it.
    if (!Number.isFinite(toB[a])) return false;
    if (way.has(a) || way.has(b)) return true;
    return shortestPath(adjacent, a, b, toB).some((id) => way.has(id));
  };
}

/** The loops of a floor and, in a cave, the way each is passed: one exit's size rolled for it, from a stream of its own. */
export function addLoops(rngOf: KeyedRng, layout: WorkLayout, params: DungeonParams): void {
  const before = layout.doors.length;
  placeLoops(rngOf, layout, params);
  const rules = params.cave?.veins?.rules;
  if (!rules) return;
  const rng = rngOf('loop-ways');
  for (const door of layout.doors.slice(before)) Object.assign(door, rollLoopWay(rng, rules.exits));
}

function placeLoops(rngOf: KeyedRng, layout: WorkLayout, params: DungeonParams): void {
  const rng = rngOf('loops');
  const target = loopTarget(rng, normalCount(layout), params);
  let pending = loopCandidates(layout, (a, b) => a.zone === REGULAR_ZONE && b.zone === REGULAR_ZONE && !a.boss && !b.boss);
  if (target === 0 || pending.length === 0) return;
  const main = longCandidate(rng, layout, pending.filter(ringsMeeting(layout, new Set(mainWay(layout)))), MIN_MAIN_LOOP_COST - 1);
  let placed = 0;
  if (main) {
    pending = placeLoop(rng, layout, main, null, pending);
    placed++;
  }
  for (; placed < target; placed++) {
    const next = longCandidate(rng, layout, pending, MIN_LOOP_COST);
    if (!next) return;
    pending = placeLoop(rng, layout, next, null, pending);
  }
}

/** Whether a cell is a corner of the room's floor. */
function atCorner(room: WorkRoom, c: CellPoint): boolean {
  const f = floorOf(room);
  return (c.x === f.x0 || c.x === f.x1) && (c.y === f.y0 || c.y === f.y1);
}

/**
 * The candidates whose spots lead into no chamber at a corner of its floor. A cave's hidden crawl
 * is rock as drawn, so nothing meets round it: the cell before it in a corner must be widened
 * along the wall it crosses, and where a passage runs along the other side of that wall (the main
 * path swinging out of a narrow tunnel) neither neighbour may be taken, and the cell stays a spur.
 */
function offChamberCorners(layout: WorkLayout, candidates: readonly LoopCandidate[]): LoopCandidate[] {
  const corner = (id: number, c: CellPoint): boolean => {
    const room = layout.rooms[id];
    return room !== undefined && isNormal(room) && atCorner(room, c);
  };
  return candidates
    .map((candidate) => ({ ...candidate, spots: candidate.spots.filter(({ cell, dir }) => !corner(candidate.a, { x: cell.x - dir.x, y: cell.y - dir.y }) && !corner(candidate.b, { x: cell.x + dir.x, y: cell.y + dir.y })) }))
    .filter((candidate) => candidate.spots.length > 0);
}

/** Now and then a secret door that cuts a long way short, into a secret wing or between ordinary rooms. */
export function addSecretLoops(rngOf: KeyedRng, layout: WorkLayout, params: DungeonParams): void {
  const rng = rngOf('secret-loops');
  if (!chance(rng, params.secretLoopChance)) return;
  const candidates = loopCandidates(layout, (a, b) => !a.boss && !b.boss && (a.zone === b.zone || a.zone === REGULAR_ZONE || b.zone === REGULAR_ZONE));
  const pending = params.cave?.veins ? offChamberCorners(layout, candidates) : candidates;
  const shortcut = longCandidate(rng, layout, pending, MIN_LOOP_COST);
  if (shortcut) placeLoop(rng, layout, shortcut, 'secret', pending);
}
