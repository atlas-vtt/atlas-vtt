/**
 * Which narrow ways can be necks, and what their chambers give up: the rules `holdNecks` holds the
 * rock by, read off the grid before any of it is held. A chamber gives up the two cells beside the
 * one before the door only where it keeps its core and every way through it; one that cannot, or a
 * door whose own row cannot close round it, leaves the way no neck, and it is walked. A pinch of
 * the main path found so gives its lane cell back (`letGo`), which the necks round it must then
 * leave open, so the necks are settled again until none more is found.
 */

import { cellKey, floorRect, inRect } from '../../geometry';
import type { CellPoint, DungeonDoor, DungeonRoom } from '../../model';
import { type CaveGrid, NEAR4, ROCK, unkey } from './caveGrid';
import { stairsJoinRound } from './chambers';

/** A neck's cells by how far they lie along the way from its door (`t`) and across it (`j`, signed). */
export type NeckCell = (t: number, j: number) => CellPoint;

/** A narrow way to be held as a neck: its door, the door's index, its cells, and its pinch where the main path passes it. */
export interface Neck {
  door: DungeonDoor;
  k: number;
  cell: NeckCell;
  pinch: Pinch | undefined;
  /** Its two sides, −1 the door's `from` room, 1 its `to` room. */
  sides: readonly { side: number; room: DungeonRoom | undefined }[];
}

/** A pinch of the main path whose neck is being held: the lane's cells, and the owner number of the pinch's door. */
export interface Pinch {
  lane: ReadonlySet<string>;
  door: number;
}

/**
 * Whether the room may give the cell to its neck: rock, or (through a `pinch`) the room's own lane
 * cell where no other door's open cell lies beside it, as one does beside the cell before the
 * lane's next crossing; never another room's rectangle, a core, a stairwell or the cell before a
 * door.
 */
export function mayGive(grid: CaveGrid, room: DungeonRoom, c: CellPoint, pinch?: Pinch): boolean {
  if (![ROCK, room.id].includes(grid.envelope(c.x, c.y)) || grid.anchored(c.x, c.y)) return false;
  const owner = grid.owner(c.x, c.y);
  if (owner === ROCK) return true;
  if (!pinch || owner !== room.id || !pinch.lane.has(cellKey(c.x, c.y))) return false;
  // A door's cell held as rock (beside another pinch) is rock already.
  return !NEAR4.some(([dx, dy]) => {
    const other = grid.owner(c.x + dx, c.y + dy);
    return other <= -2 && other !== pinch.door && !grid.heldAsRock(c.x + dx, c.y + dy);
  });
}

/** What the necks settled so far do to one chamber: the cells they take from it, and the cells it keeps beside its lane in return. */
interface ChamberPlan {
  gone: Set<string>;
  kept: Set<string>;
}

/**
 * The cells of its rectangle the chamber must keep so that, without `without` and what other necks
 * do to it (`plan`), it still has a 3 × 3 block it may take (where its core will stand),
 * everything it must keep joined round its stairwells (`stairsJoinRound`), and two cells of floor
 * beside each cell it must keep but the neck's own `approach`, which the way joins on; null where
 * it cannot. A cell it must keep (the lane, a cell before another door) that would be left with
 * fewer than two takes the cells beside it the chamber may take, so the lane bends round the neck
 * on floor of its own rather than giving the neck up: a neck never costs a chamber its core, a way
 * through it, or a cell it must keep left as a spur.
 */
function chamberKeeps(grid: CaveGrid, room: DungeonRoom, without: ReadonlySet<string>, approach: CellPoint, plan: ChamberPlan): CellPoint[] | null {
  if (without.size === 0) return [];
  const r = floorRect(room);
  const lost = (x: number, y: number): boolean => without.has(cellKey(x, y)) || plan.gone.has(cellKey(x, y));
  const held = (x: number, y: number): boolean => !lost(x, y) && (grid.holds(x, y, room.id) || plan.kept.has(cellKey(x, y)));
  const may = (x: number, y: number): boolean => held(x, y) || (!lost(x, y) && inRect(r, x, y) && grid.mayClaim(x, y, room.id));
  let block = false;
  for (let y = r.y0; !block && y + 2 <= r.y1; y++) {
    for (let x = r.x0; !block && x + 2 <= r.x1; x++) block = [0, 1, 2].every((dy) => [0, 1, 2].every((dx) => may(x + dx, y + dy)));
  }
  if (!block || !stairsJoinRound(grid, room, { cells: [...without, ...plan.gone], row: [] })) return null;
  const open = (x: number, y: number): boolean => held(x, y) || (grid.owner(x, y) <= -2 && grid.doors[-2 - grid.owner(x, y)]?.kind !== 'secret');
  const required = grid.required(room.id);
  const keeps = new Map<string, CellPoint>();
  for (const k of without) {
    const c = unkey(k);
    for (const [dx, dy] of NEAR4) {
      const n = { x: c.x + dx, y: c.y + dy };
      if ((n.x === approach.x && n.y === approach.y) || !required.has(cellKey(n.x, n.y)) || lost(n.x, n.y)) continue;
      const near = NEAR4.map(([ex, ey]) => ({ x: n.x + ex, y: n.y + ey }));
      const short = 2 - near.filter((m) => open(m.x, m.y) || keeps.has(cellKey(m.x, m.y))).length;
      if (short <= 0) continue;
      const free = near.filter((m) => !open(m.x, m.y) && !keeps.has(cellKey(m.x, m.y)) && may(m.x, m.y));
      if (free.length < short) return null;
      for (const m of free.slice(0, short)) keeps.set(cellKey(m.x, m.y), m);
    }
  }
  return [...keeps.values()];
}

