/**
 * The hazards of a Cavern, each where its geology puts it (the spec's "Every feature has a
 * reason"): a chasm only along a fault crossing its room, deep water only where water gathers, a
 * stream only in a room it runs through, lava only deep down in a lava cave, acid only deep on a
 * fault, a natural shaft only down into a room below. Nothing lies on the lane, and no hole lies
 * within a cell of standing water, nor water within a cell of a hole.
 */

import { floorCellsOf, floorRect, intersection } from '../../geometry';
import type { CaveFault, CellDir, CellPoint, DungeonRoom } from '../../model';
import { type Rng, chance, shuffled, weighted } from '../../rng';
import type { FeatureReason } from '../../themes/features';
import { draft } from '../catalog';
import { type HazardChoice, type Substance, leavesRoom, overRoomBelow } from '../hazards';
import { cutHole, dropBelow } from '../holes';
import type { RoomCells } from '../roomCells';
import type { TerrainWork } from '../work';
import { bankLedge } from './caveLedge';
import { besideHole, besideWater, naturalPool } from './cavePools';
import { crustAround } from './caveTextures';
import { faultBand } from './faultBand';

const LAVA: Substance = { hazard: 'lava', name: 'dungeon.terrain.lavaFlow' };
const ACID: Substance = { hazard: 'acid', name: 'dungeon.terrain.acidPool' };
const STREAM: Substance = { hazard: 'deep-water', name: 'dungeon.terrain.stream' };

/** The share of its room's floor a lake fills, and a sump. */
const LAKE_SHARE = 0.38;
const SUMP_SHARE = 0.25;

function siteOf(work: TerrainWork, k: number): NonNullable<TerrainWork['cave']>['sites'][number] | undefined {
  return work.cave?.sites[k];
}

/** The chain of a stream the room lies in, and the room after it (downhill); null where no stream runs on from it. */
function downstream(work: TerrainWork, k: number, room: number): number | null {
  for (const chain of work.floors[k]?.plan.cave?.streams ?? []) {
    const at = chain.indexOf(room);
    if (at >= 0 && at < chain.length - 1) return chain[at + 1]!;
  }
  return null;
}

/** Whether a room holds standing water: a basin, or one its dam holds. */
function holdsWater(work: TerrainWork, k: number, room: number): boolean {
  const cave = work.floors[k]?.plan.cave;
  return (cave?.basins.includes(room) ?? false) || (cave?.dams.includes(room) ?? false);
}

/** What may run in a channel in this room of a cave: water where a stream runs on, lava deep down with `lava`, acid deep on a fault with `acid`. */
function substancesIn(work: TerrainWork, k: number, room: number): Substance[] {
  const site = siteOf(work, k);
  if (!site) return [];
  const out: Substance[] = [];
  if (downstream(work, k, room) !== null) out.push(STREAM);
  if (work.tags.has('lava') && site.deep(room)) out.push(LAVA);
  if (work.tags.has('acid') && site.deep(room) && site.faultOf(room)) out.push(ACID);
  return out;
}

/** What runs in a channel in this room of a cave; null where nothing may. */
export function caveSubstance(work: TerrainWork, k: number, room: number, rng: Rng): Substance | null {
  const choices = substancesIn(work, k, room);
  return choices.length ? weighted(rng, choices.map((s) => [s, 1] as const)) : null;
}

/** Whether the cave's geology lets a hazard of `kind` lie in the room. */
export function caveHazardRoom(work: TerrainWork, k: number, room: DungeonRoom, kind: HazardChoice): boolean {
  switch (kind) {
    case 'chasm':
      return siteOf(work, k)?.faultOf(room.id) != null;
    case 'deep-water':
      return holdsWater(work, k, room.id);
    case 'channel':
      return substancesIn(work, k, room.id).length > 0;
    case 'pit':
      return true;
  }
}

/** The middle of the room's cells. */
function middleOf(rc: RoomCells): { x: number; y: number } {
  const cells = floorCellsOf(rc.room);
  return { x: cells.reduce((s, c) => s + c.x + 0.5, 0) / cells.length, y: cells.reduce((s, c) => s + c.y + 0.5, 0) / cells.length };
}

/** `line`, then lines beside it up to `reach` cells to either side, in an order the stream gives. */
function besideLine(line: CaveFault, rng: Rng, reach: number): CaveFault[] {
  const [nx, ny] = [-Math.sin(line.angle), Math.cos(line.angle)];
  const shifts = Array.from({ length: reach }, (_, d) => [-(d + 1), d + 1]).flat();
  return [0, ...shuffled(rng, shifts)].map((d) => ({ x: line.x + nx * d, y: line.y + ny * d, angle: line.angle }));
}

