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

/** Whether an edge of a square grid runs up and down: its normal points across. */
function isUpright(edge: LatticeEdge): boolean {
  return Math.abs(edge.nx) > Math.abs(edge.ny);
}

/** The index of the grid line an edge lies on, counted across its direction. */
function lineIndex(edge: LatticeEdge, candidate: LatticeCandidate): number {
  const position = isUpright(edge) ? (edge.x1 + edge.x2) / 2 - candidate.offsetX : (edge.y1 + edge.y2) / 2 - candidate.offsetY;
  return Math.round(position / candidate.cellSize);
}

/** Which of every `copies` lines in a row an edge lies on: 0 to `copies` - 1, counted from the grid's offset. */
function lineKind(edge: LatticeEdge, candidate: LatticeCandidate, copies: number): number {
  return ((lineIndex(edge, candidate) % copies) + copies) % copies;
}

/** A square grid's edges by direction: the upright ones, then the level ones. */
function byDirection(edges: LatticeEdge[]): [LatticeEdge[], LatticeEdge[]] {
  return [edges.filter(isUpright), edges.filter((edge) => !isUpright(edge))];
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
    const kind = lineKind(edge, candidate, copies);
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
  const [upright, level] = byDirection(lines.edges);
  let told = false;
  for (const copies of COPIES) {
    const verdicts = [skipsLines(upright, lines, candidate, copies), skipsLines(level, lines, candidate, copies)].filter((v): v is boolean => v !== null);
    if (verdicts.length === 0) continue;
    told = true;
    if (verdicts.every((skips) => skips)) return true;
  }
  return told ? false : null;
}

/**
 * Line spacings a lattice near the map's grid may share with it: one of n cells wide beside the
 * map's of n ± 1 has a line on every n-th of its own. The primes cover every n up to 12.
 */
const SHARED_EVERY = [2, 3, 5, 7, 11];
/** Hits that lie on lines of one kind, of all hits, from which the other kinds' lines are not the map's. */
const ONE_KIND_SHARE = 0.8;

/** Whether the hits of one direction's edges lie on every `copies`-th line alone; false with too few hits to tell. */
function hitsOneKind(edges: LatticeEdge[], { withLine, onLine, reach }: EdgesOnLines, candidate: LatticeCandidate, copies: number): boolean {
  const hit = new Array<number>(copies).fill(0);
  for (const edge of edges) {
    if (!onLine.has(edge)) continue;
    const kind = lineKind(edge, candidate, copies);
    hit[kind] = hit[kind]! + 1 - (withLine.has(edge) ? CHANCE_BAND / reach : 0);
  }
  const total = hit.reduce((sum, count) => sum + count, 0);
  return total >= MIN_HITS && Math.max(...hit) >= ONE_KIND_SHARE * total;
}

/**
 * Whether the square grid `candidate` only shares lines with the map's grid: in one of its
 * directions, the lines of the map lie on every n-th of its lines and on none between. A grid a
 * few percent larger or smaller than the map's own looks like that, and so does a multiple of it.
 */
export function sharesLinesOnly(image: GrayImage, candidate: LatticeCandidate): boolean {
  const lines = edgesOnLines(image, 'square', candidate);
  const directions = byDirection(lines.edges);
  return SHARED_EVERY.some((copies) => directions.some((edges) => hitsOneKind(edges, lines, candidate, copies)));
}
