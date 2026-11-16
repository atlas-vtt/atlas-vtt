/**
 * A cave's chasms, as wide as their chamber makes them: Veins of the Earth's great caves gape, so
 * a fault opens a crack a cell or two across in a room and three to six in a gargantuan cave. A
 * chasm runs along its room's fault, its rims meeting as the rock split; where it would cut the room
 * in two a rock bridge one or two cells wide spans it. A hall or gargantuan chamber built round its
 * chasm (a chasm hall, a collapse) may instead end at an abyss along one side (`abyssEdge`).
 */

import { floorCellsOf, floorRect, intersection } from '../../geometry';
import type { CaveFault, CaveSizeTier, CellPoint } from '../../model';
import { type Rng, chance, int, shuffled } from '../../rng';
import { draft } from '../catalog';
import { leavesRoom, overRoomBelow } from '../hazards';
import { cutHole, dropBelow } from '../holes';
import type { RoomCells } from '../roomCells';
import type { TerrainWork } from '../work';
import { abyssEdge } from './abyssEdge';
import { besideWater } from './cavePools';
import { faultBand } from './faultBand';

/** How wide a chasm opens in a chamber of each size, in cells, at least and at most. */
const CHASM_WIDTH: Readonly<Record<CaveSizeTier, readonly [number, number]>> = {
  junction: [1, 1],
  room: [1, 2],
  double: [1, 2],
  triple: [2, 3],
  quadruple: [2, 3],
  house: [2, 4],
  hall: [2, 4],
  gargantuan: [3, 6],
};

/** How many cells long a chasm runs at least, for each cell of its width: a wide one that only clips a corner of its chamber is no gaping chasm. */
const LEAST_RUN = 3;
/** How far beside its fault a crack may open, in cells, beyond half its width: a fault is a zone of broken rock, not a line. */
const FAULT_ZONE = 2;

/** The room types built round their chasm, which in a great chamber may end at an abyss instead, and how often they do. */
const ABYSS_TYPES: ReadonlySet<string> = new Set(['chasm-hall', 'collapse-chamber']);
const ABYSS_TIERS: ReadonlySet<CaveSizeTier> = new Set(['hall', 'gargantuan']);
const ABYSS_CHANCE = 0.5;

/** The widths to try, widest first: one rolled within the chamber's range, then narrower down to a single cell, so a chamber the wide one does not fit still keeps its chasm. */
function chasmWidths(tier: CaveSizeTier | undefined, rng: Rng): number[] {
  const [least, most] = CHASM_WIDTH[tier ?? 'room'];
  const first = int(rng, least, most);
  return Array.from({ length: first }, (_, k) => first - k);
}

/** Lines along the fault through the room for a chasm `thickness` wide: within its zone, those nearest the room's middle first. */
function crackLines(rc: RoomCells, fault: CaveFault, rng: Rng, thickness: number): CaveFault[] {
  const cells = floorCellsOf(rc.room);
  const mx = cells.reduce((s, c) => s + c.x + 0.5, 0) / cells.length;
  const my = cells.reduce((s, c) => s + c.y + 0.5, 0) / cells.length;
  const aside = (l: CaveFault): number => Math.abs((mx - l.x) * Math.sin(l.angle) - (my - l.y) * Math.cos(l.angle));
  return besideLine(fault, rng, FAULT_ZONE + Math.floor(thickness / 2)).sort((a, b) => aside(a) - aside(b)).slice(0, 5);
}

/** `line`, then lines beside it up to `reach` cells to either side, in an order the stream gives. */
export function besideLine(line: CaveFault, rng: Rng, reach: number): CaveFault[] {
  const [nx, ny] = [-Math.sin(line.angle), Math.cos(line.angle)];
  const shifts = Array.from({ length: reach }, (_, d) => [-(d + 1), d + 1]).flat();
  return [0, ...shuffled(rng, shifts)].map((d) => ({ x: line.x + nx * d, y: line.y + ny * d, angle: line.angle }));
}

/** A chasm along the room's fault, as wide as its chamber makes it, opening onto the floor below where one lies there (`below`: only then). */
export function faultChasm(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, below = false): boolean {
  const fault = work.cave?.sites[k]?.faultOf(rc.room.id);
  const floor = work.floors[k];
  if (!fault || !floor || (below && k + 1 >= work.floors.length)) return false;
  const under = work.floors[k + 1];
  const wet = besideWater(floor);
  // Over one room below only: the band keeps to the stretch above the room it lies over most.
  const rooms = under?.plan.rooms.filter((room) => room.kind === 'room' && room.wing === 'regular' && intersection(floorRect(room), floorRect(rc.room)) !== null) ?? [];
  const overs = under ? rooms.map((room) => (c: CellPoint): boolean => under.room(room.id)?.isFloor(c) === true) : [() => true];
  for (const thickness of chasmWidths(rc.room.tier, rng)) {
    for (const over of overs) for (const line of crackLines(rc, fault, rng, thickness)) {
      const band = faultBand(rc, rng, line, thickness, (c) => over(c) && !wet(c) && rc.clearOfRock(c));
      const bridge = band?.bridge;
      if (!band || band.cells.length < thickness * LEAST_RUN || !leavesRoom(rc, band.cells, bridge?.cells) || !overRoomBelow(work, k, band.cells)) continue;
      const drop = dropBelow(work, k, band.cells, rng);
      if (!drop || (below && drop.bottom === null && drop.through.length === 0)) continue;
      const id = cutHole(work, k, rc, 'chasm', band.cells, drop, bridge ? { bridge: bridge.cells } : {});
      if (id === null) continue;
      if (bridge) {
        floor.addBridge(draft('bridge', rc.room.id, bridge.cells, { facing: bridge.facing }), id);
        rc.keepClear(bridge.landings);
      }
      return true;
    }
  }
  return false;
}

/** The chasm a cave's reason cuts in the room: in a great chasm hall or collapse, half the time an abyss along one side, else a chasm along its fault. */
export function caveChasm(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, below = false): boolean {
  const type = work.typed(k, rc.room.id)?.spec.id ?? '';
  const edge = ABYSS_TYPES.has(type) && rc.room.tier !== undefined && ABYSS_TIERS.has(rc.room.tier) && chance(rng, ABYSS_CHANCE);
  return (edge && abyssEdge(work, k, rc, rng, { below }) !== null) || faultChasm(work, k, rc, rng, below);
}