/** Lines through the room at `angle`: through its middle, then a cell or two to either side. */
function linesAcross(rc: RoomCells, rng: Rng, angle: number): CaveFault[] {
  return besideLine({ ...middleOf(rc), angle }, rng, 2);
}

/** The step of a cell grid nearest a direction. */
function snapped(angle: number): CellDir {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  return Math.abs(x) >= Math.abs(y) ? { x: Math.sign(x) as -1 | 1, y: 0 } : { x: 0, y: Math.sign(y) as -1 | 1 };
}

/** A chasm along the room's fault, opening onto the floor below where one lies there (`below`: only then). */
export function faultChasm(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, below = false): boolean {
  const fault = siteOf(work, k)?.faultOf(rc.room.id);
  const floor = work.floors[k];
  if (!fault || !floor || (below && k + 1 >= work.floors.length)) return false;
  const under = work.floors[k + 1];
  const wet = besideWater(floor);
  const thicknesses: (1 | 2)[] = rc.floorCount >= 40 && chance(rng, 0.5) ? [2, 1] : [1];
  for (const thickness of thicknesses) {
    // Over one room below only: the band keeps to the stretch above the room it lies over most.
    const rooms = under?.plan.rooms.filter((room) => room.kind === 'room' && room.wing === 'regular' && intersection(floorRect(room), floorRect(rc.room)) !== null) ?? [];
    const overs = under ? rooms.map((room) => (c: CellPoint): boolean => under.room(room.id)?.isFloor(c) === true) : [() => true];
    for (const over of overs) for (const line of besideLine(fault, rng, 2)) {
      const cells = faultBand(rc, rng, line, thickness, (c) => over(c) && !wet(c) && rc.clearOfRock(c));
      if (!cells || !leavesRoom(rc, cells) || !overRoomBelow(work, k, cells)) continue;
      const drop = dropBelow(work, k, cells, rng);
      if (!drop || (below && drop.bottom === null && drop.through.length === 0)) continue;
      if (cutHole(work, k, rc, 'chasm', cells, drop) !== null) return true;
    }
  }
  return false;
}

/** A natural shaft, a cell or three in an L, a cell clear of the walls, straight down into a room of the floor below. */
function pitchShaft(work: TerrainWork, k: number, rc: RoomCells, rng: Rng): boolean {
  const floor = work.floors[k];
  if (!floor || k + 1 >= work.floors.length || rc.depth < 3 || rc.width < 3) return false;
  const shapes: CellPoint[][] = [];
  for (let i = 1; i < rc.depth - 1; i++) for (let j = 1; j < rc.width - 1; j++) {
    shapes.push([rc.cell(i, j)]);
    if (i + 1 < rc.depth - 1 && j + 1 < rc.width - 1) shapes.push([rc.cell(i, j), rc.cell(i + 1, j), rc.cell(i, j + 1)]);
  }
  const wet = besideWater(floor);
  return shuffled(rng, shapes).slice(0, 24).some((cells) => {
    if (!rc.allows(cells, 'block') || cells.some((c) => rc.nearStairs(c) || wet(c) || !rc.clearOfRock(c))) return false;
    const drop = dropBelow(work, k, cells, rng, false);
    return drop?.bottom?.floor === k + 1 && cutHole(work, k, rc, 'shaft', cells, drop) !== null;
  });
}

/** Deep water filling a share of the room, grown out from its middle, away from holes. */
function standingWater(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, share: number, name: string): boolean {
  const floor = work.floors[k];
  if (!floor) return false;
  const hole = besideHole(floor);
  const cells = naturalPool(rc, rng, share, (c) => !hole(c));
  return cells !== null && floor.place(draft('deep-water', rc.room.id, cells, { name })) !== null;
}

/** A channel of `what` along `line`, flowing along it; its cells, or null. */
function channelAlong(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, line: CaveFault, what: Substance): CellPoint[] | null {
  const floor = work.floors[k];
  if (!floor) return null;
  const near = what.hazard === 'deep-water' ? besideHole(floor) : besideWater(floor);
  const cells = faultBand(rc, rng, line, 1, (c) => !near(c));
  if (!cells || !leavesRoom(rc, cells)) return null;
  return floor.place(draft('channel', rc.room.id, cells, { name: what.name, traits: { hazard: what.hazard }, facing: snapped(line.angle) })) !== null ? cells : null;
}

/** A stream through the room towards the room it runs on to, downhill. */
function stream(work: TerrainWork, k: number, rc: RoomCells, rng: Rng): boolean {
  const next = downstream(work, k, rc.room.id);
  const to = next === null ? undefined : work.floors[k]?.plan.rooms[next];
  if (!to) return false;
  const from = middleOf(rc);
  const angle = Math.atan2(to.y + to.h / 2 - from.y, to.x + to.w / 2 - from.x);
  return linesAcross(rc, rng, angle).some((line) => channelAlong(work, k, rc, rng, line, STREAM) !== null);
}

