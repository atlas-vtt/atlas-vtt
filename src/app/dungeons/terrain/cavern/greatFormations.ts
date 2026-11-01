/**
 * Great chambers dripping water built (Veins of the Earth's columned halls, stalagmite fields and
 * the ring of a chamber round its cluster of giant stalagmites): rock columns standing on a loose
 * grid, a band of stalagmites over one half with an aisle through it, or a cluster in the middle
 * with free floor all round. A column is where a stalagmite met the roof, so every column stands
 * by one. Only where the theme lets formations form: never in water, in a lava tube or by acid.
 */

import type { CellPoint } from '../../model';
import { type Rng, chance, int, shuffled } from '../../rng';
import { type Great, type GreatSize, STEPS, apart, floorBox, formsAt, holdsFormations, mayTake, middleOf, openCells, reachOf, reserve, reserveOne } from './greatGround';

/** How many columns a columned hall holds; never two closer than `COLUMN_GAP` free cells. */
const COLUMNS: Readonly<Record<GreatSize, readonly [number, number]>> = { house: [2, 3], hall: [4, 6], gargantuan: [6, 9] };
const COLUMN_GAP = 2;
/** How often a column has a second stalagmite at its foot. */
const SECOND_FOOT: Readonly<Record<GreatSize, number>> = { house: 0, hall: 0.35, gargantuan: 0.7 };

/** Stalagmites in a forest's band, and columns among them. */
const FOREST: Readonly<Record<GreatSize, readonly [number, number]>> = { house: [6, 8], hall: [10, 14], gargantuan: [16, 22] };
const FOREST_COLUMNS: Readonly<Record<GreatSize, readonly [number, number]>> = { house: [0, 1], hall: [1, 2], gargantuan: [2, 3] };
/** Cells either side of the aisle's middle that stay free. */
const AISLE = 1;

/** A ring chamber's cluster: how far from its middle it reaches, and how many formations at most. */
const RING: Readonly<Record<GreatSize, { radius: number; most: number }>> = { house: { radius: 1.6, most: 6 }, hall: { radius: 2.3, most: 10 }, gargantuan: { radius: 3.2, most: 16 } };
/** Free floor wanted between the cluster and every way through the chamber; at least a cell is always left. */
const RING_CLEAR = 2;
/** How often a cell of the cluster holds a formation, and how often that is a column. */
const RING_FILL = 0.7;
const RING_COLUMNS = 0.35;

/** A stalagmite this close to a column (cells between middles) counts as its foot. */
const FOOT_REACH = 2.5;

/** The cells beside `c`, kings' moves, in a shuffled order. */
function around(rng: Rng, c: CellPoint): CellPoint[] {
  const out: CellPoint[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx !== 0 || dy !== 0) out.push({ x: c.x + dx, y: c.y + dy });
  return shuffled(rng, out);
}

/** A column on `c` with a stalagmite at its foot, both or neither; whether they stood. */
function columnWithFoot(g: Great, c: CellPoint): boolean {
  if (!formsAt(g, 'column-formation', c)) return false;
  const foot = around(g.rng, c).find((s) => holdsFormations(g, ['column-formation', 'stalagmites'], [c, s]));
  if (!foot) return false;
  reserve(g, 'column-formation', c);
  reserve(g, 'stalagmites', foot);
  if (chance(g.rng, SECOND_FOOT[g.size])) around(g.rng, c).some((s) => reserveOne(g, 'stalagmites', s));
  return true;
}

/**
 * A columned hall: rock columns on a loose grid over the chamber, each moved off its point a
 * little, none within a cell of the walls or within `COLUMN_GAP` cells of another.
 */
export function rockColumns(g: Great): void {
  const open = openCells(g).filter((c) => g.rc.clearOfRock(c));
  if (open.length === 0) return;
  const want = int(g.rng, ...COLUMNS[g.size]);
  const box = floorBox(open);
  const across = Math.max(1, Math.round(Math.sqrt((want * box.w) / box.h)));
  const down = Math.ceil(want / across);
  const sx = box.w / across;
  const sy = box.h / down;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < down; i++) for (let j = 0; j < across; j++) points.push({ x: box.x + (j + 0.5 + (g.rng() - 0.5) * 0.6) * sx, y: box.y + (i + 0.5 + (g.rng() - 0.5) * 0.6) * sy });
  const columns: CellPoint[] = [];
  for (const p of shuffled(g.rng, points)) {
    if (columns.length >= want) break;
    const near = open
      .filter((c) => Math.abs(c.x + 0.5 - p.x) <= sx / 2 && Math.abs(c.y + 0.5 - p.y) <= sy / 2 && apart([c], columns, COLUMN_GAP) && mayTake(g, c))
      .sort((a, b) => Math.hypot(a.x + 0.5 - p.x, a.y + 0.5 - p.y) - Math.hypot(b.x + 0.5 - p.x, b.y + 0.5 - p.y));
    const at = near.slice(0, 4).find((c) => columnWithFoot(g, c));
    if (at) columns.push(at);
  }
}

