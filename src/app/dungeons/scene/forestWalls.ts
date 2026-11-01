import { stackOf, stairEnd } from '../floors/floorStack';
import { approachCells, spotRect } from '../floors/stairSpots';
import { cellsOf } from '../geometry';
import { rectPoly } from '../render/art/paths';
import { grownRings, intersectRings, subtractRings, unionRings } from '../render/clipShapes';
import { forestMass, woodsOutside } from '../render/forest/forestMass';
import { shapeRings, signedArea2, type Bounds, type Vec } from '../render/geometry';
import type { VisibleDungeon } from '../render/visibleDungeon';
import type { DungeonStyle } from '../style';
import type { WallSegment } from '../../types/wallTypes';
import type { DungeonPlacement, DungeonWalls, WallsOf } from './toWalls';

/**
 * A Forest floor's walls: the edge of the very trees its map draws (`forestMass`), not the clearing's
 * outline those trees overhang, so light, sight and tokens stop where the woods begin. Clearings,
 * roads, rivers and lakes are open wherever the trees leave them open, and they run on to the map's
 * edge, where no wall stands.
 */

/** How far a clump may stand behind the mass's edge and still shape it, in cells: every point deeper than this is covered by clumps nearer the edge. */
const EDGE_DEPTH = 0.6;
/** Notches between the crowns narrower than twice this are closed, in cells: nobody stands in them, and they would only make corners. */
const NOTCH = 0.05;
/** How far the walls stand within the crowns, in cells: players see the edge of the leaves, not a line where the trees are cut off. */
const WITHIN_CROWNS = 0.1;
/** What a crown leaves of a floor (`walkedFloor`), in cells; `shaved` is how far inside the floor a neck is looked for, and `sliver` the square cells that make one. */
const NECK = { overhang: 0.35, left: 0.5, shaved: 0.12, sliver: 0.08 } as const;
/** Scraps smaller than this, of open ground or of woods, get no wall, in square cells. */
const SMALLEST = 0.1;
/** How far a wall may stray from the trees' edge to save a corner, in cells. */
const STRAY = 0.03;
/** How near the map's edge a corner lies on it, in cells. */
const ON_EDGE = 1 / 512;

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

/**
 * What a crown may not take of the floors, however far it overhangs, so two clearings joined on the
 * floor stay joined: the middle of a clearing (`NECK.overhang`), and all of a neck, where the floor
 * is too narrow to leave `NECK.left` beside the crowns of both sides. Slivers a floor's corners
 * leave are no necks.
 */
function walkedFloor(floors: readonly Vec[][]): Vec[][] {
  const { overhang, left, shaved, sliver } = NECK;
  const middle = grownRings(floors, -overhang);
  const wideEnough = overhang + left / 2;
  const necks = subtractRings(grownRings(floors, -shaved), grownRings(grownRings(floors, -wideEnough), wideEnough - shaved)).filter((ring) => ringArea(ring) >= sliver);
  return necks.length ? [...middle, ...grownRings(necks, shaved)] : middle;
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
  const edge = mass.filter(({ clump, depth }) => depth - clump.radius <= EDGE_DEPTH).map(({ clump }) => clump.ring);
  const trees = grownRings(grownRings(unionRings(edge), NOTCH), -(NOTCH + WITHIN_CROWNS));
  // A way down is drawn over the crowns that overhang it, and stays open with its approach.
  const stack = stackOf(dungeon.model);
  const ways = dungeon.floor.stairs.flatMap((stair) => [...cellsOf(spotRect(stair)), ...approachCells(stair, stairEnd(stack, dungeon.index, stair.to))]).map((cell) => rectPoly({ ...cell, w: 1, h: 1 }));
  const free = walkedFloor(unionRings(dungeon.floors.flatMap((shape) => shapeRings(shape))));
  const map = rectPoly({ x: bounds.minX, y: bounds.minY, w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY });
  const shown = intersectRings(subtractRings(trees, [...ways, ...free]), [map]);
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
      walls[id] = { id, kind: 'wall', type: 'solid', chainId, p1: world(run[k - 1]!), p2: world(run[k]!), ...(of.levels && { levels: of.levels }) };
    }
  });
  return { walls, doors: {}, unplaced: 0 };
}