/** Lava down the room's length, with a ledge along its bank to fight from; refused where no ledge fits. */
function lavaFlow(work: TerrainWork, k: number, rc: RoomCells, rng: Rng): boolean {
  const floor = work.floors[k];
  if (!floor || !substancesIn(work, k, rc.room.id).includes(LAVA)) return false;
  const wet = besideWater(floor);
  // Down the tube's length, beside the way through it.
  const angle = rc.room.w >= rc.room.h ? 0 : Math.PI / 2;
  return linesAcross(rc, rng, angle).some((line) => {
    const cells = faultBand(rc, rng, line, 1, (c) => !wet(c));
    const bank = cells && leavesRoom(rc, cells) ? bankLedge(rc, rng, cells) : null;
    if (!cells || !bank || floor.place(draft('channel', rc.room.id, cells, { name: LAVA.name, traits: { hazard: 'lava' }, facing: snapped(angle) })) === null) return false;
    floor.place(bank.ledge);
    rc.keepClear(bank.foot);
    return true;
  });
}

/** Acid rising along the fault, ringed by its crust. */
function sulphurSpring(work: TerrainWork, k: number, rc: RoomCells, rng: Rng): boolean {
  const fault = siteOf(work, k)?.faultOf(rc.room.id);
  const floor = work.floors[k];
  if (!fault || !floor || !substancesIn(work, k, rc.room.id).includes(ACID)) return false;
  // A channel along the fault, else a pool where it crosses the room.
  let cells: CellPoint[] | null = null;
  for (const line of besideLine(fault, rng, 1)) cells ??= channelAlong(work, k, rc, rng, line, ACID);
  if (!cells) {
    const wet = besideWater(floor);
    const onFault = (c: CellPoint): boolean => Math.abs((c.x + 0.5 - fault.x) * Math.sin(fault.angle) - (c.y + 0.5 - fault.y) * Math.cos(fault.angle)) <= 2.5;
    const pool = naturalPool(rc, rng, SUMP_SHARE, (c) => onFault(c) && !wet(c));
    cells = pool && floor.place(draft('deep-water', rc.room.id, pool, { name: ACID.name, traits: { hazard: 'acid' } })) !== null ? pool : null;
  }
  if (!cells) return false;
  crustAround(floor, rc, cells);
  return true;
}

/** The hazard a cave's reason lays in the room; whether it did. */
export function placeCaveReason(work: TerrainWork, k: number, rc: RoomCells, reason: FeatureReason, rng: Rng): boolean {
  switch (reason) {
    case 'fault-chasm':
      return faultChasm(work, k, rc, rng);
    case 'sinkhole':
      return faultChasm(work, k, rc, rng, true);
    case 'pitch':
      return pitchShaft(work, k, rc, rng);
    case 'cave-lake':
      return holdsWater(work, k, rc.room.id) && standingWater(work, k, rc, rng, LAKE_SHARE, 'dungeon.terrain.caveLake');
    case 'sump':
      return holdsWater(work, k, rc.room.id) && standingWater(work, k, rc, rng, SUMP_SHARE, 'dungeon.terrain.sump');
    case 'cave-stream':
      return stream(work, k, rc, rng);
    case 'lava-flow':
      return lavaFlow(work, k, rc, rng);
    case 'sulphur-spring':
      return sulphurSpring(work, k, rc, rng);
    default:
      return false;
  }
}

/**
 * One hazard of `choice` in a cave's room (an arena's), else another of `only` its geology lets
 * lie there: a chasm along its fault, its lake, lava, acid or a stream; false where none does.
 */
export function placeCaveHazard(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, choice: HazardChoice, only: readonly HazardChoice[]): boolean {
  const order = [choice, ...only.filter((c) => c !== choice)].filter((c) => caveHazardRoom(work, k, rc.room, c));
  return order.some((c) => {
    switch (c) {
      case 'chasm':
        return faultChasm(work, k, rc, rng);
      case 'deep-water':
        return standingWater(work, k, rc, rng, LAKE_SHARE, 'dungeon.terrain.caveLake');
      case 'channel': {
        const what = caveSubstance(work, k, rc.room.id, rng);
        if (what === LAVA) return lavaFlow(work, k, rc, rng);
        if (what === ACID) return sulphurSpring(work, k, rc, rng);
        return what === STREAM && stream(work, k, rc, rng);
      }
      case 'pit':
        return false;
    }
  });
}
