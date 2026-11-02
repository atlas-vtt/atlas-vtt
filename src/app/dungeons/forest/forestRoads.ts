import { cellKey, doorCells, floorCellsOf } from '../geometry';
import type { CellPoint, DungeonDoor, DungeonFloor, DungeonRiver, DungeonRiverBridge, DungeonRoad } from '../model';
import { pointInPolygon, type Bounds } from '../render/geometry';
import { floorStream, type Rng } from '../rng';
import type { ForestWater } from './forestRivers';
import { lineField, type LineField } from './lineField';
import { wayCentre, wayOutsOf, wayPoint, type WayOut } from '../render/cave/mouth/wayOut';
import { cheapestRoute, type CostGrid } from './roadRoute';
import { roadFrame } from './roadFrame';
import { mergedInto } from './roadMerge';
import { APPROACH, hairpin, roadLine } from './roadLine';
import { deckUnder } from './sharedBridges';
import { bends, normalAt, waterField } from './riverShape';

/**
 * A Forest's roads, laid as old roads are: a road comes in beyond one edge of the map and leaves
 * beyond another, since a road always leads somewhere, and it is the way in: it runs through the
 * map's entrances and their trails, so no trail fades into the woods; it takes the open ground of the clearings
 * where it can and cuts through the woods where it must, goes round lakes and pools, and crosses a
 * river only where its way leads over it, at a narrow straight reach and square to it, over a
 * bridge as wide as the road with straight approaches either side. Its line bends gently and never
 * zigzags (turning costs, `roadRoute`). Most are cart roads, worn to two ruts; some footpaths. Now
 * and then a footpath leaves the road for a third edge. These crossings are the map's only bridges,
 * two at most. Pure, deterministic in the seed.
 */

type Vec = CellPoint;

/** What crossing a cell costs: an entrance's trail (a road keeps to it where water does not turn it aside), open ground, woods, the woods beyond the rooms' extent (a road only passes there to leave the map, never runs along its edge), the bank beside water (a road keeps a little off it), a pool, a river's water (bridged where crossed), a lake. */
const COST = { trail: 0.4, open: 1, woods: 2.6, margin: 6, bank: 4, pool: 100, river: 90, lake: Infinity } as const;
/** How near the water a cell's middle lies to hold water (any of it, so a brook between two cells' middles is crossed too) and to count as its bank, in cells: a road keeps far enough off that its curves never dip into a river it runs beside. */
const WET = 0.45;
const BANK = 1.5;
/** A branch runs at least this many cells before it meets the road. */
const SHORTEST_BRANCH = 8;
/** At most this many bridges on a map: a road that would cross more is laid again or not at all. */
const MOST_BRIDGES = 2;
/** How many edge-to-edge ways are tried after the ways through the entrances. */
const EDGE_PLANS = 6;
/** What a cell within `BESIDE` cells of a laid road costs a path more, as a factor. */
const BESIDE = 2.5;
const BESIDE_COST = 6;
/** Two bridges stand at least this far apart, in cells; on a forest's last way in, as close as their straight approaches allow. */
const BRIDGES_APART = 8;
const BRIDGES_APART_RELAXED = 5;
/** How many ways are tried for each road. */
const TRIES = 4;
/** A bridge reaches this far onto the banks on either side, in cells. */
const BRIDGE_REACH = 0.6;

/** A Forest floor's roads, its rivers with the bridges the roads cross them on, and the entrances a road leads through. */
export interface ForestRoads {
  roads: DungeonRoad[];
  rivers: DungeonRiver[];
  /** The entrances a road or footpath leads through: the only ways in a forest has. Any other is closed by the woods (`forestFloor`). */
  entrances: ReadonlySet<DungeonDoor>;
}

/** A road passing this near an entrance's mouth leads through it, in cells. */
const LEADS_THROUGH = 2.5;

