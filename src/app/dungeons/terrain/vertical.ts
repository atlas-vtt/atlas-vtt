/**
 * What joins floors besides the stairs (Verticality): a gallery over the boss arena, which is then
 * a hall two floors high that the party looks down into from the floor above and may drop into; a
 * gallery over a hall whose type looks up into one (a minstrels' gallery, the well round a grand
 * staircase), cut straight along the hall's walls; and shafts, a one-way way down from a room into
 * a room right below it.
 */

import type { CellPoint } from '../model';
import { cellsOf, type CellRect, floorRect, intersection } from '../geometry';
import { floorAbove, floorBelow } from '../floors/floorStack';
import { type Rng, chance, int, shuffled } from '../rng';
import { draft } from './catalog';
import type { FloorTerrain } from './floorTerrain';
import { cutHole, dropBelow } from './holes';
import type { RoomCells } from './roomCells';
import { holeAllowed, mayCutIn, openingAbove, reasonsOf } from './typeReasons';
import type { FeatureSpec } from '../themes/features';
import { GALLERY_FLOOR, cutStairWell, mayOpen } from './wells';
import type { TerrainWork } from './work';

/** How often the arena is two floors high, where a room lies over it. */
const GALLERY_CHANCE = 0.85;
/** How often a floor has a shaft down to the next. */
const SHAFT_CHANCE = 0.35;

/** The rectangle and those up to two rows and columns smaller on each side, at least 2 × 2, largest first. */
function shrinks(r: CellRect): CellRect[] {
  const out: CellRect[] = [];
  for (const a of [0, 1, 2]) for (const b of [0, 1, 2]) for (const c of [0, 1, 2]) for (const d of [0, 1, 2]) out.push({ x0: r.x0 + a, x1: r.x1 - b, y0: r.y0 + c, y1: r.y1 - d });
  const area = (s: CellRect): number => (s.x1 - s.x0 + 1) * (s.y1 - s.y0 + 1);
  return out.filter((s) => s.x1 - s.x0 >= 1 && s.y1 - s.y0 >= 1).sort((p, q) => area(q) - area(p));
}

/** A railed hole in a room of the floor above the arena, over the arena's floor: a gallery looking down into it. */
export function galleryOverArena(work: TerrainWork, rng: Rng): void {
  // The boss room lies on the floor farthest from the entrance, the last one planned.
  const farthest = work.floors.length - 1;
  const arena = work.floors[farthest]?.plan.rooms.find((room) => room.boss);
  const top = floorAbove(work.stack, farthest);
  const above = work.floors[top ?? -1];
  // A cave's arena may lie under a fault's chasm, never under a builder's gallery.
  if (!work.theme.definition.built) return;
  if (top === null || !arena || !above || !openingAbove(work, farthest, arena.id, 'gallery') || !chance(rng, GALLERY_CHANCE)) return;
  // The gallery is cut in a room above that may take it: untyped, or a type with a reason for it.
  const cuttable = (id: number): boolean => holeAllowed(work, top, id, 'gallery');
  const candidates = above.plan.rooms
    .filter((room) => room.kind === 'room' && room.wing === 'regular' && !room.rotunda && cuttable(room.id))
    .flatMap((room) => {
      const rc = above.room(room.id);
      const over = intersection(floorRect(room), floorRect(arena));
      return rc && over && over.x1 > over.x0 && over.y1 > over.y0 ? [{ rc, over }] : [];
    })
    .sort((a, b) => cellsOf(b.over).length - cellsOf(a.over).length);
  for (const { rc, over } of candidates) {
    for (const rect of shrinks(over)) {
      const cells = cellsOf(rect);
      if (cells.length > rc.floorCount * (1 - GALLERY_FLOOR) || !rc.allows(cells, 'block')) continue;
      above.place({ ...draft('gallery', rc.room.id, cells), opening: { bottom: farthest, link: work.nextLink() } });
      return;
    }
  }
}

/** How many sides of `r` lie on the walls of the room with floor `hall`: a built opening follows them. */
function sidesOnWalls(r: CellRect, hall: CellRect): number {
  return [r.x0 === hall.x0, r.x1 === hall.x1, r.y0 === hall.y0, r.y1 === hall.y1].filter(Boolean).length;
}

