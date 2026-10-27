/**
 * What stands in a house's grounds beyond the way in (research §5.1.5–6): outbuildings as empty
 * walled buildings, each with its reason (a carriage house by the service side, off which a service
 * track runs to a gate of its own, a greenhouse on the garden side, the family crypt in the back
 * corner farthest from the service yard), each reached by a walk; a formal walk out of the garden
 * door between a parterre of hedged beds, trees on the lawn, and the lawn round all of it. Every walk
 * runs from a door or gate to a way already laid, which it meets square on (`groundsWays.ts`), so
 * none ends in the lawn.
 */

import { cellKey } from '../../geometry';
import type { CellDir, CellPoint, GroundsPiece, HouseGrounds, OutbuildingUse } from '../../model';
import { type Rng, int } from '../../rng';
import { type Meeting, type Walk, STEPS, across, layWalk, stepOf, walkMeetings } from './groundsWays';
import { BUILDING, LotGrid, TAKEN, WAY } from './groundsGrid';
import { type Box, box, boxCells, inBox } from './houseGrid';
import type { Lot } from './houseLot';
import type { HouseSize } from './houseParams';

/** How many cells the garden walk runs straight out of its door, the door's own included: past the parterre's beds. */
const GARDEN_WALK = 5;

/** What a door on another side than the one facing the house costs, in steps of walk. */
const OTHER_SIDE = 8;

const OUTBUILDINGS: Record<HouseSize, readonly OutbuildingUse[]> = {
  small: [],
  medium: ['carriage-house'],
  large: ['carriage-house', 'greenhouse', 'crypt'],
};

interface Ground {
  lot: Box;
  /** What each cell of the lot holds. */
  grid: LotGrid;
  pieces: GroundsPiece[];
  /** Where a walk may meet the ways laid. */
  meets: Map<string, Meeting>;
}

const free = (g: Ground, c: CellPoint): boolean => g.grid.free(c);

/** A box of `w` × `h` with a cell of free ground all round it, nearest `target`. */
function siteFor(g: Ground, w: number, h: number, target: CellPoint): Box | null {
  // Taken cells counted over the lot once (a summed-area table), so each place is checked in four reads.
  const { x: lx, y: ly, w: lw, h: lh } = g.lot;
  const sums = new Int32Array((lw + 1) * (lh + 1));
  for (let j = 0; j < lh; j++) {
    for (let i = 0; i < lw; i++) {
      const taken = free(g, { x: lx + i, y: ly + j }) ? 0 : 1;
      sums[(j + 1) * (lw + 1) + i + 1] = taken + sums[j * (lw + 1) + i + 1]! + sums[(j + 1) * (lw + 1) + i]! - sums[j * (lw + 1) + i]!;
    }
  }
  const takenIn = (i0: number, j0: number, i1: number, j1: number): number => sums[j1 * (lw + 1) + i1]! - sums[j0 * (lw + 1) + i1]! - sums[j1 * (lw + 1) + i0]! + sums[j0 * (lw + 1) + i0]!;
  let best: Box | null = null;
  let bestDistance = Infinity;
  for (let y = g.lot.y + 1; y + h < g.lot.y + g.lot.h; y++) {
    for (let x = g.lot.x + 1; x + w < g.lot.x + g.lot.w; x++) {
      const site = box(x, y, w, h);
      if (takenIn(x - 1 - lx, y - 1 - ly, x + w + 1 - lx, y + h + 1 - ly) > 0) continue;
      const d = Math.hypot(x + w / 2 - target.x, y + h / 2 - target.y);
      if (d < bestDistance) [best, bestDistance] = [site, d];
    }
  }
  return best;
}

function take(g: Ground, cells: readonly CellPoint[]): void {
  g.grid.mark(cells, TAKEN);
}

interface Start {
  start: CellPoint;
  step: number;
  /** What leaving from here costs on top of the walk: a door on a side less fit for it. */
  bias?: number;
}

/** The cheapest of `starts` walked to the ways, and which start it left from, or null. */
function walkFrom(g: Ground, starts: readonly Start[]): { walk: Walk; from: number } | null {
  // A door whose outside cell lies on a way running past it opens straight onto it.
  const passes = ({ start, step }: Start): boolean => {
    const across = STEPS[(step + 1) % 4]!;
    return g.grid.has(start, WAY) && (g.grid.has({ x: start.x + across.x, y: start.y + across.y }, WAY) || g.grid.has({ x: start.x - across.x, y: start.y - across.y }, WAY));
  };
  const onto = starts.findIndex((start) => !free(g, start.start) && passes(start));
  const open = starts.map((start, k) => ({ ...start, bias: start.bias ?? 0, k })).filter(({ start }) => free(g, start));
  const reached = layWalk({ grid: g.grid, starts: open, meets: g.meets });
  const walked = reached && { walk: reached.walk, from: open[reached.from]!.k };
  if (onto >= 0 && (!walked || (starts[onto]!.bias ?? 0) <= walked.walk.cost + (starts[walked.from]!.bias ?? 0))) return { walk: { cells: [], cost: 0, met: starts[onto]!.start }, from: onto };
  return walked;
}

