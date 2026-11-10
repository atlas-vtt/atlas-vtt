/**
 * The wells of a built theme, straight openings that follow the building's lines: a stair well
 * beside the stairs that rise from a hall (a Mansion's entrance hall) through the floor above, so
 * the room they arrive in looks down into the hall; and light wells, an opening in a landing's
 * floor that lets the light from above down to the room below it.
 */

import type { CellPoint, DungeonRoom, DungeonStair } from '../model';
import { type CellRect, cellsOf, floorRect, inRect } from '../geometry';
import { floorBelow } from '../floors/floorStack';
import { spotRect } from '../floors/stairSpots';
import { chance } from '../rng';
import type { FeatureSpec } from '../themes/features';
import { draft } from './catalog';
import type { FloorTerrain } from './floorTerrain';
import type { RoomCells } from './roomCells';
import { mayCutIn, reasonsOf } from './typeReasons';
import type { TerrainWork } from './work';

/** An opening in a room's floor leaves at least this share of it to stand on. */
export const GALLERY_FLOOR = 0.5;
/** How often a landing has a light well, where one fits. */
const LIGHT_WELL_CHANCE = 0.6;

/** A room an opening may be cut in: a plain room of the regular wing, neither round, nor the boss room, nor a stage. */
export function mayOpen(room: DungeonRoom): boolean {
  return room.kind === 'room' && room.wing === 'regular' && !room.rotunda && !room.boss && room.stage === undefined;
}

/** Whether an opening of `cells` may be cut in the room: it keeps the room whole and half its floor, and the way onto its stairs clear. */
function cuttable(rc: RoomCells, cells: readonly CellPoint[]): boolean {
  return cells.length <= rc.floorCount * (1 - GALLERY_FLOOR) && rc.allows(cells, 'block');
}

/** The strips beside a stairwell's long sides, as long as it runs, two cells deep and then one. */
function besideStairs(stair: DungeonStair): CellRect[] {
  const r = spotRect(stair);
  const out: CellRect[] = [];
  for (const depth of [2, 1]) {
    if (stair.down.x !== 0) out.push({ ...r, y0: r.y0 - depth, y1: r.y0 - 1 }, { ...r, y0: r.y1 + 1, y1: r.y1 + depth });
    else out.push({ ...r, x0: r.x0 - depth, x1: r.x0 - 1 }, { ...r, x0: r.x1 + 1, x1: r.x1 + depth });
  }
  return out;
}

/**
 * A stair well over `hall` (floor `k`): beside the stairs that rise from it to `above`, cut in the
 * room they arrive in where its type may overlook the hall, over the hall's floor. None where no
 * stairs rise from the hall.
 */
export function cutStairWell(work: TerrainWork, above: FloorTerrain, k: number, hall: DungeonRoom, reason: FeatureSpec): void {
  const floor = floorRect(hall);
  const stairs = (work.floors[k]?.plan.stairs ?? []).filter((s) => s.to === above.index && cellsOf(spotRect(s)).every((c) => inRect(floor, c.x, c.y)));
  for (const stair of stairs) {
    const rc = above.roomHolding(cellsOf(spotRect(stair)));
    if (!rc || !mayOpen(rc.room) || !mayCutIn(work, above.index, rc.room.id, reason)) continue;
    for (const rect of besideStairs(stair)) {
      const cells = cellsOf(rect);
      if (!cells.every((c) => inRect(floor, c.x, c.y)) || !cuttable(rc, cells)) continue;
      if (above.place({ ...draft('gallery', rc.room.id, cells, { name: reason.name }), opening: { bottom: k, link: work.nextLink() } }) !== null) return;
    }
  }
}

/** Openings of 2 × 2 cells, then 1 × 2, a cell clear of the walls of a room with floor `f`, nearest its middle first. */
function lightWellSpots(f: CellRect): CellRect[] {
  const inner = { x0: f.x0 + 1, y0: f.y0 + 1, x1: f.x1 - 1, y1: f.y1 - 1 };
  const [cx, cy] = [(f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2];
  const out: CellRect[] = [];
  for (const [w, h] of [[2, 2], [2, 1], [1, 2]] as const) {
    const sized: CellRect[] = [];
    for (let y = inner.y0; y + h - 1 <= inner.y1; y++) for (let x = inner.x0; x + w - 1 <= inner.x1; x++) sized.push({ x0: x, y0: y, x1: x + w - 1, y1: y + h - 1 });
    const off = (r: CellRect): number => Math.abs((r.x0 + r.x1) / 2 - cx) + Math.abs((r.y0 + r.y1) / 2 - cy);
    out.push(...sized.sort((a, b) => off(a) - off(b)));
  }
  return out;
}

/**
 * A light well in each room whose type has the reason (a Mansion's landing), on a floor with one
 * below, now and then: a straight opening near its middle over the floor of a room right below,
 * never over that room's stairs. A room already opened (a stair well) takes none.
 */
export function lightWells(work: TerrainWork): void {
  work.floors.forEach((floor, k) => {
    const under = floorBelow(work.stack, k);
    const below = work.floors[under ?? -1];
    if (under === null || !below) return;
    for (const room of floor.plan.rooms) {
      const typed = work.typed(k, room.id);
      const reason = typed && reasonsOf(typed.spec, work.theme.ruined).find((r) => r.at === 'here' && r.upperFloor && r.kinds.includes('gallery'));
      const rc = floor.room(room.id);
      if (!reason || !rc || !mayOpen(room) || floor.pieces.some((p) => p.room === room.id && p.opening)) continue;
      if (!chance(work.rng(k, `light-well:${room.id}`), LIGHT_WELL_CHANCE)) continue;
      for (const rect of lightWellSpots(floorRect(room))) {
        const cells = cellsOf(rect);
        const lit = below.roomHolding(cells);
        if (!lit || cells.some((c) => lit.nearStairs(c) || rc.nearStairs(c)) || !cuttable(rc, cells)) continue;
        if (floor.place({ ...draft('gallery', rc.room.id, cells, { name: reason.name }), opening: { bottom: under, link: work.nextLink() } }) !== null) break;
      }
    }
  });
}