/** `below`: the floors under the entry floor, which share its map and so widen its picture. */
export function forestRoads(floor: DungeonFloor, water: ForestWater, seed: number, tags: ReadonlySet<string>, below: readonly DungeonFloor[] = []): ForestRoads {
  const rng = floorStream(seed, 'water', 0, 'roads');
  // The trails out of the entrances, as the drawing lays them (`visibleDungeon`: the entry floor's seed is the dungeon's).
  const ways = wayOutsOf({ ...floor, forest: true }, floor.doors, seed);
  // A map with ways in always has a road through them: a trail must lead somewhere.
  if (floor.rooms.length === 0 || rng() > (ways.length || tags.has('inhabited') ? 1 : 0.8)) return { roads: [], rivers: water.rivers, entrances: new Set() };
  const ground = groundOf(floor, water, ways, roadFrame(floor, ways, below));
  const kinds = { cart: tags.has('inhabited') || rng() < 0.7 };
  const width = kinds.cart ? 1.3 + rng() * 0.4 : 0.65 + rng() * 0.2;
  const bridges: Bridged[] = [];
  const roads: DungeonRoad[] = [];
  // Through both entrances where it can, else through one, else across: the first way that can be laid.
  let main: Vec[] | null = null;
  let sides: number[] = [];
  for (const plan of roadPlans(ground, ways, rng)) {
    main = layRoad(ground, water, plan.legs, width, bridges, rng);
    sides = plan.sides;
    if (main) break;
  }
  const served = new Set<WayOut>();
  const lay = (points: Vec[], road: Omit<DungeonRoad, 'points'>): DungeonRoad => {
    const laid = { points, ...road };
    roads.push(laid);
    for (const way of ways) if (points.some((p) => Math.hypot(p.x - way.mouth.at.x, p.y - way.mouth.at.y) < LEADS_THROUGH)) served.add(way);
    return laid;
  };
  if (main) {
    const mainRoad = lay(main, { width, ruts: kinds.cart });
    // Paths laid after a road meet it, never run beside it, nor beside one another.
    let beside = besideRoad(ground, main);
    // An entrance no road passes yet gets a footpath through it: in from the map's edge along its trail, through the
    // entrance and on into the road, else on to another edge. An entrance is no place a path can end: nothing stands
    // there but the clearing's edge, and a path that stopped there (or ran only from there to the road) led nowhere.
    // An entrance a path already passes needs none of its own; one no path can lead through is closed (`forestFloor`).
    let missed = false;
    for (const way of ways) {
      if (served.has(way)) continue;
      missed = true;
      const path = throughEntrance(beside, water, way, 0.7, bridges, rng, mainRoad);
      if (!path) continue;
      lay(path, { width: 0.7, ruts: false });
      beside = besideRoad(beside, path);
    }
    // A footpath off the road to an edge the road does not reach, now and then.
    if (!missed && rng() < 0.35) {
      const free = [0, 1, 2, 3].filter((side) => !sides.includes(side));
      const branch = layRoad(beside, water, [[edgeCell(ground, free[Math.floor(rng() * free.length)]!, rng)]], 0.7, bridges, rng, { joins: mainRoad });
      if (branch) lay(branch, { width: 0.7, ruts: false });
    }
  }
  // A forest always keeps a way in: where no road could be laid through an entrance by the rules, the first that
  // can be laid at all leads through one, over a third bridge, a bridge sooner after another or round a tight bend
  // if it must, and from any edge. Where even that finds none (no sweep has met one), the first entrance stays open.
  if (ways.length && !served.size) {
    for (const way of ways) {
      const joins = roads[0];
      const road = joins ? { width: 0.7, ruts: false } : { width, ruts: kinds.cart };
      const path = throughEntrance(ground, water, way, road.width, bridges, rng, joins, true);
      if (!path) continue;
      lay(path, road);
      break;
    }
  }
  const rivers = water.rivers.map((river, k) => ({ ...river, bridges: bridges.filter((b) => b.river === k).map((b) => b.bridge) }));
  const kept = served.size || !ways.length ? [...served] : [ways[0]!];
  return { roads, rivers, entrances: new Set(kept.map((way) => way.mouth.door)) };
}

