/**
 * The ground a great chamber's interior is laid on, and the few ways it is laid. An interior keeps
 * off every way through its chamber (the cave's lane, the lanes between its doors and stairs, the
 * cells before them and round its stairwells), takes no more than its share of the floor, leaves
 * the chamber whole, and mirrors nothing nature made. Formations are planned with the terrain, on
 * cells taken for them at once, and drawn with the floor's other pieces, so which pieces are drawn
 * never moves the ground.
 */

import { cellKey, floorCellsOf } from '../../geometry';
import type { CellPoint, DungeonProp, PropKind, TerrainKind } from '../../model';
import { type Rng, int } from '../../rng';
import { type DraftOptions, draft } from '../catalog';
import type { FloorTerrain } from '../floorTerrain';
import type { RoomCells } from '../roomCells';
import { laneCells } from '../roomLanes';
import type { TerrainWork } from '../work';

/** How large a chamber's interior is built: a house's is smaller than a hall's, a gargantuan cave's larger. */
export type GreatSize = 'house' | 'hall' | 'gargantuan';

/** The most of a chamber's floor its interior and what stood there before may take: the rest is left to walk. */
const INTERIOR_SHARE = 0.4;

/** A formation planned with the terrain: the prop and the cells taken for it. */
export interface PlannedProp {
  prop: DungeonProp;
  cells: CellPoint[];
}

/** One chamber's interior while it is laid. */
export interface Great {
  work: TerrainWork;
  k: number;
  floor: FloorTerrain;
  rc: RoomCells;
  rng: Rng;
  size: GreatSize;
  /** The cells every way through the chamber keeps, by key. */
  kept: ReadonlySet<string>;
  /** How many more cells the interior may take. */
  left: number;
  /** What the interior has taken so far. */
  own: CellPoint[];
  /** How many pieces and formations the interior has laid. */
  laid: number;
  props: PlannedProp[];
  /** Where the pattern being laid may lie; a second pattern keeps away from the first. */
  region: (c: CellPoint) => boolean;
}

export const STEPS: readonly CellPoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** The chamber's ground for its interior, with its ways worked out as its furnishing will keep them. */
export function greatGround(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, size: GreatSize): Great | null {
  const floor = work.floors[k];
  if (!floor) return null;
  const cells = floorCellsOf(rc.room);
  const kept = new Set([...laneCells(rc), ...rc.needed].map((c) => cellKey(c.x, c.y)));
  for (const c of cells) if (rc.inLane(c) || rc.nearStairs(c) || rc.isKeptClear(c)) kept.add(cellKey(c.x, c.y));
  const taken = cells.filter((c) => rc.isTaken(c)).length;
  const left = Math.floor(rc.floorCount * INTERIOR_SHARE) - taken;
  return { work, k, floor, rc, rng, size, kept, left, own: [], laid: 0, props: [], region: () => true };
}

/** Whether the interior may take `c`: free, off every way, in its pattern's region. */
export function mayTake(g: Great, c: CellPoint): boolean {
  return g.rc.fits([c]) && !g.kept.has(cellKey(c.x, c.y)) && g.region(c);
}

/** The chamber's cells the interior may take now. */
export function openCells(g: Great): CellPoint[] {
  return floorCellsOf(g.rc.room).filter((c) => mayTake(g, c));
}

/** The middle of a set of cells. */
export function middleOf(cells: readonly CellPoint[]): { x: number; y: number } {
  return { x: cells.reduce((s, c) => s + c.x + 0.5, 0) / cells.length, y: cells.reduce((s, c) => s + c.y + 0.5, 0) / cells.length };
}

/** The box round a set of cells: its corner and its size in cells. */
export function floorBox(cells: readonly CellPoint[]): { x: number; y: number; w: number; h: number } {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
}

/** How many steps, kings' moves, lie between `c` and the nearest of `cells`. */
export function reachOf(c: CellPoint, cells: readonly CellPoint[]): number {
  let best = Infinity;
  for (const d of cells) best = Math.min(best, Math.max(Math.abs(c.x - d.x), Math.abs(c.y - d.y)));
  return best;
}