/**
 * A stalagmite forest: a dense band over one half of the chamber, the formations a cell apart, an
 * aisle left free through it from the middle to the far wall, and a few columns among them.
 */
export function stalagmiteForest(g: Great): void {
  const open = openCells(g);
  if (open.length === 0) return;
  const box = floorBox(open);
  const mid = middleOf(open);
  const alongX = box.w >= box.h;
  const side = chance(g.rng, 0.5) ? 1 : -1;
  const aisle = (alongX ? mid.y : mid.x) + int(g.rng, -2, 2);
  const inBand = (c: CellPoint): boolean => {
    const along = alongX ? c.x + 0.5 - mid.x : c.y + 0.5 - mid.y;
    const across = alongX ? c.y + 0.5 : c.x + 0.5;
    return along * side > 0 && Math.abs(across - aisle) > AISLE + 0.5;
  };
  const band = shuffled(g.rng, open.filter(inBand));
  const want = int(g.rng, ...FOREST[g.size]);
  const placed: CellPoint[] = [];
  let tries = 0;
  for (const c of band) {
    if (placed.length >= want || tries >= want * 3) break;
    if (!apart([c], placed, 1)) continue;
    tries++;
    if (reserveOne(g, 'stalagmites', c)) placed.push(c);
  }
  const columns: CellPoint[] = [];
  const most = int(g.rng, ...FOREST_COLUMNS[g.size]);
  for (const s of shuffled(g.rng, placed)) {
    if (columns.length >= most) break;
    const at = STEPS.map((d) => ({ x: s.x + d.x, y: s.y + d.y })).find((c) => inBand(c) && apart([c], columns, COLUMN_GAP) && formsAt(g, 'column-formation', c) && reserveOne(g, 'column-formation', c));
    if (at) columns.push(at);
  }
}

/**
 * A ring chamber: a cluster of stalagmites and columns packed round the chamber's middle, where
 * no way runs within `RING_CLEAR` cells, so the floor round it is free all the way round.
 */
export function ringCluster(g: Great): void {
  const open = openCells(g).filter((c) => g.rc.clearOfRock(c));
  if (open.length === 0) return;
  const { radius, most } = RING[g.size];
  const ways = [...g.kept].map((key) => key.split(',').map(Number) as [number, number]).map(([x, y]) => ({ x, y }));
  const clear = (c: CellPoint): number => Math.min(reachOf(c, ways), radius + RING_CLEAR + 1);
  const mid = middleOf(open);
  const score = (c: CellPoint): number => 2 * clear(c) - Math.hypot(c.x + 0.5 - mid.x, c.y + 0.5 - mid.y);
  const centre = open.reduce((best, c) => (score(c) > score(best) ? c : best), open[0]!);
  const distance = (c: CellPoint): number => Math.hypot(c.x - centre.x, c.y - centre.y);
  // Where the ways leave less room round the middle, the ring of free floor narrows to a cell.
  const ring = Math.max(1, Math.min(RING_CLEAR, clear(centre) - 1));
  const cluster = open.filter((c) => distance(c) <= radius && reachOf(c, ways) > ring).sort((a, b) => distance(a) - distance(b));
  const feet: CellPoint[] = [];
  let laid = 0;
  for (const [n, c] of cluster.entries()) {
    if (laid >= most) break;
    if (n >= 3 && !chance(g.rng, RING_FILL)) continue;
    const footed = feet.some((s) => Math.hypot(s.x - c.x, s.y - c.y) <= FOOT_REACH);
    const column = footed && chance(g.rng, RING_COLUMNS) && formsAt(g, 'column-formation', c);
    if (!reserveOne(g, column ? 'column-formation' : 'stalagmites', c)) continue;
    if (!column) feet.push(c);
    laid++;
  }
}
