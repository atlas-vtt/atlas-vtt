/**
 * Telling a square grid from a finer copy of it.
 *
 * A grid of half the map's cell size has every second of its lines on a line of the map and the
 * lines between on none. Where the map's grid covers it, counting all edges shows that: half are
 * missing. Where the grid is drawn on the floors of a dungeon alone, most edges of any grid are
 * missing, and the count tells nothing. What still tells is which lines are hit: of a finer copy
 * only every second (third, fifth) line ever is.
 */

import type { GrayImage } from './grayImage';
import type { LatticeCandidate, LatticeEdge } from './edgeProfile';
import { CHANCE_BAND, edgesOnLines } from './latticeFit';
import type { EdgesOnLines } from './latticeFit';

/** Finer copies looked for: a grid whose lines are every second, third or fifth of the candidate's. */
const COPIES = [2, 3, 5];
/** Lines of one kind (every k-th, counted from one of them) hit this much more rarely than the best kind are not lines of the map. */
const MISSING_RATE = 0.5;
/** Edges on a line beyond chance that a direction needs before its lines can be told apart. */
const MIN_HITS = 16;

/** The index of the grid line an edge lies on, counted across its direction. */
function lineIndex(edge: LatticeEdge, candidate: LatticeCandidate): number {
  const upright = Math.abs(edge.nx) > Math.abs(edge.ny);
  const position = upright ? (edge.x1 + edge.x2) / 2 - candidate.offsetX : (edge.y1 + edge.y2) / 2 - candidate.offsetY;
  return Math.round(position / candidate.cellSize);
}

/**
 * Whether every `copies`-th line of one direction's edges is hit and the lines between hardly ever;
 * null with too few hits to tell. Hits are counted beyond what chance gives the edges that show a
 * line (hatching, walls, stairs lie on any grid now and then).
 */
function skipsLines(edges: LatticeEdge[], { withLine, onLine, reach }: EdgesOnLines, candidate: LatticeCandidate, copies: number): boolean | null {
  const all = new Array<number>(copies).fill(0);
  const chance = new Array<number>(copies).fill(0);
  const hit = new Array<number>(copies).fill(0);
  for (const edge of edges) {
    const kind = ((lineIndex(edge, candidate) % copies) + copies) % copies;
    all[kind] = all[kind]! + 1;
    if (withLine.has(edge)) chance[kind] = chance[kind]! + CHANCE_BAND / reach;
    if (onLine.has(edge)) hit[kind] = hit[kind]! + 1;
  }
  if (all.some((count) => count === 0)) return null;
  const beyondChance = hit.map((count, kind) => Math.max(0, count - chance[kind]!));
  if (beyondChance.reduce((sum, count) => sum + count, 0) < MIN_HITS) return null;
  const rates = beyondChance.map((count, kind) => count / all[kind]!);
  return Math.min(...rates) < MISSING_RATE * Math.max(...rates);
}

/**
 * Whether the square grid `candidate` is a finer copy of the map's grid: in every direction that
 * shows enough lines to tell, only every second (third, fifth) of its lines is ever on one. Null
 * where no direction shows enough.
 */
export function isFinerCopy(image: GrayImage, candidate: LatticeCandidate): boolean | null {
  const lines = edgesOnLines(image, 'square', candidate);
  const upright = lines.edges.filter((edge) => Math.abs(edge.nx) > Math.abs(edge.ny));
  const level = lines.edges.filter((edge) => Math.abs(edge.nx) <= Math.abs(edge.ny));
  let told = false;
  for (const copies of COPIES) {
    const verdicts = [skipsLines(upright, lines, candidate, copies), skipsLines(level, lines, candidate, copies)].filter((v): v is boolean => v !== null);
    if (verdicts.length === 0) continue;
    told = true;
    if (verdicts.every((skips) => skips)) return true;
  }
  return told ? false : null;
}
