import { stackOf, stairEnd } from '../floors/floorStack';
import { approachCells, spotRect } from '../floors/stairSpots';
import { cellsOf } from '../geometry';
import { rectPoly } from '../render/art/paths';
import { intersectRings, lineRings, subtractRings, unionRings } from '../render/clipShapes';
import { forestMass, woodsOutside } from '../render/forest/forestMass';
import { roadBand } from '../render/forest/roads';
import { wayOutline } from '../render/cave/ways/wayOutline';
import { massEdge } from '../render/grounds/crowns';
import { shapeRings, signedArea2, type Bounds, type Vec } from '../render/geometry';
import type { VisibleDungeon } from '../render/visibleDungeon';
import type { DungeonStyle } from '../style';
import type { WallSegment } from '../../types/wallTypes';
import { necksOf, WAY_LANE } from './forestNecks';
import type { DungeonPlacement, DungeonWalls, WallsOf } from './toWalls';

/**
 * A Forest floor's walls: the drawn edge of the very trees its map shows (`forestMass`, the curves
 * of every crown's outline, tip to tip on a conifer; a bare tree draws no crown and walls the clump
 * it stands for, or the woods would have gaps), not the clearing's outline those trees overhang.
 * Tokens and light stop on the line where the woods begin; sight carries on, since trees do not close
 * off a view as a wall does. Clearings,
 * roads, rivers and lakes are open wherever the trees leave them open, and they run on to the map's
 * edge, where no wall stands.
 */

/** How far a clump may stand behind the mass's edge and still shape it, in cells: every point deeper than this is covered by clumps nearer the edge. */
const EDGE_DEPTH = 0.6;
/** Scraps smaller than this, of open ground or of woods, get no wall, in square cells. */
const SMALLEST = 0.1;
/** How far a wall may stray from the trees' edge to save a corner, in cells: 4.5 pixels of a scene's map. It follows a crown's outline and rounds its small scallops; finer costs far more than it shows, since corners under the sealing's tolerance apart each get bridges (0.015 tripled the walls sight goes by). */
const STRAY = 0.03;
/** How near the map's edge a corner lies on it, in cells: a crown's tip that grazes the edge makes no wall along it. */
const ON_EDGE = 0.01;

const ringArea = (ring: readonly Vec[]): number => Math.abs(signedArea2(ring)) / 2;

/** A run of corners with every corner dropped that lies within `STRAY` of the line its neighbours left (Douglas–Peucker, by a stack: rings run to thousands of corners). */
function thinned(run: readonly Vec[]): Vec[] {
  const keep = new Uint8Array(run.length);
  keep[0] = keep[run.length - 1] = 1;
  const stack: [number, number][] = [[0, run.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop()!;
    const a = run[from]!;
    const b = run[to]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    let far = -1;
    let farthest = STRAY;
    for (let k = from + 1; k < to; k++) {
      const p = run[k]!;
      const off = length === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
      if (off > farthest) { far = k; farthest = off; }
    }
    if (far < 0) continue;
    keep[far] = 1;
    stack.push([from, far], [far, to]);
  }
  return run.filter((_, k) => keep[k] === 1);
}

/** A ring as the runs of corners between its stretches on the map's edge (`onMapEdge`, asked of each side); the whole ring, closing on its first corner, where it has none. */
function runsOffMapEdge(ring: readonly Vec[], onMapEdge: (a: Vec, b: Vec) => boolean): Vec[][] {
  const n = ring.length;
  const cut = ring.map((a, i) => onMapEdge(a, ring[(i + 1) % n]!));
  const start = cut.indexOf(true);
  if (start < 0) return [[...ring, ring[0]!]];
  const runs: Vec[][] = [];
  let run: Vec[] = [];
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    run.push(ring[i]!);
    if (!cut[i]) continue;
    if (run.length > 1) runs.push(run);
    run = [];
  }
  return runs;
}

/** An open run without the sides that lie on the map's edge: thinning a bump smaller than `STRAY` off a run can leave one. */
function splitOnMapEdge(run: readonly Vec[], onMapEdge: (a: Vec, b: Vec) => boolean): Vec[][] {
  const parts: Vec[][] = [];
  let part: Vec[] = [run[0]!];
  for (let k = 1; k < run.length; k++) {
    if (onMapEdge(run[k - 1]!, run[k]!)) {
      if (part.length > 1) parts.push(part);
      part = [];
    }
    part.push(run[k]!);
  }
  if (part.length > 1) parts.push(part);
  return parts;
}