/**
 * A footpath through an entrance: in from the edge beyond its trail and on into `joins`, else on through the clearings
 * to another edge (the opposite first). A `relaxed` one (a forest's last way in) may also come in from any other edge,
 * from the point of it nearest the entrance.
 */
function throughEntrance(ground: Ground, water: ForestWater, way: WayOut, width: number, bridges: Bridged[], rng: Rng, joins: DungeonRoad | undefined, relaxed = false): Vec[] | null {
  const beyond = edgeBeyond(ground, way);
  const mouth = mouthCell(way);
  const starts = [beyond, ...(relaxed ? [0, 1, 2, 3].filter((side) => side !== beyond.side).map((side) => ({ edge: edgeNear(ground, side, mouth), side })) : [])];
  for (const { edge, side } of starts) {
    const legs = [[edge], [mouth]];
    const through = way.mouth.at;
    let path = joins ? layRoad(ground, water, legs, width, bridges, rng, { joins, relaxed, through }) : null;
    for (const turn of [2, 1, 3]) path ??= layRoad(ground, water, [...legs, [edgeCell(ground, (side + turn) % 4, rng)]], width, bridges, rng, { relaxed, through });
    if (path) return path;
  }
  return null;
}

/** The cell of an edge of the ground nearest `p`. */
function edgeNear({ bounds }: Ground, side: number, p: Vec): Vec {
  const x = Math.min(bounds.maxX - 1, Math.max(bounds.minX, p.x));
  const y = Math.min(bounds.maxY - 1, Math.max(bounds.minY, p.y));
  return side === 0 ? { x: bounds.minX, y } : side === 1 ? { x, y: bounds.minY } : side === 2 ? { x: bounds.maxX - 1, y } : { x, y: bounds.maxY - 1 };
}

/** A bridge and the river it spans. */
interface Bridged {
  river: number;
  bridge: DungeonRiverBridge;
}

interface Ground {
  grid: CostGrid;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** What crossing each cell costs, over the cells of `frame` (`roadFrame`: past the map's picture all round). */
function groundOf(floor: DungeonFloor, { rivers, lakes }: ForestWater, ways: readonly WayOut[], frame: Bounds): Ground {
  const inner = { minX: Math.min(...floor.rooms.map((r) => r.x)), minY: Math.min(...floor.rooms.map((r) => r.y)), maxX: Math.max(...floor.rooms.map((r) => r.x + r.w)), maxY: Math.max(...floor.rooms.map((r) => r.y + r.h)) };
  const { minX, minY, maxX, maxY } = frame;
  const open = new Set([...floor.rooms.flatMap((room) => floorCellsOf(room)), ...floor.doors.flatMap(doorCells), ...(floor.openGround ?? [])].map((c) => cellKey(c.x, c.y)));
  const pools = new Set(floor.waterCells.map((c) => cellKey(c.x, c.y)));
  const blocked = new Set([...floor.stairs.flatMap((s) => Array.from({ length: s.w * s.h }, (_, k) => ({ x: s.x + (k % s.w), y: s.y + Math.floor(k / s.w) }))), ...floor.terrain.filter((p) => p.opening !== undefined).flatMap((p) => p.cells)].map((c) => cellKey(c.x, c.y)));
  const field = waterField(rivers, lakes);
  const trails = new Set(ways.flatMap(trailCells).map((c) => cellKey(c.x, c.y)));
  const w = maxX - minX;
  const h = maxY - minY;
  const cost = new Float32Array(w * h);
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const key = cellKey(x, y);
      const cx = x + 0.5;
      const cy = y + 0.5;
      const d = field.distance(cx, cy);
      const wet = d < WET;
      const lake = wet && (lakes ?? []).some((l) => pointInPolygon(l.outline, cx, cy));
      const margin = x < inner.minX || y < inner.minY || x >= inner.maxX || y >= inner.maxY;
      cost[(y - minY) * w + (x - minX)] = blocked.has(key) || lake ? COST.lake : wet ? COST.river : pools.has(key) ? COST.pool : d < BANK ? COST.bank : trails.has(key) ? COST.trail : open.has(key) ? COST.open : margin ? COST.margin : COST.woods;
    }
  }
  return { grid: { x0: minX, y0: minY, w, h, cost }, bounds: { minX, minY, maxX, maxY } };
}

