/**
 * A great chamber holding standing water (Veins of the Earth's lakes, rimstone cascades and
 * stepped pools): its lake grown as wide as one lake grows, rimstone dams along its shore, and
 * small pools a step down from it, each held back by its own dam. Water stands only in a chamber
 * where it gathers, never beside a hole, and the lake leaves its chamber room to walk and fight.
 */

import { cellKey } from '../../geometry';
import type { CellPoint, DungeonTerrain } from '../../model';
import { int, shuffled } from '../../rng';
import { leavesRoom } from '../hazards';
import { holdsWater } from './caveHazards';
import { MOST_POOL_CELLS, besideHole, naturalPool } from './cavePools';
import { rectangular } from './faultBand';
import { type Great, type GreatSize, STEPS, apart, grow, lay, layLargest, mayTake, reachOf } from './greatGround';
import type { TerrainWork } from '../work';

const LAKE_NAME = 'dungeon.terrain.caveLake';
/** The share of its chamber a lake the chamber did not hold yet fills. */
const NEW_LAKE_SHARE = 0.3;
/** Rimstone dams along the shore, and their cells. */
const DAMS: Readonly<Record<GreatSize, readonly [number, number]>> = { house: [2, 2], hall: [2, 3], gargantuan: [3, 4] };
const DAM_CELLS = [2, 4] as const;
/** Pools a step down from the lake, and their cells. */
const STEP_POOLS: Readonly<Record<GreatSize, readonly [number, number]>> = { house: [1, 1], hall: [1, 2], gargantuan: [2, 3] };
const STEP_POOL_CELLS = [2, 4] as const;
/** The shares of its widening a lake tries, largest first, until one leaves its chamber whole. */
const WIDEN_SHARES = [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1];
/** How many places dams and pools try before the lake settles for what it holds. */
const TRIES = 24;

const isLake = (p: DungeonTerrain): boolean => p.kind === 'deep-water' && p.name === LAKE_NAME;

/** Whether the chamber's lake may grow, or one stand in it: water gathers there, and its lake is already there or the cave keeps its pools still. */
export function mayHoldLake(work: TerrainWork, k: number, room: number): boolean {
  const pieces = work.floors[k]?.inRoom(room) ?? [];
  if (!holdsWater(work, k, room) || pieces.some((p) => p.traits.hazard === 'lava' || p.traits.hazard === 'acid')) return false;
  return pieces.some(isLake) || work.cave?.character?.always === 'still-pools';
}

/** The lake grown out from its shore into free floor, up to one lake's size: the cells added, or none. */
function widen(g: Great, lake: readonly CellPoint[], hole: (c: CellPoint) => boolean): CellPoint[] {
  const most = Math.min(MOST_POOL_CELLS - lake.length, g.left);
  if (most <= 0) return [];
  const seen = new Set(lake.map((c) => cellKey(c.x, c.y)));
  const frontier: CellPoint[] = [];
  const border = (c: CellPoint): void => {
    for (const d of STEPS) {
      const n = { x: c.x + d.x, y: c.y + d.y };
      if (seen.has(cellKey(n.x, n.y))) continue;
      seen.add(cellKey(n.x, n.y));
      if (mayTake(g, n) && !hole(n) && !g.rc.nearStairs(n)) frontier.push(n);
    }
  };
  lake.forEach(border);
  const added: CellPoint[] = [];
  while (added.length < most && frontier.length > 0) {
    const at = Math.floor(g.rng() * frontier.length);
    const next = frontier[at] as CellPoint;
    frontier.splice(at, 1);
    added.push(next);
    border(next);
  }
  // Whether the chamber keeps room for its fight is the costly question: a few sizes, largest first.
  for (const share of WIDEN_SHARES) {
    const part = added.slice(0, Math.floor(added.length * share));
    if (part.length > 0 && !rectangular([...lake, ...part]) && leavesRoom(g.rc, part) && lay(g, 'deep-water', part, { name: LAKE_NAME })) return part;
  }
  return [];
}

/** Rimstone dams on the shore of `water`: short runs of the free cells beside it. */
function dams(g: Great, water: readonly CellPoint[], count: number): void {
  const shore = (c: CellPoint): boolean => reachOf(c, water) === 1;
  const laid: CellPoint[] = [];
  let tries = 0;
  for (const seed of shuffled(g.rng, water.flatMap((c) => STEPS.map((d) => ({ x: c.x + d.x, y: c.y + d.y }))))) {
    if (count <= 0 || tries >= TRIES) break;
    if (!mayTake(g, seed) || !shore(seed) || !apart([seed], laid, 1)) continue;
    tries++;
    const dam = layLargest(g, 'rimstone', grow(g, seed, int(g.rng, ...DAM_CELLS), (c) => shore(c) && apart([c], laid, 1)));
    if (dam.length === 0) continue;
    laid.push(...dam);
    count--;
  }
}

/** Pools a step down from the lake, a free cell from its shore, each with a dam between it and the lake. */
function stepPools(g: Great, lake: readonly CellPoint[], count: number, hole: (c: CellPoint) => boolean): void {
  const pools: CellPoint[] = [];
  const away = (c: CellPoint): boolean => reachOf(c, lake) >= 2 && !hole(c) && !g.rc.nearStairs(c) && apart([c], pools, 2);
  let tries = 0;
  for (const seed of shuffled(g.rng, lake.flatMap((c) => [-2, 2].flatMap((d) => [{ x: c.x + d, y: c.y }, { x: c.x, y: c.y + d }])))) {
    if (count <= 0 || tries >= TRIES) break;
    if (!mayTake(g, seed) || !away(seed)) continue;
    tries++;
    const cells = grow(g, seed, int(g.rng, ...STEP_POOL_CELLS), away);
    if (!leavesRoom(g.rc, cells) || !lay(g, 'deep-water', cells)) continue;
    pools.push(...cells);
    count--;
    const between = cells.flatMap((c) => STEPS.map((d) => ({ x: c.x + d.x, y: c.y + d.y }))).filter((c) => mayTake(g, c) && reachOf(c, lake) === 1);
    const unique = [...new Map(between.map((c) => [cellKey(c.x, c.y), c] as const)).values()];
    if (unique.length > 0) layLargest(g, 'rimstone', unique);
  }
}

/** A lake hall: the chamber's lake grown as wide as a lake grows (or one let in where water gathers), dammed along its shore, with pools stepping down beside it. */
export function lakeHall(g: Great): void {
  const hole = besideHole(g.floor);
  const held = g.floor.inRoom(g.rc.room.id).filter(isLake).flatMap((p) => p.cells);
  let lake = held;
  if (held.length === 0) {
    const cells = naturalPool(g.rc, g.rng, NEW_LAKE_SHARE, (c) => !hole(c) && mayTake(g, c));
    if (!cells || !lay(g, 'deep-water', cells, { name: LAKE_NAME })) return;
    lake = cells;
  }
  lake = [...lake, ...widen(g, lake, hole)];
  stepPools(g, lake, int(g.rng, ...STEP_POOLS[g.size]), hole);
  dams(g, lake, int(g.rng, ...DAMS[g.size]));
}
