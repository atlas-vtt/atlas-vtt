/**
 * A floor's vegetation, after its water and pieces: climbers along stretches of its walls and
 * round temple columns, plants in patches on its floor and by its water, weeds in its cracks.
 * Green growth follows the light: on the entry floor it is richest in the rooms by the entrances
 * and thins with every door further in; upstairs it has the entry floor's dusk; below ground it is
 * scarce, while moss, fungi, roots and dead creepers grow anywhere. Every room draws from a stream
 * of its own.
 */

import type { CellPoint, DungeonCrack, DungeonRoom } from '../model';
import { GROWTH_KINDS, type DungeonGrowth, type GrowthKind } from '../growthModel';
import { cellKey, holdsCell } from '../geometry';
import { hops, neighbours } from '../roomGraph';
import { chance, floorStream, int, type Rng, weighted } from '../rng';
import type { Flora, Weights } from './flora';
import { type GrowthFloor, GrowthSpace, roomFloorCells } from './growthSpace';
import { outerWallCells } from './outerWalls';
import { wallRuns, type WallRun } from './wallRuns';

export interface GrowthInput extends GrowthFloor {
  seed: number;
  /** The floor's index: 0 is the entry floor, open to the daylight at its entrances. */
  floor: number;
  /** A storey above the entrance floor, lit by windows the map does not draw. */
  aboveGround: boolean;
  cracks: readonly DungeonCrack[];
}

/** How light falls off from an entrance, per door walked. */
const LIGHT_FALL = 2.5;
/** The least light of a room on the entry floor and below it (cracks, shafts, a lamp left burning), and the light of every room upstairs. */
const ENTRY_DUSK = 0.35;
const DEEP_DUSK = 0.12;

/** How much light reaches each room, 0..1. */
export function roomLight(input: Pick<GrowthInput, 'rooms' | 'doors' | 'floor' | 'aboveGround'>): number[] {
  const { rooms, doors, floor } = input;
  if (input.aboveGround) return rooms.map(() => ENTRY_DUSK);
  if (floor > 0) return rooms.map(() => DEEP_DUSK);
  const graph = neighbours(rooms.length, doors);
  const fromEach = doors.flatMap((d) => (d.from === null && d.to !== null ? [hops(graph, d.to)] : []));
  const nearest = rooms.map((_, id) => Math.min(Infinity, ...fromEach.map((h) => h[id] ?? Infinity)));
  return nearest.map((h) => ENTRY_DUSK + (1 - ENTRY_DUSK) * (Number.isFinite(h) ? Math.exp(-h / LIGHT_FALL) : 0));
}

/** A kind by weight, green growth weighed by the light. */
function pickKind(rng: Rng, weights: Weights<GrowthKind>, light: number): GrowthKind {
  return weighted(rng, weights.map(([kind, w]) => [kind, GROWTH_KINDS[kind].needsLight ? w * light : w] as const));
}

/** Up to three stretches of a run, each a cell or more, the rest of the wall bare. */
function stretchesOf(rng: Rng, run: WallRun, rich: boolean): WallRun[] {
  const n = run.points.length;
  if (rich && n <= 24) return chance(rng, 0.7) ? [run] : [slice(run, int(rng, 0, Math.floor(n / 3)), n)];
  const out: WallRun[] = [];
  let at = int(rng, 0, Math.min(8, n - 4));
  while (at < n - 4 && out.length < 3) {
    const len = int(rng, 4, Math.min(rich ? 32 : 14, n - at));
    out.push(slice(run, at, at + len));
    at += len + int(rng, rich ? 2 : 6, rich ? 10 : 20);
  }
  return out;
}

function slice(run: WallRun, a: number, b: number): WallRun {
  return { points: run.points.slice(a, b), cells: run.cells.slice(a, b) };
}

function uniqueCells(cells: readonly CellPoint[]): CellPoint[] {
  const seen = new Map<string, CellPoint>();
  for (const c of cells) seen.set(cellKey(c.x, c.y), c);
  return [...seen.values()];
}

function climbersOf(rng: Rng, input: GrowthInput, room: DungeonRoom, space: GrowthSpace, flora: Flora, light: number): DungeonGrowth[] {
  const out: DungeonGrowth[] = [];
  const outer = flora.ruins ? outerWallCells(room, input.rooms, input.outside) : new Set<string>();
  for (const run of wallRuns(room, input.doors, space)) {
    const wet = run.cells.some((c) => space.byWater(c));
    // A ruin's growth climbs its outer walls, where light and rain come in.
    const ruinWall = flora.ruins && run.cells.length > 0 && run.cells.every((c) => outer.has(cellKey(c.x, c.y)));
    const p = flora.rich ? 0.72 : flora.damp && wet ? 0.6 : ruinWall ? 0.6 : 0;
    if (!chance(rng, p)) continue;
    for (const stretch of stretchesOf(rng, run, flora.rich)) {
      const picked: GrowthKind = flora.rich || ruinWall ? pickKind(rng, flora.climbers, light) : 'moss';
      // Roots and weeds lie on the floor at the wall's foot: never in water, where moss grows instead.
      const kind = (picked === 'roots' || picked === 'grass') && stretch.cells.some((c) => space.isWet(c)) ? 'moss' : picked;
      out.push({ kind, room: room.id, cells: uniqueCells(stretch.cells), wall: stretch.points, density: flora.rich ? 0.5 + 0.5 * rng() : 0.35 + 0.3 * rng() });
    }
  }
  return out;
}