/**
 * The ways a road may pass, the best first, each its legs in order (runs of cells it must follow,
 * joined by the cheapest way between them) and the edges it comes in and leaves by (0 left, 1 top,
 * 2 right, 3 bottom): from the edge before one entrance through it (its trail the cheapest ground
 * there), on through the other to the edge before it; through either entrance alone and on to the
 * far edge (straight across most of the time); from one edge to another.
 */
function roadPlans(ground: Ground, ways: readonly WayOut[], rng: Rng): { legs: Vec[][]; sides: number[] }[] {
  const trails = ways.slice(0, 2).map((way) => ({ cells: [[edgeBeyond(ground, way).edge], [mouthCell(way)]], side: edgeBeyond(ground, way).side }));
  const across = (first: number): number => (rng() < 0.7 ? (first + 2) % 4 : (first + (rng() < 0.5 ? 1 : 3)) % 4);
  const plans: { legs: Vec[][]; sides: number[] }[] = [];
  const [a, b] = trails;
  if (a && b) plans.push({ legs: [...a.cells, ...[...b.cells].reverse()], sides: [a.side, b.side] });
  for (const trail of trails) {
    const far = across(trail.side);
    plans.push({ legs: [...trail.cells, [edgeCell(ground, far, rng)]], sides: [trail.side, far] });
  }
  // Edge to edge, a few ways, for a map whose entrances no road can be laid through.
  for (let k = 0; k < EDGE_PLANS; k++) {
    const first = Math.floor(rng() * 4);
    const second = across(first);
    plans.push({ legs: [[edgeCell(ground, first, rng)], [edgeCell(ground, second, rng)]], sides: [first, second] });
  }
  return plans;
}

/** The floor's cell just inside an entrance. */
function mouthCell({ mouth }: WayOut): Vec {
  return { x: Math.floor(mouth.at.x - mouth.out.x * 0.5), y: Math.floor(mouth.at.y - mouth.out.y * 0.5) };
}

/** The cells of a trail, from the floor's cell just inside its entrance out to where it fades. */
function trailCells(way: WayOut): Vec[] {
  const cells: Vec[] = [mouthCell(way)];
  for (let u = 0; u <= way.length; u += 0.25) {
    const p = wayPoint(way, u, wayCentre(way, u));
    const c = { x: Math.floor(p.x), y: Math.floor(p.y) };
    const last = cells[cells.length - 1]!;
    if (last.x !== c.x || last.y !== c.y) cells.push(c);
  }
  return cells;
}

/** Where a trail, followed on the way it leaves, meets the ground's edge, and which edge. */
function edgeBeyond({ bounds }: Pick<Ground, 'bounds'>, way: WayOut): { edge: Vec; side: number } {
  let p = way.mouth.at;
  for (let u = 0; u < way.length; u += 0.5) p = wayPoint(way, u, wayCentre(way, u));
  const { out } = way.mouth;
  // On beyond the trail's end the way it leaves, to the first edge it meets.
  const reach = Math.min(
    out.x > 0 ? (bounds.maxX - 0.5 - p.x) / out.x : out.x < 0 ? (bounds.minX + 0.5 - p.x) / out.x : Infinity,
    out.y > 0 ? (bounds.maxY - 0.5 - p.y) / out.y : out.y < 0 ? (bounds.minY + 0.5 - p.y) / out.y : Infinity,
  );
  const at = { x: p.x + out.x * Math.max(0, reach), y: p.y + out.y * Math.max(0, reach) };
  const edge = { x: Math.min(bounds.maxX - 1, Math.max(bounds.minX, Math.floor(at.x))), y: Math.min(bounds.maxY - 1, Math.max(bounds.minY, Math.floor(at.y))) };
  const side = edge.x === bounds.minX ? 0 : edge.y === bounds.minY ? 1 : edge.x === bounds.maxX - 1 ? 2 : 3;
  return { edge, side };
}