/** A walk laid (none where a door opens onto a way): its cells taken and become a way that later walks may meet; the cell met and its neighbours are no meetings any more, so no two walks meet side by side. */
function lay(g: Ground, walk: Walk): void {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) g.meets.delete(cellKey(walk.met.x + dx, walk.met.y + dy));
  if (walk.cells.length === 0) return;
  take(g, walk.cells);
  g.grid.mark(walk.cells, WAY);
  walkMeetings(walk.cells, g.meets);
  g.pieces.push({ kind: 'path', cells: walk.cells });
}

/** The garden door at the back of the house: its first outside cell and how many cells wide it is. */
export interface GardenDoor {
  x: number;
  y: number;
  width: number;
}

/**
 * The grounds round a house's ground floor: `house` its cells by key, `around` their bounding box,
 * `east` whether the service side lies east, `garden` the garden door at the back.
 */
export function houseGrounds(rng: Rng, size: HouseSize, lot: Lot, house: ReadonlySet<string>, around: Box, east: boolean, garden: GardenDoor | null): HouseGrounds {
  const g: Ground = { lot: lot.box, grid: new LotGrid(lot.box), pieces: [...lot.pieces], meets: approachMeetings(lot) };
  const cellOf = (key: string): CellPoint => {
    const [x, y] = key.split(',').map(Number) as [number, number];
    return { x, y };
  };
  g.grid.mark([...lot.taken, ...house].map(cellOf), TAKEN);
  g.grid.mark(lot.way, WAY);
  // A cell of ground stays clear round the house, so nothing leans on its walls.
  for (const key of house) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    for (const s of STEPS) if (!house.has(cellKey(x + s.x, y + s.y)) && !g.grid.has({ x: x + s.x, y: y + s.y }, WAY)) g.grid.mark([{ x: x + s.x, y: y + s.y }], TAKEN);
  }
  const serviceX = east ? around.x + around.w + 2 : around.x - 3;
  const sites: { use: OutbuildingUse; site: Box }[] = [];
  let yard: Box | null = null;
  for (const use of OUTBUILDINGS[size]) {
    const target =
      use === 'carriage-house' ? { x: serviceX, y: around.y + around.h }
      : use === 'greenhouse' ? { x: east ? around.x : around.x + around.w, y: around.y - 3 }
      : farCorner(lot.box, yard);
    const [w, h] = use === 'greenhouse' ? [4, 3] : [3, 3];
    const site = siteFor(g, w, h, target);
    if (!site) continue;
    take(g, boxCells(site));
    g.grid.mark(boxCells(site), BUILDING);
    sites.push({ use, site });
    if (use === 'carriage-house') yard = site;
  }
  if (garden && size !== 'small') gardenWalk(g, garden);
  for (const { use, site } of sites) {
    // The door faces the house where a walk can leave it straight; another side's where none can.
    const doors = doorsOf(site, { x: around.x + around.w / 2, y: around.y + around.h / 2 });
    const reached = walkFrom(g, doors.map((door, k) => ({ start: door.outside, step: stepOf({ x: -door.dir.x, y: -door.dir.y }), bias: k === 0 ? 0 : OTHER_SIDE })));
    if (!reached) {
      g.grid.clear(boxCells(site), TAKEN | BUILDING);
      if (use === 'carriage-house') yard = null;
      continue;
    }
    const door = doors[reached.from]!;
    g.pieces.push({ kind: 'outbuilding', cells: boxCells(site), use, door: { x: door.outside.x, y: door.outside.y, dir: door.dir } });
    lay(g, reached.walk);
  }
  if (yard) farthestIsCrypt(g.pieces, yard);
  if (yard && lot.walled) serviceGate(g, yard, east);
  const lawn = boxCells(lot.box).filter((c) => free(g, c));
  trees(rng, g, lawn);
  // The lawn is every cell of the lot nothing else stands on; trees stand on it.
  const built = new Set([...house, ...g.pieces.filter((p) => p.kind !== 'tree').flatMap((p) => p.cells.map((c) => cellKey(c.x, c.y)))]);
  g.pieces.push({ kind: 'garden', cells: boxCells(lot.box).filter((c) => !built.has(cellKey(c.x, c.y))) });
  return { lot: lot.box, pieces: g.pieces };
}

