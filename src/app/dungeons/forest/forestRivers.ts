import { holdsStairs } from '../geometry';
import type { CellPoint, DungeonFloor, DungeonLake, DungeonRiver, DungeonRoom } from '../model';
import { floorStream, type Rng } from '../rng';
import { lakeOutline } from './lakeShape';
import { COURSE_STEP, riverCourse } from './riverCourse';
import { withIsland } from './riverIslands';
import { confluencesOn, flowWidths, streamInto } from './riverNetwork';
import { normalAt, waterField } from './riverShape';

/**
 * A Forest's water, laid as rivers lie. The main river comes in beyond one edge of the map and
 * leaves beyond the other through one or two of the largest clearings, so it shapes the fight.
 * Each map's river is its own: a brook, a stream, a river or a broad river, barely wandering or
 * meandering hard (`riverCourse`), fed by up to two streams that join it on the map, above which
 * it is the narrower (`riverNetwork`); a wide one may part round an island of gravel
 * (`riverIslands`). Now and then it flows into a lake, which it drains again on the far side or
 * does not. Its only bridges carry the roads over it (`forestRoads`). Pure, deterministic in the
 * seed.
 */

type Vec = CellPoint;

/** How far beyond the rooms a river begins and ends, so it runs off the map's edge. */
const BEYOND = 10;
/** How many courses are tried before a floor goes without water: one that floods stairs or a way down is refused. */
const TRIES = 6;
/** Water keeps this far from stairs and the ways down, in cells. */
const CLEAR = 1;

/** A Forest floor's rivers (the main river first, then the streams that join it) and the lakes they flow into. */
export interface ForestWater {
  rivers: DungeonRiver[];
  lakes: DungeonLake[];
}

interface WaterPlan {
  /** The main river's width where it leaves the map, in cells. */
  width: number;
  /** The swing of the main river's heading at a bend's crossing, in radians. */
  swing: number;
  /** How many streams join it. */
  streams: number;
  /** The chances of an island and of a lake. */
  island: number;
  lake: number;
}

/** The sizes a river may be, as its width where it leaves the map, in cells: a brook, a stream, a river, a broad river. */
const SIZES = [[0.6, 0.9], [0.9, 1.4], [1.4, 2.4], [2.4, 3.4]] as const;
/** How likely each size is: plain, wet and flooded woods. */
const SIZE_ODDS = { plain: [0.3, 0.35, 0.25, 0.1], wet: [0.1, 0.3, 0.4, 0.2], flooded: [0, 0.1, 0.5, 0.4] } as const;
/** How a river may wind: barely, wandering, meandering hard; the swing of its heading and how likely each is. */
const WINDINGS = [{ swing: [0.6, 0.85], odds: 0.3 }, { swing: [0.85, 1.2], odds: 0.45 }, { swing: [1.2, 1.55], odds: 0.25 }] as const;

/** What the tags ask of the water: no river, the usual chance of one, or always one, and of what kind. */
function waterPlan(tags: ReadonlySet<string>, rng: Rng): WaterPlan | null {
  if (tags.has('dry')) return null;
  const flooded = tags.has('flooded');
  const wet = flooded || tags.has('wet');
  if (!wet && rng() > 0.75) return null;
  const [least, most] = SIZES[picked(SIZE_ODDS[flooded ? 'flooded' : wet ? 'wet' : 'plain'], rng)]!;
  const width = least + rng() * (most - least);
  const [calm, wild] = WINDINGS[picked(WINDINGS.map((w) => w.odds), rng)]!.swing;
  const swing = calm + rng() * (wild - calm);
  const streams = (rng() < (wet ? 0.7 : 0.55) ? 1 : 0) + (width >= 0.9 && rng() < (wet ? 0.45 : 0.3) ? 1 : 0);
  return { width, swing, streams, island: wet ? 0.45 : 0.35, lake: flooded ? 0.6 : wet ? 0.45 : 0.3 };
}

/** An index picked by the odds given. */
function picked(odds: readonly number[], rng: Rng): number {
  let roll = rng() * odds.reduce((sum, o) => sum + o, 0);
  for (let i = 0; i < odds.length; i++) {
    roll -= odds[i]!;
    if (roll < 0) return i;
  }
  return odds.length - 1;
}

type RiverFloor = Pick<DungeonFloor, 'rooms' | 'stairs' | 'terrain'>;

export function forestWater(floor: DungeonFloor, seed: number, tags: ReadonlySet<string>): ForestWater {
  const plan = waterPlan(tags, floorStream(seed, 'water', 0, 'river'));
  if (!plan || floor.rooms.length === 0) return { rivers: [], lakes: [] };
  const kept = keptCells(floor);
  for (let k = 0; k < TRIES; k++) {
    const water = course(floor, plan, floorStream(seed, 'water', 0, `river-${k}`));
    const field = waterField(water.rivers, water.lakes);
    if (kept.every((c) => field.distance(c.x, c.y) > CLEAR)) return water;
  }
  return { rivers: [], lakes: [] };
}