/** A cell on an edge of the ground, a fifth to four fifths along it. */
function edgeCell({ bounds }: Ground, side: number, rng: Rng): Vec {
  const t = 0.2 + rng() * 0.6;
  const x = Math.floor(bounds.minX + t * (bounds.maxX - bounds.minX));
  const y = Math.floor(bounds.minY + t * (bounds.maxY - bounds.minY));
  return side === 0 ? { x: bounds.minX, y } : side === 1 ? { x, y: bounds.minY } : side === 2 ? { x: bounds.maxX - 1, y } : { x, y: bounds.maxY - 1 };
}

/**
 * A road through `legs`, or, for a branch, through them and on into the road `joins`, merging
 * with it (`mergedInto`); its crossings bridged, unless they would make more than `MOST_BRIDGES` on the map
 * or it bends back on itself, both of which a `relaxed` road (a forest's last way in) may, as it may bridge
 * a river again sooner after the last bridge. A road that must lead
 * through an entrance (`through`, the mouth) is refused where its line, smoothed and bridged, passes it by.
 * The route and its bridges follow from the ground alone, so they are worked out once; only the
 * line's wandering differs from try to try (each search of the route takes tens of milliseconds
 * on a large map, and the same refused route was searched four times over).
 */
function layRoad(ground: Ground, water: ForestWater, legs: readonly Vec[][], width: number, bridges: Bridged[], rng: Rng, { joins, relaxed = false, through }: { joins?: DungeonRoad; relaxed?: boolean; through?: Vec } = {}): Vec[] | null {
  const field = waterField(water.rivers, water.lakes);
  const cells = joins ? branchRoute(ground, legs, joins.points) : throughRoute(ground, legs);
  if (!cells) return null;
  const crossings = crossingsOf(cells, field);
  // A crossing over a road's bridge takes that bridge; only the others are built.
  const shared = crossings.flatMap((run) => deckUnder(bridges, cells, run) ?? []);
  const fresh = crossings.filter((run) => !deckUnder(bridges, cells, run));
  if (!relaxed && bridges.length + fresh.length > MOST_BRIDGES) return null;
  const found = fresh.map((run) => bridgeFor(water.rivers, run, cells, width, field));
  if (found.some((p) => p === null)) return null;
  const built = found as Bridged[];
  const placed = [...new Set(shared), ...built];
  // Never a bridge hard by another: a road that would cross back over the river it just crossed takes another way.
  const all = [...bridges, ...built].map((b) => b.bridge.at);
  const apart = relaxed ? BRIDGES_APART_RELAXED : BRIDGES_APART;
  if (all.some((a, i) => all.slice(i + 1).some((b) => Math.hypot(a.x - b.x, a.y - b.y) < apart))) return null;
  const onBridge = (p: Vec): boolean => placed.some(({ bridge }) => Math.hypot(p.x - bridge.at.x, p.y - bridge.at.y) <= bridge.length / 2 + 0.2);
  for (let attempt = 0; attempt < (joins ? TRIES : 1); attempt++) {
    const laid = roadLine(cells, placed, rng, field);
    // The line runs the whole route: bridges whose straight approaches overlap would cut it short.
    const last = cells[cells.length - 1]!;
    if (Math.hypot(laid[laid.length - 1]!.x - last.x - 0.5, laid[laid.length - 1]!.y - last.y - 0.5) > 1) return null;
    const line = joins ? mergedInto(laid, joins.points, joins.width) : laid;
    // Its curves must keep out of the water everywhere but on its bridges.
    if (line.some((p) => field.distance(p.x, p.y) < 0 && !onBridge(p))) continue;
    if (!relaxed && hairpin(line)) continue;
    if (through && !line.some((p) => Math.hypot(p.x - through.x, p.y - through.y) < LEADS_THROUGH)) continue;
    bridges.push(...built);
    return line;
  }
  return null;
}

