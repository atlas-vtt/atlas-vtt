import type { DungeonTerrain } from '../../model';
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
 * (`vertical/pit.ts`).
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

/** The point moved back to `REACH` cells from the nearest of the cells, where it lies farther out. */
function heldToCells(p: Vec, cells: ReadonlySet<string>): Vec {
  const cx = Math.floor(p.x);
  const cy = Math.floor(p.y);
  if (cells.has(`${cx},${cy}`)) return p;
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

/** The crack's outline: every ring of its cells walked, rounded and roughened, broken into chipped facets, then held near its cells. */
export function crackRings(env: RenderEnv, piece: DungeonTerrain): Vec[][] {
  const seed = env.dungeon.model.seed + piece.id * 17 + 811;
  const cells = cellSet(piece.cells);
  return cellRings(piece.cells).map((ring) => {
    const k = Math.min(1, (perimeter(ring) * SIGMA_PER_CELL) / CRACK.sigma);
    const shape = { ...CRACK, sigma: CRACK.sigma * k, swell: CRACK.swell * k, rag: CRACK.rag * k, outwards: CRACK.outwards * k };
    return chiselled(resample(raggedRing(ring, seed, shape), FACET, 5), seed + 2, CHIP).map((p) => heldToCells(p, cells));
  });
}