/** The middles of the cells no water may cover: stairs and the ways down to the caves. */
function keptCells(floor: RiverFloor): Vec[] {
  const cells: Vec[] = [];
  for (const s of floor.stairs) for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) cells.push({ x: x + 0.5, y: y + 0.5 });
  for (const piece of floor.terrain) if (piece.opening !== undefined) for (const c of piece.cells) cells.push({ x: c.x + 0.5, y: c.y + 0.5 });
  return cells;
}

function course(floor: RiverFloor, plan: WaterPlan, rng: Rng): ForestWater {
  const bounds = boundsOf(floor.rooms);
  const across = bounds.maxX - bounds.minX >= bounds.maxY - bounds.minY;
  const clearings = largest(floor.rooms, floor.stairs).slice(0, 4);
  const through = clearings.filter(() => rng() < 0.6).slice(0, 2);
  if (through.length === 0 && clearings[0]) through.push(clearings[0]);
  through.sort((a, b) => (across ? a.x - b.x : a.y - b.y));
  const ways = through.map((room) => ({ x: room.x + room.w * (0.3 + rng() * 0.4), y: room.y + room.h * (0.3 + rng() * 0.4) }));
  // Small clearings only: the river crosses the woods through the floor's middle.
  if (ways.length === 0) ways.push({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 });
  const first = ways[0]!;
  const last = ways[ways.length - 1]!;
  const start = across ? { x: bounds.minX - BEYOND, y: first.y + (rng() - 0.5) * 10 } : { x: first.x + (rng() - 0.5) * 10, y: bounds.minY - BEYOND };
  const end = across ? { x: bounds.maxX + BEYOND, y: last.y + (rng() - 0.5) * 10 } : { x: last.x + (rng() - 0.5) * 10, y: bounds.maxY + BEYOND };
  let line = riverCourse([start, ...ways, end], plan, rng);
  const lakes: DungeonLake[] = [];
  if (rng() < plan.lake) {
    const lake = lakeOn(line, plan.width, rng);
    lakes.push({ outline: lake.outline });
    // A lake no river drains: the river ends a little way into it.
    if (!lake.drained) line = line.slice(0, lake.mouth);
  }
  const confluences = confluencesOn(line, line.length, plan.streams, rng);
  const main: DungeonRiver = { points: line, widths: flowWidths(line, plan.width, confluences, rng), bridges: [] };
  const streams = confluences.map((c) => streamInto(main, c, plan.swing, bounds, rng)).filter((stream): stream is DungeonRiver => stream !== null);
  // An island where the river is seen, and away from where a stream joins it.
  const joins = streams.map((stream) => stream.points[stream.points.length - 1]!);
  const open = (p: Vec): boolean => p.x > bounds.minX + 2 && p.x < bounds.maxX - 2 && p.y > bounds.minY + 2 && p.y < bounds.maxY - 2 && joins.every((j) => Math.hypot(p.x - j.x, p.y - j.y) > 6);
  return { rivers: [rng() < plan.island ? withIsland(main, open, rng) : main, ...streams], lakes };
}

/** The way a line runs at its point `i`, in radians. */
function headingAt(line: readonly Vec[], i: number): number {
  const n = normalAt(line, i);
  return Math.atan2(-n.x, n.y);
}

/** A lake on the river's lower course, longest the way the river runs; where the river ends in it (`mouth`, a point a little inside) and whether the river flows on out of it. */
function lakeOn(line: readonly Vec[], width: number, rng: Rng): { outline: Vec[]; mouth: number; drained: boolean } {
  const at = Math.floor(line.length * (0.55 + rng() * 0.25));
  const length = (5 + rng() * 5) * (0.75 + width * 0.2);
  const breadth = length * (0.55 + rng() * 0.25);
  // The river reaches the lake's near end at `at`: its middle lies on downstream.
  const centre = line[Math.min(line.length - 1, at + Math.round((length * 0.45) / COURSE_STEP))]!;
  const outline = lakeOutline(centre, headingAt(line, at), length, breadth, rng);
  return { outline, mouth: Math.min(line.length, at + Math.round((width + 1) / COURSE_STEP)), drained: rng() < 0.5 };
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The rooms that hold no stairs, largest first: a river's clearings. */
function largest(rooms: readonly DungeonRoom[], stairs: DungeonFloor['stairs']): DungeonRoom[] {
  return rooms.filter((room) => room.w >= 5 && room.h >= 5 && !holdsStairs(room, stairs)).sort((a, b) => b.w * b.h - a.w * a.h);
}

function boundsOf(rooms: readonly DungeonRoom[]): Bounds {
  return {
    minX: Math.min(...rooms.map((r) => r.x)),
    minY: Math.min(...rooms.map((r) => r.y)),
    maxX: Math.max(...rooms.map((r) => r.x + r.w)),
    maxY: Math.max(...rooms.map((r) => r.y + r.h)),
  };
}