/**
 * Every leg in turn, each joined to the next by the cheapest way between them that keeps off the
 * ground already taken (a cell either side of it, but where the way sets out): a road never runs
 * into an entrance and back out the way it came, nor beside itself.
 */
function throughRoute(ground: Ground, legs: readonly Vec[][]): Vec[] | null {
  const { x0, y0, w, h } = ground.grid;
  const cost = Float32Array.from(ground.grid.cost);
  const take = (cells: readonly Vec[], from: Vec): void => {
    for (const c of cells) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = c.x + dx;
        const y = c.y + dy;
        if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h || Math.max(Math.abs(x - from.x), Math.abs(y - from.y)) <= 2) continue;
        cost[(y - y0) * w + (x - x0)] = Infinity;
      }
    }
  };
  const cells: Vec[] = [...legs[0]!];
  for (const leg of legs.slice(1)) {
    const from = cells[cells.length - 1]!;
    const to = leg[0]!;
    take(cells, from);
    const way = cheapestRoute({ ...ground.grid, cost }, from, (x, y) => x === to.x && y === to.y, to);
    if (!way) return null;
    cells.push(...way.slice(1), ...leg.slice(1));
  }
  return cells;
}

/** A branch's way: through its legs, then the cheapest way on to the road it joins; long enough to be a road of its own. */
function branchRoute(ground: Ground, legs: readonly Vec[][], joins: readonly Vec[]): Vec[] | null {
  const leg = throughRoute(ground, legs);
  if (!leg) return null;
  const from = leg[leg.length - 1]!;
  const to = nearestOn(joins, from);
  const way = cheapestRoute(ground.grid, from, (x, y) => joins.some((p) => Math.abs(p.x - x - 0.5) < 1 && Math.abs(p.y - y - 0.5) < 1), to);
  const cells = way ? [...leg, ...way.slice(1)] : null;
  return cells && cells.length >= SHORTEST_BRANCH ? cells : null;
}

/** The ground with the cells beside a laid road dearer, so a path laid after it meets it rather than running along it. */
function besideRoad(ground: Ground, road: readonly Vec[]): Ground {
  const { x0, y0, w, h } = ground.grid;
  const cost = Float32Array.from(ground.grid.cost);
  const reach = Math.ceil(BESIDE);
  const marked = new Uint8Array(w * h);
  for (const p of road) {
    for (let y = Math.floor(p.y) - reach; y <= Math.floor(p.y) + reach; y++) {
      for (let x = Math.floor(p.x) - reach; x <= Math.floor(p.x) + reach; x++) {
        if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) continue;
        const k = (y - y0) * w + (x - x0);
        if (marked[k] || Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > BESIDE) continue;
        marked[k] = 1;
        cost[k] = cost[k]! * BESIDE_COST;
      }
    }
  }
  return { ...ground, grid: { ...ground.grid, cost } };
}

function nearestOn(line: readonly Vec[], p: Vec): Vec {
  let best = line[0]!;
  for (const q of line) if (Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)) best = q;
  return { x: Math.floor(best.x), y: Math.floor(best.y) };
}

/** The runs of a route's cells that lie in a river's water, as index ranges of the route. */
function crossingsOf(cells: readonly Vec[], field: { distance(x: number, y: number): number }): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  cells.forEach((c, i) => {
    const wet = field.distance(c.x + 0.5, c.y + 0.5) < WET;
    if (wet && start < 0) start = i;
    if (!wet && start >= 0) { runs.push([start, i - 1]); start = -1; }
  });
  return runs;
}

