/**
 * The boss room: an arena, not a story. Of the rooms nothing grew from that lie farthest from
 * where the floor is entered, the one that can grow largest, made as large as the rock allows. It
 * stays a dead end, so the way to it runs through one room (its parent) alone; where it shares a
 * long enough wall with that room, a second door joins them (`addBossDoor`).
 */

import { type CellRect, intersection } from '../geometry';
import type { KeyedRng } from '../rng';
import { costsFromStart } from './costs';
import { roomFits } from './grow';
import { type LoopCandidate, loopCandidates, placeLoop } from './loops';
import type { RoomSize } from './sizes';
import { type WorkLayout, type WorkRoom, childrenOf, floorArea, isNormal, liveRooms, roomRect } from './workLayout';

/** How much wider (walls included, so in steps of two) and deeper the boss room may grow. */
const MORE_WIDTH = [4, 2, 0];
const MORE_DEPTH = [4, 3, 2, 1, 0];
/** No boss room grows past this, walls included. */
const MAX_WIDTH = 13;
const MAX_DEPTH = 12;
/** Only rooms this close to the farthest may be the boss room. */
const FAR_SHARE = 0.75;
/** Under a room above that could hold a gallery over it, a boss room counts as this many cells larger. */
const GALLERY_BONUS = 16;
/** How much of a boss room's floor must lie under such a room's for a gallery. */
const GALLERY_CELLS = 4;

/** The largest size the room may grow to: it has no doors but the one it grew through, in its near wall's middle. */
function largest(layout: WorkLayout, room: WorkRoom): RoomSize {
  const options = MORE_WIDTH.flatMap((w) => MORE_DEPTH.map((d) => ({ width: Math.min(MAX_WIDTH, room.width + w), depth: Math.min(MAX_DEPTH, room.depth + d) })));
  options.sort((a, b) => b.width * b.depth - a.width * a.depth);
  return options.find((size) => roomFits(layout, roomRect({ ...room, ...size }), new Set([room.id]), false)) ?? room;
}

/** Whether a gallery from the floor above could look into a room of this size: its floor lies under a room's. */
function underGallery(room: WorkRoom, size: RoomSize, galleries: readonly CellRect[]): boolean {
  const r = roomRect({ ...room, ...size });
  const inner = { x0: r.x0 + 1, y0: r.y0 + 1, x1: r.x1 - 1, y1: r.y1 - 1 };
  return galleries.some((g) => {
    const o = intersection(inner, g);
    return o !== null && o.x1 > o.x0 && o.y1 > o.y0 && (o.x1 - o.x0 + 1) * (o.y1 - o.y0 + 1) >= GALLERY_CELLS;
  });
}

/**
 * Makes the boss room; false where the floor has no room it can be. Of rooms about as large, one a
 * gallery above could look into (`galleries`) is chosen first.
 */
export function placeBossRoom(layout: WorkLayout, galleries: readonly CellRect[] = []): boolean {
  const costs = costsFromStart(layout);
  const leaves = liveRooms(layout).filter((room) => room.id !== 0 && isNormal(room) && !room.fixed && childrenOf(layout, room.id).length === 0 && Number.isFinite(costs[room.id]));
  const far = Math.max(0, ...leaves.map((room) => costs[room.id] ?? 0));
  const grown = leaves.filter((room) => (costs[room.id] ?? 0) >= far * FAR_SHARE).map((room) => ({ room, size: largest(layout, room) }));
  const area = ({ room, size }: { room: WorkRoom; size: RoomSize }): number => floorArea(size) + (underGallery(room, size, galleries) ? GALLERY_BONUS : 0);
  const best = grown.sort((a, b) => area(b) - area(a) || (costs[b.room.id] ?? 0) - (costs[a.room.id] ?? 0) || a.room.id - b.room.id)[0];
  if (!best) return false;
  Object.assign(best.room, best.size, { boss: true });
  return true;
}

/** A second door from the room before the boss room, where their shared wall has room for one. */
export function addBossDoor(rngOf: KeyedRng, layout: WorkLayout): void {
  const boss = layout.rooms.find((room) => room.boss && !room.removed);
  const parent = boss?.parent;
  if (!boss || parent === null || parent === undefined) return;
  const pair = (a: WorkRoom, b: WorkRoom): boolean => (a.id === boss.id && b.id === parent) || (b.id === boss.id && a.id === parent);
  const candidate: LoopCandidate | undefined = loopCandidates(layout, pair, true)[0];
  if (candidate) placeLoop(rngOf('boss'), layout, candidate, null, []);
}