/**
 * Where a walk may meet the way in: square across the straight of the drive or front walk (a cell
 * clear of the porch), and the turning circle only on the line through its fountain across the
 * axis, so a walk meets the circle as a spoke meets a wheel.
 */
function approachMeetings(lot: Lot): Map<string, Meeting> {
  const meets = new Map<string, Meeting>();
  const sweep = lot.sweep;
  const top = Math.min(...lot.way.map((c) => c.y));
  for (const c of lot.way) {
    if (c.y === top || (sweep && inBox(sweep, c.x, c.y))) continue;
    meets.set(cellKey(c.x, c.y), { steps: across({ x: 0, y: 1 }), inside: false });
  }
  if (sweep) {
    const rows = sweep.h % 2 ? [sweep.y + (sweep.h - 1) / 2] : [sweep.y + sweep.h / 2 - 1, sweep.y + sweep.h / 2];
    for (const y of rows) {
      meets.set(cellKey(sweep.x, y), { steps: 1 << stepOf({ x: 1, y: 0 }), inside: false });
      meets.set(cellKey(sweep.x + sweep.w - 1, y), { steps: 1 << stepOf({ x: -1, y: 0 }), inside: false });
    }
  }
  return meets;
}

/**
 * The garden door's walk (the garden front is formal like the entrance): straight out of the door
 * and as wide, between the parterre's beds, then a walk from beside its end round to the ways. Where
 * no walk reaches the ways from there, the garden door opens on the lawn.
 */
function gardenWalk(g: Ground, door: GardenDoor): void {
  const column = (y: number): CellPoint[] => Array.from({ length: door.width }, (_, k) => ({ x: door.x + k, y }));
  const straight: CellPoint[] = [...column(door.y)];
  for (let y = door.y - 1; y > door.y - GARDEN_WALK && column(y).every((c) => free(g, c) && c.y > g.lot.y + 1); y--) straight.push(...column(y));
  const end = straight[straight.length - 1]!.y;
  if (end === door.y) return;
  take(g, straight);
  g.grid.mark(straight, WAY);
  const beds = parterre(g, door);
  const reached = walkFrom(g, [
    { start: { x: door.x - 1, y: end }, step: stepOf({ x: -1, y: 0 }) },
    { start: { x: door.x + door.width, y: end }, step: stepOf({ x: 1, y: 0 }) },
  ]);
  // A walk one cell wide must turn into its connector, so it needs one of at least a cell.
  if (!reached || (door.width === 1 && reached.walk.cells.length === 0)) {
    g.grid.clear([...straight.slice(door.width), ...beds.flat()], TAKEN);
    g.grid.clear(straight, WAY);
    return;
  }
  g.pieces.push(...beds.map((cells): GroundsPiece => ({ kind: 'hedge', cells })));
  // A walk one cell wide turns into the walk from beside its end; a wider one is met by it, and later walks may meet its sides.
  if (door.width === 1) return lay(g, { ...reached.walk, cells: [...straight, ...reached.walk.cells] });
  g.pieces.push({ kind: 'path', cells: straight });
  for (const c of straight) if (c.y < door.y - 1) g.meets.set(cellKey(c.x, c.y), { steps: across({ x: 0, y: 1 }), inside: false });
  lay(g, reached.walk);
}

/** The back corner of the lot farthest from the service yard: where the family crypt stands. */
function farCorner(lot: Box, yard: Box | null): CellPoint {
  const corners = [{ x: lot.x + 2, y: lot.y + 2 }, { x: lot.x + lot.w - 3, y: lot.y + 2 }];
  if (!yard) return corners[0]!;
  return corners.sort((p, q) => Math.hypot(q.x - yard.x, q.y - yard.y) - Math.hypot(p.x - yard.x, p.y - yard.y))[0]!;
}

/** A building's possible doors, in the middle of each side: the side facing `toward` first. Each is its outside cell and the way in. */
function doorsOf(site: Box, toward: CellPoint): { outside: CellPoint; dir: CellDir }[] {
  const cx = site.x + site.w / 2;
  const cy = site.y + site.h / 2;
  const sides: { outside: CellPoint; dir: CellDir; facing: number }[] = STEPS.map((s) => ({
    outside: s.x !== 0 ? { x: s.x > 0 ? site.x + site.w : site.x - 1, y: site.y + Math.floor(site.h / 2) } : { x: site.x + Math.floor(site.w / 2), y: s.y > 0 ? site.y + site.h : site.y - 1 },
    dir: { x: -s.x as CellDir['x'], y: -s.y as CellDir['y'] },
    facing: (s.x * (toward.x - cx)) / site.w + (s.y * (toward.y - cy)) / site.h,
  }));
  return sides.sort((p, q) => q.facing - p.facing).map(({ outside, dir }) => ({ outside, dir }));
}