/** A run thinned; one that closes on itself in two halves, so it is not thinned to a line. */
function thinnedRun(run: readonly Vec[]): Vec[] {
  const first = run[0]!;
  const last = run[run.length - 1]!;
  if (first.x !== last.x || first.y !== last.y) return thinned(run);
  const far = run.reduce((best, p, i) => (Math.hypot(p.x - first.x, p.y - first.y) > Math.hypot(run[best]!.x - first.x, run[best]!.y - first.y) ? i : best), 0);
  return [...thinned(run.slice(0, far + 1)), ...thinned(run.slice(far)).slice(1)];
}

/**
 * The trees' edge on a whole map as runs of corners in cells, a run that closes on itself (a stand of
 * trees in the open) ending on its first corner. `bounds` is the map's rectangle in cells. Costs up
 * to a second on a large forest: a scene asks the dungeon worker for it with its map.
 */
export function treeLine(dungeon: VisibleDungeon, style: DungeonStyle, bounds: Bounds): Vec[][] {
  const mass = forestMass(dungeon, style, { minX: bounds.minX - 1, minY: bounds.minY - 1, maxX: bounds.maxX + 1, maxY: bounds.maxY + 1 });
  const edge = mass.filter(({ clump, depth }) => depth - clump.radius <= EDGE_DEPTH).map(({ clump }) => massEdge(clump.shape));
  // Each outline cleaned first: the clipper's union of the raw curves, about two forests in a hundred, joined corners dozens of cells apart with a side across open floor.
  const trees = unionRings(edge.flatMap((ring) => unionRings([ring])));
  // A way down is drawn over the crowns that overhang it, so what it draws stays open, with a lane from the middle of each cell before it; the rest of those cells stays the crowns'.
  const stack = stackOf(dungeon.model);
  const ways = dungeon.floor.stairs.flatMap((stair) => {
    const spot = cellsOf(spotRect(stair));
    const end = stairEnd(stack, dungeon.index, stair.to);
    const lanes = approachCells(stair, end).flatMap((cell) => {
      const nearest = spot.reduce((best, c) => (Math.hypot(c.x - cell.x, c.y - cell.y) < Math.hypot(best.x - cell.x, best.y - cell.y) ? c : best));
      return lineRings([{ x: nearest.x + 0.5, y: nearest.y + 0.5 }, { x: cell.x + 0.5, y: cell.y + 0.5 }], WAY_LANE);
    });
    // Cleaned, so each winds as a lane does: where they overlap they would otherwise cancel.
    return [...wayOutline(stair, end, dungeon.model.seed).flatMap((ring) => unionRings([ring])), ...lanes];
  });
  const necks = necksOf(unionRings(dungeon.floors.flatMap((shape) => shapeRings(shape))), (x, y) => -dungeon.field.distance(x, y));
  const map = rectPoly({ x: bounds.minX, y: bounds.minY, w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY });
  const lanes = (dungeon.floor.roads ?? []).flatMap((road) => roadBand(road, WAY_LANE));
  const shown = intersectRings(subtractRings(trees, [...ways, ...necks, ...lanes]), [map]);
  const near = (value: number, edge: number): boolean => Math.abs(value - edge) < ON_EDGE;
  const onMapEdge = (a: Vec, b: Vec): boolean => (near(a.x, bounds.minX) && near(b.x, bounds.minX)) || (near(a.x, bounds.maxX) && near(b.x, bounds.maxX)) || (near(a.y, bounds.minY) && near(b.y, bounds.minY)) || (near(a.y, bounds.maxY) && near(b.y, bounds.maxY));
  const outside = woodsOutside(dungeon);
  // The mass's far side lies deep in the woods, where nobody comes.
  const reached = (run: readonly Vec[]): boolean => run.filter((p) => outside(p.x, p.y) < EDGE_DEPTH).length * 2 > run.length;
  return shown.filter((ring) => ringArea(ring) >= SMALLEST).flatMap((ring) => runsOffMapEdge(ring, onMapEdge)).filter(reached).map(thinnedRun).flatMap((run) => splitOnMapEdge(run, onMapEdge));
}

/** A Forest floor's walls in world pixels, each run of the trees' edge a chain. Pure. */
export function forestWalls(line: readonly Vec[][], { originCell, pxPerCell }: DungeonPlacement, of: WallsOf): DungeonWalls {
  const world = (p: Vec): Vec => ({ x: (p.x - originCell.x) * pxPerCell, y: (p.y - originCell.y) * pxPerCell });
  const walls: Record<string, WallSegment> = {};
  let count = 0;
  line.forEach((run, index) => {
    const chainId = `chain_${of.id}_${index + 1}`;
    for (let k = 1; k < run.length; k++) {
      const id = `wall_${of.id}_${++count}`;
      walls[id] = { id, kind: 'wall', type: 'solid', blocks: 'light', chainId, p1: world(run[k - 1]!), p2: world(run[k]!), ...(of.levels && { levels: of.levels }) };
    }
  });
  return { walls, doors: {}, unplaced: 0 };
}
