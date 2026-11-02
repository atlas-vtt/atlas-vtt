/**
 * Great chambers whose roof came down (Veins of the Earth's boulder hall and breakdown): a hall of
 * fallen blocks with gaps between them a party weaves through, or one wide field of broken rock
 * over the middle with heaps standing in it. Heaps give half cover, the broken rock is difficult
 * ground, and a boulder lies by some heaps.
 */

import { cellKey } from '../../geometry';
import type { CellPoint } from '../../model';
import { chance, int, shuffled } from '../../rng';
import { type Great, type GreatSize, STEPS, apart, grow, lay, layLargest, mayTake, middleOf, openCells, reserveOne } from './greatGround';

/** How many heaps a boulder hall holds, and how many cells each at most. */
const HEAPS: Readonly<Record<GreatSize, readonly [number, number]>> = { house: [3, 4], hall: [5, 7], gargantuan: [7, 10] };
const HEAP_CELLS: Readonly<Record<GreatSize, number>> = { house: 2, hall: 3, gargantuan: 4 };
/** Fields of loose rock spilled beside the heaps, and their cells. */
const SPILLS: Readonly<Record<GreatSize, readonly [number, number]>> = { house: [1, 1], hall: [1, 2], gargantuan: [2, 3] };
const SPILL_CELLS: Readonly<Record<GreatSize, readonly [number, number]>> = { house: [3, 5], hall: [4, 8], gargantuan: [6, 12] };
/** Free cells left between two heaps at least: the gaps of the maze, wide enough to pass in pairs. */
const MAZE_GAP = 2;
/** How often a heap has a boulder beside it. */
const BOULDER_CHANCE = 0.7;
/** How many places a pattern tries before it settles for what it laid: every try asks whether the chamber stays whole. */
const TRIES = 40;

/** The share of the floor a breakdown field covers, at most this many cells. */
const FIELD_SHARE = 0.16;
const FIELD_MOST = 70;
/** The places nearest the middle a field may grow from. */
const SEEDS = 6;
/** Heaps standing in the field, and boulders at its edge. */
const FIELD_HEAPS: Readonly<Record<GreatSize, readonly [number, number]>> = { house: [2, 3], hall: [4, 6], gargantuan: [6, 8] };
const FIELD_BOULDERS: Readonly<Record<GreatSize, readonly [number, number]>> = { house: [1, 2], hall: [2, 3], gargantuan: [3, 4] };

/** A boulder on a free cell beside `heap`, apart from the other clusters; its cell, or null. */
function boulderBeside(g: Great, heap: readonly CellPoint[], others: readonly CellPoint[]): CellPoint | null {
  const beside = heap.flatMap((c) => STEPS.map((d) => ({ x: c.x + d.x, y: c.y + d.y })));
  for (const c of shuffled(g.rng, beside)) {
    if (mayTake(g, c) && apart([c], others, MAZE_GAP) && reserveOne(g, 'boulder', c)) return c;
  }
  return null;
}

/**
 * A boulder hall: heaps of fallen blocks over the chamber, each with free floor at least
 * `MAZE_GAP` cells wide round it, so the ways between them run as a loose maze; a boulder by most
 * heaps and loose rock spilled beside a few.
 */
export function boulderHall(g: Great): void {
  const want = int(g.rng, ...HEAPS[g.size]);
  const clusters: CellPoint[] = [];
  const heaps: CellPoint[][] = [];
  const seeds = shuffled(g.rng, openCells(g).filter((c) => g.rc.clearOfRock(c)));
  let tries = 0;
  for (const seed of seeds) {
    if (heaps.length >= want || tries >= TRIES || g.left < 2) break;
    if (!apart([seed], clusters, MAZE_GAP)) continue;
    tries++;
    const heap = layLargest(g, 'rubble-heap', grow(g, seed, int(g.rng, 1, HEAP_CELLS[g.size]), (c) => apart([c], clusters, MAZE_GAP)));
    if (heap.length === 0) continue;
    const boulder = chance(g.rng, BOULDER_CHANCE) ? boulderBeside(g, heap, clusters) : null;
    heaps.push(heap);
    clusters.push(...heap, ...(boulder ? [boulder] : []));
  }
  const spills = int(g.rng, ...SPILLS[g.size]);
  for (const heap of shuffled(g.rng, heaps).slice(0, spills)) {
    const starts = shuffled(g.rng, heap.flatMap((c) => STEPS.map((d) => ({ x: c.x + d.x, y: c.y + d.y }))).filter((c) => mayTake(g, c)));
    const start = starts[0];
    if (start) layLargest(g, 'rubble-field', grow(g, start, int(g.rng, ...SPILL_CELLS[g.size])));
  }
}

/**
 * A breakdown field: broken rock over the middle of the chamber, ragged as it fell, heaps of the
 * larger blocks standing in it, boulders rolled to its edge.
 */
export function breakdownField(g: Great): void {
  const open = openCells(g);
  if (open.length === 0) return;
  const mid = middleOf(open);
  const distance = (c: CellPoint): number => Math.hypot(c.x + 0.5 - mid.x, c.y + 0.5 - mid.y);
  const size = Math.min(FIELD_MOST, Math.round(g.rc.floorCount * FIELD_SHARE), g.left - 6);
  // The field grows from the middle, or from the nearest place the ways leave it room to spread.
  const seeds = open.filter((c) => g.rc.clearOfRock(c)).sort((a, b) => distance(a) - distance(b)).slice(0, SEEDS);
  const area = seeds.map((seed) => grow(g, seed, size)).reduce<CellPoint[]>((best, a) => (a.length > best.length && best.length < size / 2 ? a : best), []);
  if (area.length < 4) return;
  const heaps: CellPoint[] = [];
  const want = int(g.rng, ...FIELD_HEAPS[g.size]);
  let tries = 0;
  for (const c of shuffled(g.rng, area)) {
    if (heaps.length >= want || tries >= TRIES) break;
    if (!apart([c], heaps, 1)) continue;
    tries++;
    if (lay(g, 'rubble-heap', [c])) heaps.push(c);
  }
  const taken = new Set(heaps.map((c) => cellKey(c.x, c.y)));
  layLargest(g, 'rubble-field', area.filter((c) => !taken.has(cellKey(c.x, c.y))));
  const edge = shuffled(g.rng, area.flatMap((c) => STEPS.map((d) => ({ x: c.x + d.x, y: c.y + d.y }))).filter((c) => mayTake(g, c)));
  const boulders: CellPoint[] = [];
  const most = int(g.rng, ...FIELD_BOULDERS[g.size]);
  for (const c of edge.slice(0, TRIES)) {
    if (boulders.length >= most) break;
    if (apart([c], boulders, 1) && reserveOne(g, 'boulder', c)) boulders.push(c);
  }
}
