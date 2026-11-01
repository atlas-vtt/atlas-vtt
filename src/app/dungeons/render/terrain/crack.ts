import type { CellPoint, DungeonTerrain } from '../../model';
import { resample } from '../../water/smooth';
import type { Vec } from '../geometry';
import type { RenderEnv } from '../renderEnv';
import { cellRings } from './cellRings';
import { cellSet } from './pieces';
import { raggedRing, type RaggedShape } from './scatterPatch';
import { chiselled } from './stones';

/**
 * The outline of a bottomless chasm or shaft on a cave's floor: a crack in the rock, not a hole cut
 * along cell lines. The cells' outline is traced and rounded as a cave's rubble patch is, then
 * broken into short chipped facets as split rock is, and held near its cells, since the scene's
 * walls stand on the cells and must never stand over drawn void. It is drawn as every pit is
 * (`vertical/pit.ts`). An abyss at a chamber's edge (a chasm that says which side it falls away
 * towards) reaches a cell on into the rock behind it, so the void meets the wall drawn round the
 * floor, which clips it, and no sliver of floor is left between them.
 */

/** Softer than a rubble patch, its swell shorter, pulled a little in: a crack's lip follows its cells but never a cell line for long. */
const CRACK: RaggedShape = { sigma: 1.8, waves: 1.7, swell: 0.18, rag: 0.1, outwards: -0.04 };
/** How soft a small ring's corners may be at most, per cell round it; its swell and rag shrink alike, so a one-cell shaft stays nearly as wide as its cell. */
const SIGMA_PER_CELL = 0.3;
/** How long the facets of a crack's lip are before they are chipped, in cells: split rock breaks in short flat faces. */
const FACET = 0.3;
/** How far a chip wanders either side of its facet, in cells. */
const CHIP = 0.04;
/** How far past its cells a crack's lip may lie, in cells; the ink drawn on it reaches a little farther. */
const REACH = 0.25;

/** The point moved back to `REACH` cells from the nearest of the cells, where it lies farther out and not on rock `free` lets it reach. */
function heldToCells(p: Vec, cells: ReadonlySet<string>, free: (key: string) => boolean): Vec {
  const cx = Math.floor(p.x);
  const cy = Math.floor(p.y);
  if (cells.has(`${cx},${cy}`) || free(`${cx},${cy}`)) return p;
  let nearest: Vec | null = null;
  let distance = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!cells.has(`${cx + dx},${cy + dy}`)) continue;
      const q = { x: Math.min(Math.max(p.x, cx + dx), cx + dx + 1), y: Math.min(Math.max(p.y, cy + dy), cy + dy + 1) };
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < distance) [nearest, distance] = [q, d];
    }
  }
  if (!nearest || distance <= REACH) return p;
  return { x: nearest.x + ((p.x - nearest.x) * REACH) / distance, y: nearest.y + ((p.y - nearest.y) * REACH) / distance };
}

/** How far round a ring of cell edges, in cells. */
function perimeter(ring: readonly Vec[]): number {
  return ring.reduce((sum, p, i) => sum + Math.hypot(ring[(i + 1) % ring.length]!.x - p.x, ring[(i + 1) % ring.length]!.y - p.y), 0);
}

/**
 * The cells' outline, every ring walked and rounded and roughened by `shape` (softer on a small
 * ring, so a single cell stays nearly its own size), finished by `finish`, then held near the cells
 * (`held`, the cells themselves unless given), but where `free` lets a point lie.
 */
export function raggedCellRings(cells: readonly CellPoint[], seed: number, shape: RaggedShape, finish: (ring: Vec[]) => Vec[] = (ring) => ring, held: ReadonlySet<string> = cellSet(cells), free: (key: string) => boolean = () => false): Vec[][] {
  return cellRings(cells).map((ring) => {
    const k = Math.min(1, (perimeter(ring) * SIGMA_PER_CELL) / shape.sigma);
    const scaled = { ...shape, sigma: shape.sigma * k, swell: shape.swell * k, rag: shape.rag * k, outwards: shape.outwards * k };
    return finish(raggedRing(ring, seed, scaled)).map((p) => heldToCells(p, held, free));
  });
}

/**
 * The cells an abyss's crack is traced round, and the rock it may lie on: its cells and the rock
 * cell behind each on the side it falls away towards, where that is no floor of its level; any other
 * hole, its cells and no rock. The crack is still held near the hole's own cells over floor.
 */
function tracedCells(env: RenderEnv, piece: DungeonTerrain): { cells: CellPoint[]; rock: (key: string) => boolean } {
  const { facing } = piece;
  if (!facing) return { cells: piece.cells, rock: () => false };
  const floor = env.dungeon.model.floors.find((f) => f.terrain.includes(piece)) ?? env.dungeon.floor;
  const ground = new Set(floor.rooms.flatMap((room) => room.cells ?? []).map((c) => `${c.x},${c.y}`));
  const own = cellSet(piece.cells);
  const behind = piece.cells
    .map((c) => ({ x: c.x + facing.x, y: c.y + facing.y }))
    .filter((c) => !own.has(`${c.x},${c.y}`) && !ground.has(`${c.x},${c.y}`));
  return { cells: [...piece.cells, ...behind], rock: (key) => !ground.has(key) };
}

/** The crack's outline: every ring of its cells walked, rounded and roughened, broken into chipped facets, then held near its cells. */
export function crackRings(env: RenderEnv, piece: DungeonTerrain): Vec[][] {
  const seed = env.dungeon.model.seed + piece.id * 17 + 811;
  const { cells, rock } = tracedCells(env, piece);
  return raggedCellRings(cells, seed, CRACK, (ring) => chiselled(resample(ring, FACET, 5), seed + 2, CHIP), cellSet(piece.cells), rock);
}