/** A patch of `size` cells grown from `start` over cells `fits` allows. */
function patchFrom(rng: Rng, start: CellPoint, size: number, fits: (c: CellPoint) => boolean): CellPoint[] {
  const cells = [start];
  const seen = new Set([cellKey(start.x, start.y)]);
  while (cells.length < size) {
    const options = cells.flatMap((c) => [{ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 }]).filter((c) => !seen.has(cellKey(c.x, c.y)) && fits(c));
    if (!options.length) break;
    const next = options[Math.floor(rng() * options.length)]!;
    seen.add(cellKey(next.x, next.y));
    cells.push(next);
  }
  return cells;
}

function patchesOf(rng: Rng, room: DungeonRoom, space: GrowthSpace, flora: Flora, light: number): DungeonGrowth[] {
  const floor = roomFloorCells(room);
  const inRoom = new Set(floor.map((c) => cellKey(c.x, c.y)));
  const taken = new Set<string>();
  const fits = (c: CellPoint): boolean => inRoom.has(cellKey(c.x, c.y)) && !taken.has(cellKey(c.x, c.y)) && space.forPlant(c);
  const out: DungeonGrowth[] = [];
  const wallRing = new Set<string>();
  const grow = (kind: GrowthKind, start: CellPoint, size: number, density: number): void => {
    // Moss and fungi spread along the wall's damp foot, never out across the floor.
    const along = kind === 'moss' || kind === 'fungi' ? (c: CellPoint): boolean => fits(c) && (wallRing.has(cellKey(c.x, c.y)) || space.isShore(c)) : fits;
    const cells = patchFrom(rng, start, size, along);
    for (const c of cells) taken.add(cellKey(c.x, c.y));
    out.push({ kind, room: room.id, cells, density });
  };
  // By the water first: moss and ferns along the shore.
  if (flora.damp) {
    const shore = floor.filter((c) => space.isShore(c) && fits(c));
    const count = Math.round(shore.length / (flora.rich ? 4 : 7));
    for (let k = 0; k < count; k++) {
      const pool = shore.filter(fits);
      const start = pool[Math.floor(rng() * pool.length)];
      if (start) grow(pickKind(rng, flora.shore, Math.max(light, 0.5)), start, int(rng, 1, 3), 0.5 + 0.5 * rng());
    }
  }
  if (!flora.rich) return out;
  const count = Math.round((floor.length / 7) * (0.55 + 0.45 * light) * (0.7 + 0.6 * rng()));
  // Along the walls first, where growth gathers, then anywhere.
  const byWall = floor.filter((c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inRoom.has(cellKey(c.x + dx!, c.y + dy!))));
  for (const c of byWall) wallRing.add(cellKey(c.x, c.y));
  for (let k = 0; k < count; k++) {
    const kind = pickKind(rng, flora.patches, light);
    // Moss and fungi keep to the damp foot of the walls; grass and ferns grow anywhere, mostly there too.
    const pool = (kind === 'moss' || kind === 'fungi' || chance(rng, 0.6) ? byWall : floor).filter(fits);
    const start = pool[Math.floor(rng() * pool.length)];
    if (start) grow(kind, start, int(rng, 1, kind === 'moss' ? 4 : 3), 0.4 + 0.6 * rng());
  }
  return out;
}

function columnsOf(rng: Rng, input: GrowthInput, room: DungeonRoom, flora: Flora, light: number): DungeonGrowth[] {
  if (!flora.rich) return [];
  return input.columns.flatMap((column, index): DungeonGrowth[] => {
    const inside = column.x > room.x && column.x < room.x + room.w && column.y > room.y && column.y < room.y + room.h;
    if (!inside || column.shattered || !chance(rng, 0.25 + 0.4 * light)) return [];
    return [{ kind: pickKind(rng, flora.columns, light), room: room.id, cells: [], column: index, density: 0.4 + 0.6 * rng() }];
  });
}

/** Weeds along a crack: its points from where it starts over cells a plant may take, as far as they go on. */
function crackGrowth(rng: Rng, crack: DungeonCrack, rooms: readonly DungeonRoom[], space: GrowthSpace, light: readonly number[]): DungeonGrowth[] {
  const first = crack.points[0];
  const room = first && rooms.find((r) => r.kind === 'room' && first.x >= r.x && first.x <= r.x + r.w && first.y >= r.y && first.y <= r.y + r.h);
  if (!room || !chance(rng, 0.25 + 0.45 * (light[room.id] ?? DEEP_DUSK))) return [];
  const line: CellPoint[] = [];
  for (const p of crack.points) {
    const c = { x: Math.floor(p.x), y: Math.floor(p.y) };
    if (!holdsCell(room, c.x, c.y) || !space.forPlant(c)) break;
    line.push(p);
  }
  if (line.length < 2) return [];
  return [{ kind: 'grass', room: room.id, cells: uniqueCells(line.map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) }))), crack: line, density: 0.4 + 0.6 * rng() }];
}

export function placeGrowth(input: GrowthInput, flora: Flora | null): DungeonGrowth[] {
  if (!flora) return [];
  const space = new GrowthSpace(input);
  const light = roomLight(input);
  const out: DungeonGrowth[] = [];
  for (const room of input.rooms) {
    const rng = floorStream(input.seed, 'growth', input.floor, room.id);
    const l = light[room.id] ?? DEEP_DUSK;
    if (room.kind === 'room' || flora.rich) out.push(...climbersOf(rng, input, room, space, flora, l));
    if (room.kind !== 'room') continue;
    out.push(...patchesOf(rng, room, space, flora, l), ...columnsOf(rng, input, room, flora, l));
  }
  if (flora.cracks) {
    const rng = floorStream(input.seed, 'growth', input.floor, 'cracks');
    for (const crack of input.cracks) out.push(...crackGrowth(rng, crack, input.rooms, space, light));
  }
  return out;
}