/** The bridge for a crossing: on the river the route crosses there, at its straightest point nearby where both ends and their approaches stand clear of the water, square to it, pointing the way the road goes. */
function bridgeFor(rivers: readonly DungeonRiver[], [a, b]: [number, number], cells: readonly Vec[], width: number, field: { distance(x: number, y: number): number }): Bridged | null {
  const mid = cells[(a + b) >> 1]!;
  const centre = { x: mid.x + 0.5, y: mid.y + 0.5 };
  let river = -1;
  let at = -1;
  let nearest = Infinity;
  rivers.forEach((r, k) => r.points.forEach((p, i) => {
    const d = Math.hypot(p.x - centre.x, p.y - centre.y);
    if (d < nearest) { nearest = d; river = k; at = i; }
  }));
  if (river < 0) return null;
  const { points, widths } = rivers[river]!;
  const bent = bends(points);
  const near = Array.from({ length: 13 }, (_, k) => at - 6 + k).filter((i) => i >= 0 && i < points.length).sort((p, q) => Math.abs(bent[p]!) - Math.abs(bent[q]!));
  const before = cells[Math.max(0, a - 2)]!;
  const after = cells[Math.min(cells.length - 1, b + 2)]!;
  for (const i of near) {
    let along = normalAt(points, i);
    if (along.x * (after.x - before.x) + along.y * (after.y - before.y) < 0) along = { x: -along.x, y: -along.y };
    const length = widths[i]! + 2 * BRIDGE_REACH;
    const p = points[i]!;
    // Its ends and the straight approaches beyond them on dry ground: a river looping back near the bridge would flood an approach.
    const dry = [-1, 1].every((side) => Array.from({ length: Math.ceil(APPROACH / 0.25) + 1 }, (_, k) => length / 2 + k * 0.25)
      .every((u) => field.distance(p.x + along.x * side * u, p.y + along.y * side * u) > 0.1));
    if (dry) return { river, bridge: { at: p, along, length, breadth: width + 0.15 } };
  }
  return null;
}

/** The cells a road's ground covers: within its half width and a verge of its line, inside the rooms' extent (so the map keeps its size). */
export function roadGround(floor: DungeonFloor, roads: readonly DungeonRoad[]): Vec[] {
  if (!roads.length) return [];
  const minX = Math.min(...floor.rooms.map((r) => r.x));
  const minY = Math.min(...floor.rooms.map((r) => r.y));
  const maxX = Math.max(...floor.rooms.map((r) => r.x + r.w));
  const maxY = Math.max(...floor.rooms.map((r) => r.y + r.h));
  const cells = new Map<string, Vec>();
  for (const road of roads) {
    const reach = road.width / 2 + 0.7;
    for (const p of road.points) {
      for (let y = Math.floor(p.y - reach); y <= Math.floor(p.y + reach); y++) {
        for (let x = Math.floor(p.x - reach); x <= Math.floor(p.x + reach); x++) {
          if (x < minX || y < minY || x >= maxX || y >= maxY) continue;
          if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= reach) cells.set(cellKey(x, y), { x, y });
        }
      }
    }
  }
  return [...cells.values()];
}

const roadFields = new WeakMap<readonly DungeonRoad[], LineField>();

/** How far a point lies from the roads' edges, in cells, negative on them; kept for the list, which the drawing asks a few million times. */
export function roadField(roads: readonly DungeonRoad[] | undefined): LineField {
  if (!roads?.length) return lineField([]);
  let field = roadFields.get(roads);
  if (!field) {
    const segments = roads.flatMap((road) => road.points.slice(1).flatMap((b, i) => {
      const a = road.points[i]!;
      return [a.x, a.y, b.x, b.y, road.width / 2];
    }));
    roadFields.set(roads, (field = lineField(segments)));
  }
  return field;
}