/**
 * Coal never comes up the main approach (Kerr): a track from a gate of its own in the boundary by the
 * service yard, on its side or before it, to the ways, from whichever place leads there most directly.
 */
function serviceGate(g: Ground, yard: Box, east: boolean): void {
  const wall = g.pieces.find((p) => p.kind === 'boundary-wall' || p.kind === 'hedge');
  if (!wall) return;
  const { lot } = g;
  const side = east ? lot.x + lot.w - 1 : lot.x;
  const bottom = lot.y + lot.h - 1;
  // Places in the side boundary beside the yard, and in the front boundary below it, clear of the lot's corners.
  const inward: CellDir = { x: east ? -1 : 1, y: 0 };
  const up: CellDir = { x: 0, y: -1 };
  const gates: { gate: CellPoint; dir: CellDir }[] = [
    ...Array.from({ length: yard.h + 6 }, (_, k) => yard.y - 3 + k).filter((y) => y > lot.y + 1 && y < bottom - 1).map((y) => ({ gate: { x: side, y }, dir: inward })),
    ...Array.from({ length: yard.w + 6 }, (_, k) => yard.x - 3 + k).filter((x) => x > lot.x + 1 && x < lot.x + lot.w - 2).map((x) => ({ gate: { x, y: bottom }, dir: up })),
  ].filter(({ gate }) => wall.cells.some((c) => c.x === gate.x && c.y === gate.y));
  const reached = walkFrom(g, gates.map(({ gate, dir }) => ({ start: { x: gate.x + dir.x, y: gate.y + dir.y }, step: stepOf(dir) })));
  if (!reached) return;
  const { gate, dir } = gates[reached.from]!;
  wall.cells = wall.cells.filter((c) => !(c.x === gate.x && c.y === gate.y));
  lay(g, reached.walk);
  g.pieces.push({ kind: 'gate', cells: [gate], dir });
}

/** Hedged beds either side of the garden walk, where the ground behind the house allows: their cells, taken. */
function parterre(g: Ground, door: GardenDoor): CellPoint[][] {
  const beds: CellPoint[][] = [];
  for (const side of [-1, 1]) {
    const bed = boxCells(box(side < 0 ? door.x - 4 : door.x + door.width + 1, door.y - 3, 3, 1));
    if (bed.every((c) => free(g, c) && free(g, { x: c.x, y: c.y + 1 }) && free(g, { x: c.x, y: c.y - 1 }))) {
      take(g, bed);
      beds.push(bed);
    }
  }
  return beds;
}

/** Trees on the open lawn, two cells clear of what stands, one to every fifty cells of it. */
function trees(rng: Rng, g: Ground, lawn: readonly CellPoint[]): void {
  const clear = lawn.filter((c) => STEPS.every((s) => free(g, { x: c.x + s.x * 2, y: c.y + s.y * 2 }) && free(g, { x: c.x + s.x, y: c.y + s.y })));
  const count = Math.floor(lawn.length / 50);
  for (let k = 0; k < count && clear.length > 0; k++) {
    const c = clear.splice(int(rng, 0, clear.length - 1), 1)[0]!;
    if (!free(g, c)) continue;
    g.grid.mark([c], TAKEN);
    g.pieces.push({ kind: 'tree', cells: [c], at: { x: c.x + 0.5, y: c.y + 0.5 }, radius: 0.8 + rng() * 0.6 });
  }
}

/** The family crypt is the outbuilding farthest from the service yard: where the greenhouse came to lie farther, the two change uses. */
function farthestIsCrypt(pieces: GroundsPiece[], yard: Box): void {
  const d = (p: GroundsPiece): number => Math.hypot(p.cells[0]!.x - yard.x, p.cells[0]!.y - yard.y);
  const crypt = pieces.find((p) => p.use === 'crypt');
  const far = pieces.filter((p) => p.kind === 'outbuilding' && p.use !== 'carriage-house').sort((p, q) => d(q) - d(p))[0];
  if (crypt && far && far !== crypt) [crypt.use, far.use] = [far.use!, 'crypt'];
}
