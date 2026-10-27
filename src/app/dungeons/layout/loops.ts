/**
 * Loops: extra doors between rooms that share a long enough wall. The first closes a ring through
 * the way from the first room to the farthest, so a party has a choice where it matters; the rest,
 * about one per eight rooms, cut the longest ways short. None leads into the boss room, which
 * stays behind the one room before it. Secret shortcuts come later
 * (`addSecretLoops`), once the secret wings are known.
 */

import type { CellDir, CellPoint } from '../model';
import type { DungeonParams } from '../params';
import { type CellRect, inRect, intersection, rectsTouch } from '../geometry';
import { type KeyedRng, type Rng, chance, pick } from '../rng';
import { farthestRoom, hops, neighbours, openDoor, shortestPath } from '../roomGraph';
import { layoutEdges } from './costs';
import { pathCosts } from './graph';
import { normalCount } from './grow';
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
  const nearDoor = (c: CellPoint): boolean =>
    [0, 1, -1].some((dx) => [0, 1, -1].some((dy) => Math.abs(dx) + Math.abs(dy) <= 1 && doorCells.has(`${c.x + dx},${c.y + dy}`)));
  const rooms = liveRooms(layout);
  const rects = rooms.map(roomRect);
  const out: LoopCandidate[] = [];
  rooms.forEach((a, k) => {
    for (let m = k + 1; m < rooms.length; m++) {
      const b = rooms[m] as WorkRoom;
      if (!rectsTouch(rects[k] as CellRect, rects[m] as CellRect) || !allow(a, b)) continue;
      if (!relink && linked.has(`${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`)) continue;
      const spots = sharedWallSpots(a, b).filter((spot) => !nearDoor(spot.cell) && doorMayOpen(layout, spot.cell, spot.dir));
      if (spots.length > 0) out.push({ a: a.id, b: b.id, spots });
    }
  });
  return out;
}

/** The walking cost between a candidate's rooms as the doors stand now. */
export function costBetween(layout: WorkLayout, candidate: LoopCandidate): number {
  return pathCosts(layoutEdges(layout), candidate.a)[candidate.b] ?? Infinity;
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

/** How many loops a floor of this many normal rooms gets: about one per eight, at least one past five rooms. */
function loopTarget(rng: Rng, normals: number, params: DungeonParams): number {
  const roll = rng();
  if (normals <= SMALL_FLOOR) return roll < 0.5 ? 1 : 0;
  if (params.string) return 1;
  return Math.max(1, Math.round(normals / ROOMS_PER_LOOP + roll * 0.8 - 0.4));
}

/** A candidate among those whose ways are longest (within a fifth of the longest), so loops vary. */
function longCandidate(rng: Rng, layout: WorkLayout, candidates: readonly LoopCandidate[], minCost: number): LoopCandidate | null {
  const ranked = candidates.map((candidate) => ({ candidate, cost: costBetween(layout, candidate) })).filter((r) => Number.isFinite(r.cost) && r.cost > minCost);
  if (ranked.length === 0) return null;
  const longest = Math.max(...ranked.map((r) => r.cost));
  return pick(rng, ranked.filter((r) => r.cost >= longest * 0.8)).candidate;
}

/** Whether the ring a door between the candidate's rooms would close passes through a room of `way`. */
function ringMeets(layout: WorkLayout, candidate: LoopCandidate, way: ReadonlySet<number>): boolean {
  const adjacent = neighbours(layout.rooms.length, layout.doors, openDoor);
  return shortestPath(adjacent, candidate.a, candidate.b).some((id) => way.has(id));
}

export function addLoops(rngOf: KeyedRng, layout: WorkLayout, params: DungeonParams): void {
  const rng = rngOf('loops');
  const target = loopTarget(rng, normalCount(layout), params);
  let pending = loopCandidates(layout, (a, b) => a.zone === REGULAR_ZONE && b.zone === REGULAR_ZONE && !a.boss && !b.boss);
  if (target === 0 || pending.length === 0) return;
  const way = new Set(mainWay(layout));
  const main = longCandidate(rng, layout, pending.filter((c) => ringMeets(layout, c, way)), MIN_MAIN_LOOP_COST - 1);
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

/** Now and then a secret door that cuts a long way short, into a secret wing or between ordinary rooms. */
export function addSecretLoops(rngOf: KeyedRng, layout: WorkLayout, params: DungeonParams): void {
  const rng = rngOf('secret-loops');
  if (!chance(rng, params.secretLoopChance)) return;
  const pending = loopCandidates(layout, (a, b) => !a.boss && !b.boss && (a.zone === b.zone || a.zone === REGULAR_ZONE || b.zone === REGULAR_ZONE));
  const shortcut = longCandidate(rng, layout, pending, MIN_LOOP_COST);
  if (shortcut) placeLoop(rng, layout, shortcut, 'secret', pending);
}
