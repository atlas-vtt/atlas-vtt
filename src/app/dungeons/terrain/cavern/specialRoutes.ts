/**
 * The special ways between caves (Veins of the Earth's routes a doubles roll gives) laid on the
 * ground behind their door: a sump's water standing in the passage, a traverse's drop along it with
 * a ledge to edge across by, a breakdown's boulders choking it. The passage is the tunnel on the
 * door's far side from its chamber; where the door joins two chambers, or the tunnel has no room for
 * it, the few cells of a chamber nearest the door. Nothing lies on the lane, before a door or by a
 * stairwell, no hole beside water nor water beside a hole, no route's ground as the mirror image of
 * another's, and every room and passage stays whole: the floor's way through is still walked, as
 * every floor's must be.
 */

import { cellKey, doorCells, floorCellsOf } from '../../geometry';
import type { CaveWay, CellPoint, DungeonDoor, DungeonRoom } from '../../model';
import { type Rng, int } from '../../rng';
import { LIVED_IN } from '../../themes/cavern/formations';
import { draft } from '../catalog';
import { leavesRoom } from '../hazards';
import { cutHole, dropBelow } from '../holes';
import type { RoomCells } from '../roomCells';
import type { TerrainWork } from '../work';
import { bankLedge } from './caveLedge';
import { besideHole, besideWater } from './cavePools';
import { mayOpenHole, mirroredBelow } from './verticalExits';

type SpecialRoute = Extract<CaveWay, 'traverse' | 'sump' | 'breakdown'>;

const ROUTES: ReadonlySet<CaveWay> = new Set<SpecialRoute>(['traverse', 'sump', 'breakdown']);

/** How many cells of a long passage a route takes at most, and of a chamber where it falls back on one. */
const MOST_IN_PASSAGE = 4;
const MOST_IN_CHAMBER = 3;
/** A traverse's drop runs a little further along its passage: up to the ledge's length. */
const LONGEST_DROP = 5;
/** A breakdown's boulders lie within this many steps of the door (Manhattan), where they choke it. */
const CHOKE_REACH = 3;

const STEPS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

/** Where a route lays its ground: the room's cells and whether it is a passage (a tunnel) or a chamber. */
interface RouteGround {
  rc: RoomCells;
  passage: boolean;
}

/**
 * The cells of `rc` nearest the door that `may` lets in, as one piece grown from the nearest
 * outwards: at most `most`, each beside one taken before it.
 */
function nearDoor(rc: RoomCells, door: DungeonDoor, most: number, may: (c: CellPoint) => boolean): CellPoint[] {
  const at = doorCells(door);
  const distance = (c: CellPoint): number => Math.min(...at.map((d) => Math.abs(d.x - c.x) + Math.abs(d.y - c.y)));
  const open = floorCellsOf(rc.room).filter((c) => rc.fits([c]) && !rc.inLane(c) && !rc.nearStairs(c) && may(c));
  const left = new Map(open.map((c) => [cellKey(c.x, c.y), c] as const));
  const out: CellPoint[] = [];
  while (out.length < most && left.size > 0) {
    const reachable = out.length === 0 ? [...left.values()] : out.flatMap((c) => STEPS.flatMap((d) => left.get(cellKey(c.x + d.x, c.y + d.y)) ?? []));
    if (reachable.length === 0) break;
    const next = reachable.reduce((best, c) => (distance(c) < distance(best) ? c : best));
    left.delete(cellKey(next.x, next.y));
    out.push(next);
  }
  return out;
}

/** Lays the longest run of `cells` from their start, down to `least` of them, that `lay` takes; whether one was. */
function largestOf(cells: readonly CellPoint[], least: number, lay: (cells: CellPoint[]) => boolean): boolean {
  for (let size = cells.length; size >= least; size--) if (lay(cells.slice(0, size))) return true;
  return false;
}

/**
 * A sump: deep water on the cells nearest the door, all of a short passage, where the way dives
 * under the rock; in a chamber only where nobody lives. A dry cave has none: its sumps are names.
 */
function sump(work: TerrainWork, k: number, ground: RouteGround, door: DungeonDoor, rng: Rng): boolean {
  const floor = work.floors[k];
  const { rc, passage } = ground;
  if (!floor || work.tags.has('dry') || (!passage && LIVED_IN.has(work.typed(k, rc.room.id)?.spec.id ?? ''))) return false;
  if (floor.inRoom(rc.room.id).some((p) => p.traits.hazard === 'lava' || p.traits.hazard === 'acid')) return false;
  const hole = besideHole(floor);
  // A short passage fills whole; a longer one only near the door.
  const reach = nearDoor(rc, door, passage ? Infinity : MOST_IN_CHAMBER, (c) => !hole(c));
  const most = passage && reach.length > MOST_IN_PASSAGE ? int(rng, 2, MOST_IN_PASSAGE) : reach.length;
  // Two sump ways at mirrored places would fill the cells nearest each as the other's mirror image: nature makes no such pair.
  const lay = (cells: CellPoint[]): boolean => (passage || leavesRoom(rc, cells)) && !floor.mirrorsAnother(rc.room, 'deep-water', cells) && floor.place(draft('deep-water', rc.room.id, cells, { name: 'dungeon.terrain.sump' })) !== null;
  return largestOf(reach.slice(0, most), 1, lay);
}