/**
 * Galleries over the halls whose type looks up into one (an `above` gallery reason): with chance
 * `GALLERY_CHANCE` each, where a room of the floor above lies over the hall by 2 × 2 or more, a
 * straight opening there over the hall's floor, as many of its sides on the hall's walls as can be
 * and then the largest, leaving the room above half its floor round a balustrade. Nothing is placed
 * in the hall: the gallery only looks down into it.
 */
export function galleriesOverHalls(work: TerrainWork): void {
  work.floors.forEach((floor, k) => {
    const top = floorAbove(work.stack, k);
    const above = work.floors[top ?? -1];
    if (top === null || !above) return;
    for (const hall of floor.plan.rooms) {
      const typed = work.typed(k, hall.id);
      const reason = typed && !hall.boss ? reasonsOf(typed.spec, work.theme.ruined).find((r) => r.at === 'above' && r.kinds.includes('gallery')) : undefined;
      if (!reason || hall.wing !== 'regular' || hall.rotunda || !chance(work.rng(top, `gallery:${hall.id}`), GALLERY_CHANCE)) continue;
      if (reason.besideStairs) cutStairWell(work, above, k, hall, reason);
      else cutGalleryOver(work, above, k, floorRect(hall), reason);
    }
  });
}

/** The gallery cut in `above` over the hall with floor `hall` on floor `k`, which lies right below it, in a room built to overlook it. */
function cutGalleryOver(work: TerrainWork, above: FloorTerrain, k: number, hall: CellRect, reason: FeatureSpec): void {
  const area = (r: CellRect): number => cellsOf(r).length;
  const places = above.plan.rooms
    .filter((room) => mayOpen(room) && mayCutIn(work, above.index, room.id, reason))
    .flatMap((room) => {
      const rc = above.room(room.id);
      const over = intersection(floorRect(room), hall);
      return rc && over && over.x1 > over.x0 && over.y1 > over.y0 ? shrinks(over).map((rect) => ({ rc, rect })) : [];
    })
    .sort((a, b) => sidesOnWalls(b.rect, hall) - sidesOnWalls(a.rect, hall) || area(b.rect) - area(a.rect));
  for (const { rc, rect } of places) {
    const cells = cellsOf(rect);
    if (cells.length > rc.floorCount * (1 - GALLERY_FLOOR) || cells.some((c) => rc.nearStairs(c)) || !rc.allows(cells, 'block')) continue;
    if (above.place({ ...draft('gallery', rc.room.id, cells, { name: reason.name }), opening: { bottom: k, link: work.nextLink() } }) !== null) return;
  }
}

/** Free places for a shaft of `size` cells square in the room, a cell clear of its walls. */
function shaftSpots(rc: RoomCells, rng: Rng, size: number): CellPoint[][] {
  if (rc.depth < size + 2 || rc.width < size + 2) return [];
  return Array.from({ length: 6 }, () => rc.block(int(rng, 1, rc.depth - size - 1), int(rng, 1, rc.width - size - 1), size, size));
}

/** Now and then a shaft from a room of floor `k` straight down into a room of the floor physically below. */
export function shaftDown(work: TerrainWork, k: number, rng: Rng): void {
  const floor = work.floors[k];
  const below = floorBelow(work.stack, k);
  // A cave's shafts are its pitches, each in a room its type gives one (`caveHazards.ts`).
  if (!floor || work.cave || below === null || !chance(rng, SHAFT_CHANCE)) return;
  const rooms = shuffled(rng, floor.plan.rooms.filter((room) => room.kind === 'room' && room.wing === 'regular' && !room.boss && room.stage === undefined && holeAllowed(work, k, room.id, 'shaft')));
  for (const room of rooms) {
    const rc = floor.room(room.id);
    if (!rc) continue;
    for (const cells of shaftSpots(rc, rng, chance(rng, 0.3) ? 2 : 1)) {
      if (!rc.allows(cells, 'block') || cells.some((c) => rc.nearStairs(c))) continue;
      const drop = dropBelow(work, k, cells, rng, false);
      if (drop?.bottom?.floor === below && cutHole(work, k, rc, 'shaft', cells, drop) !== null) return;
    }
  }
}