/** Whether every cell lies more than `gap` cells from every cell of `others`: so many free cells lie between. */
export function apart(cells: readonly CellPoint[], others: readonly CellPoint[], gap: number): boolean {
  return cells.every((c) => reachOf(c, others) > gap);
}

/**
 * A ragged piece of up to `most` cells grown from `start` through cells the interior may take and
 * `also` lets in, each new cell drawn at random from those beside the piece: as rock breaks and
 * water gathers, never a rectangle by design.
 */
export function grow(g: Great, start: CellPoint, most: number, also: (c: CellPoint) => boolean = () => true): CellPoint[] {
  if (!mayTake(g, start) || !also(start)) return [];
  const out = [start];
  const seen = new Set([cellKey(start.x, start.y)]);
  const frontier: CellPoint[] = [];
  const border = (c: CellPoint): void => {
    for (const d of STEPS) {
      const n = { x: c.x + d.x, y: c.y + d.y };
      const key = cellKey(n.x, n.y);
      if (seen.has(key)) continue;
      seen.add(key);
      if (mayTake(g, n) && also(n)) frontier.push(n);
    }
  };
  border(start);
  while (out.length < most && frontier.length > 0) {
    const at = Math.floor(g.rng() * frontier.length);
    const next = frontier[at] as CellPoint;
    frontier.splice(at, 1);
    out.push(next);
    border(next);
  }
  return out;
}

/** Lays a piece of `kind` on `cells` where the interior has room for it and nothing of its kind lies mirrored; whether it did. */
export function lay(g: Great, kind: TerrainKind, cells: CellPoint[], options: DraftOptions = {}): boolean {
  if (cells.length === 0 || cells.length > g.left || g.floor.mirrorsAnother(g.rc.room, kind, cells)) return false;
  if (g.floor.place(draft(kind, g.rc.room.id, cells, options)) === null) return false;
  g.left -= cells.length;
  g.own.push(...cells);
  g.laid++;
  return true;
}

/** Lays the largest run of `cells` from their start, down to one, as `kind`; the cells laid. */
export function layLargest(g: Great, kind: TerrainKind, cells: readonly CellPoint[], options: DraftOptions = {}): CellPoint[] {
  for (let n = cells.length; n >= 1; n--) {
    const part = cells.slice(0, n);
    if (lay(g, kind, part, options)) return part;
  }
  return [];
}

/** Whether a formation of `kind` may form on `c`: what the theme knows of the room allows it. */
export function formsAt(g: Great, kind: PropKind, c: CellPoint): boolean {
  return g.work.theme.facts.placeAllowed(kind, c, { floor: g.k, room: g.rc.room.id });
}

/** Whether `cells` could all hold formations of `kind` and leave the chamber whole. */
export function holdsFormations(g: Great, kinds: readonly PropKind[], cells: readonly CellPoint[]): boolean {
  if (cells.length > g.left || !cells.every((c, i) => mayTake(g, c) && formsAt(g, kinds[i] ?? kinds[0]!, c))) return false;
  return g.rc.allows(cells, 'block');
}

/** Takes `c` for a formation of `kind`, to be drawn with the floor's pieces (`furnishInterior`). */
export function reserve(g: Great, kind: PropKind, c: CellPoint): void {
  g.rc.take([c], 'block');
  g.left--;
  g.own.push(c);
  g.laid++;
  const rotation = (int(g.rng, 0, 3) * Math.PI) / 2;
  g.props.push({ prop: { kind, x: c.x + 0.5, y: c.y + 0.5, rotation, scale: 1, room: g.rc.room.id }, cells: [c] });
}

/** Takes `c` for one formation of `kind` if it may form there and the chamber stays whole; whether it did. */
export function reserveOne(g: Great, kind: PropKind, c: CellPoint): boolean {
  if (!holdsFormations(g, [kind], [c])) return false;
  reserve(g, kind, c);
  return true;
}

/** Draws the interior's formations with the floor's other pieces, once its water lies. */
export function furnishInterior(floor: FloorTerrain, props: readonly PlannedProp[]): void {
  if (props.length === 0) return;
  floor.deferPieces(() => {
    for (const { prop, cells } of props) floor.addProp(prop, cells);
  });
}