/** Whether every cell of the drop has a cell of the ledge beside it: the ledge runs the drop's whole length. */
function ledgeAlong(drop: readonly CellPoint[], ledge: readonly CellPoint[]): boolean {
  return drop.every((c) => ledge.some((l) => Math.max(Math.abs(l.x - c.x), Math.abs(l.y - c.y)) <= 1));
}

/**
 * A traverse: a drop nearest the door with a ledge a cell wide beside it the whole way, else a drop
 * of a cell or two alone (the way still leads round it); in a chamber clear of its walls. The drop
 * opens onto the floor below, or into the dark where no floor lies below.
 */
function traverse(work: TerrainWork, k: number, ground: RouteGround, door: DungeonDoor, rng: Rng): boolean {
  const floor = work.floors[k];
  const { rc, passage } = ground;
  if (!floor || (!passage && !mayOpenHole(work, k, rc.room))) return false;
  const wet = besideWater(floor);
  const reach = nearDoor(rc, door, passage ? LONGEST_DROP : MOST_IN_CHAMBER, (c) => !wet(c) && (passage || rc.clearOfRock(c)));
  const cut = (cells: CellPoint[], withLedge: boolean): boolean => {
    if (!rc.allows(cells, 'block') || (!passage && !leavesRoom(rc, cells))) return false;
    const bank = withLedge ? bankLedge(rc, rng, cells) : null;
    if (withLedge && (!bank || !ledgeAlong(cells, bank.ledge.cells))) return false;
    if (floor.mirrorsAnother(rc.room, 'chasm', cells)) return false;
    const drop = dropBelow(work, k, cells, rng, false);
    if (!drop || mirroredBelow(work, drop, cells) || cutHole(work, k, rc, 'chasm', cells, drop) === null) return false;
    if (bank && floor.place(bank.ledge) !== null) rc.keepClear(bank.foot);
    return true;
  };
  return largestOf(reach, 2, (cells) => cut(cells, true)) || largestOf(reach.slice(0, 2), 1, (cells) => cut(cells, false));
}

/** A breakdown: a boulder choke on the cells nearest the door, walked over with effort. */
function breakdown(work: TerrainWork, k: number, ground: RouteGround, door: DungeonDoor, rng: Rng): boolean {
  const floor = work.floors[k];
  const { rc, passage } = ground;
  if (!floor) return false;
  const near = (c: CellPoint): boolean => Math.abs(c.x - door.x) + Math.abs(c.y - door.y) <= CHOKE_REACH;
  const reach = nearDoor(rc, door, passage ? MOST_IN_PASSAGE : MOST_IN_CHAMBER, near);
  const most = passage && reach.length > 2 ? int(rng, 2, reach.length) : reach.length;
  return largestOf(reach.slice(0, most), 1, (cells) => floor.place(draft('boulder-choke', rc.room.id, cells)) !== null);
}

const PLACERS: Readonly<Record<SpecialRoute, (work: TerrainWork, k: number, ground: RouteGround, door: DungeonDoor, rng: Rng) => boolean>> = { sump, traverse, breakdown };

const isRoute = (way: CaveWay | undefined): way is SpecialRoute => way !== undefined && ROUTES.has(way);

/** Where the route behind `door` may lie, in order: the passages beside it, then the chambers (the room past the door first in each). */
function groundsOf(work: TerrainWork, k: number, door: DungeonDoor): RouteGround[] {
  const floor = work.floors[k];
  if (!floor || door.from === null || door.to === null) return [];
  const rooms = [door.to, door.from].map((id) => floor.plan.rooms[id]).filter((room): room is DungeonRoom => room !== undefined);
  const passages = rooms.flatMap((room) => floor.passage(room.id) ?? []).map((rc) => ({ rc, passage: true }));
  const chambers = rooms.filter((room) => room.wing === 'regular' && !room.boss && !room.stage).flatMap((room) => floor.room(room.id) ?? []);
  return [...passages, ...chambers.map((rc) => ({ rc, passage: false }))];
}

/** The ground of every special way on floor `k` of a cave, door by door; a way no ground takes stays its name alone. */
export function placeSpecialRoutes(work: TerrainWork, k: number): void {
  const floor = work.floors[k];
  if (!floor || !work.cave) return;
  floor.plan.doors.forEach((door, index) => {
    const { way } = door;
    if (!isRoute(way)) return;
    const rng = work.rng(k, `route:${index}`);
    groundsOf(work, k, door).some((ground) => PLACERS[way](work, k, ground, door, rng));
  });
}