/**
 * The two cells beside the one before the door that a chamber gives up to its neck (those not rock
 * already, nor taken by another neck), and the cells it keeps in return (`chamberKeeps`), or null
 * where it cannot spare both.
 */
function chamberSpares(grid: CaveGrid, room: DungeonRoom, cell: NeckCell, side: number, pinch: Pinch | undefined, plan: ChamberPlan): { gives: CellPoint[]; keeps: CellPoint[] } | null {
  const beside = [-1, 1].map((s) => cell(side, s)).filter((c) => !grid.heldFirmly(c.x, c.y) && !plan.gone.has(cellKey(c.x, c.y)));
  if (!beside.every((c) => !plan.kept.has(cellKey(c.x, c.y)) && mayGive(grid, room, c, pinch))) return null;
  const keeps = chamberKeeps(grid, room, new Set(beside.map((c) => cellKey(c.x, c.y))), cell(side, 0), plan);
  return keeps && { gives: beside, keeps };
}

/** Whether the door's own row closes round it: either cell beside it rock already or rock the neck may hold. */
function rowCloses(grid: CaveGrid, cell: NeckCell): boolean {
  return [-1, 1].every((s) => {
    const c = cell(0, s);
    return grid.heldAsRock(c.x, c.y) || (grid.envelope(c.x, c.y) === ROCK && grid.owner(c.x, c.y) === ROCK);
  });
}

/** Gives back the lane cell `pinchLane` held beside a pinch whose neck cannot be held. */
function letGoPinch(grid: CaveGrid, neck: Neck): void {
  if (!neck.pinch) return;
  for (const s of [-1, 1]) {
    const c = neck.cell(0, s);
    if (grid.owner(c.x, c.y) === neck.pinch.door) grid.letGo(c.x, c.y);
  }
}

/** What a neck that can be held does to the chambers on its sides: the cells they give up to its rock, and the cells each keeps in return, by room. */
export interface NeckPlan {
  gives: CellPoint[];
  keeps: { room: number; cells: CellPoint[] }[];
}

/**
 * The necks that cannot be held, by door index, and what each other one does to its chambers.
 * Every pinch found loose gives its lane cell back at once, and the whole floor is read again,
 * since a neck read before may have counted that cell as rock.
 */
export function settleNecks(grid: CaveGrid, necks: readonly Neck[]): { loose: Set<number>; plans: Map<number, NeckPlan> } {
  const loose = new Set<number>();
  for (;;) {
    const plans = new Map<number, NeckPlan>();
    const chambers = new Map<number, ChamberPlan>();
    const planOf = (id: number): ChamberPlan => chambers.get(id) ?? chambers.set(id, { gone: new Set(), kept: new Set() }).get(id)!;
    let found = false;
    for (const neck of necks) {
      if (loose.has(neck.k)) continue;
      const sides = neck.sides.map(({ side, room }) => (room?.kind === 'room' ? chamberSpares(grid, room, neck.cell, side, neck.pinch, planOf(room.id)) : { gives: [], keeps: [] }));
      if (sides.includes(null) || !rowCloses(grid, neck.cell)) {
        loose.add(neck.k);
        letGoPinch(grid, neck);
        found = true;
        continue;
      }
      const plan: NeckPlan = { gives: [], keeps: [] };
      neck.sides.forEach(({ room }, i) => {
        const spared = sides[i];
        if (room?.kind !== 'room' || !spared) return;
        const chamber = planOf(room.id);
        for (const c of spared.gives) chamber.gone.add(cellKey(c.x, c.y));
        for (const c of spared.keeps) chamber.kept.add(cellKey(c.x, c.y));
        plan.gives.push(...spared.gives);
        plan.keeps.push({ room: room.id, cells: spared.keeps });
      });
      plans.set(neck.k, plan);
    }
    if (!found) return { loose, plans };
  }
}
