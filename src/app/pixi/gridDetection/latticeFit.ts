/**
 * Sub-pixel lattice fit.
 *
 * Every cell edge of a candidate grid is measured on its own, which gives the
 * distance between where the grid predicts a line and where the map really has
 * one. Because every grid point is `origin + size * latticeCoordinate`, those
 * distances are linear in the three unknowns (size and the two offsets), so one
 * robust least-squares solve places the whole grid on thousands of measurements
 * at once. It is the manual alignment tool with every edge of the map clicked.
 *
 * A map whose cells are not regular (hexes printed a few percent too tall, squares
 * that are rectangles) has a fourth unknown, the aspect of its cells. To first
 * order it moves every line in proportion to its distance from the centre row, so
 * it is solved along with the others when asked for (`freeAspect`).
 *
 * Edges that are hidden or that lock on to map art are outliers; a Tukey weight
 * with a shrinking cutoff removes them, and the measuring window narrows from
 * pass to pass as the fit closes in.
 */

import type { GridType } from '../../grid/GridSystem';
import type { GrayImage } from './grayImage';
import { aspectOf, edgeDirectionKey, edgeResponse, edgeShift, latticeEdges, moveCandidate } from './edgeProfile';
import type { LatticeCandidate, LatticeEdge } from './edgeProfile';

interface EdgeMeasurement {
  edge: LatticeEdge;
  /** Signed distance along the normal from the predicted edge to the measured line. */
  shift: number;
  /** Line contrast at the measured position. */
  strength: number;
}

interface LatticeDelta {
  dx: number;
  dy: number;
  dSize: number;
  dAspect: number;
}

const NO_CHANGE: LatticeDelta = { dx: 0, dy: 0, dSize: 0, dAspect: 0 };

/** Resolution of the profile measured across an edge. */
const PROFILE_STEP = 0.5;
/** Tightest outlier cutoff; measurements further than this from the fit carry no weight in the last solve. */
const MIN_CUTOFF = 0.75;
/** The measuring window may never reach the neighbouring line. */
const MAX_REACH_IN_CELLS = 0.3;
/** Upper bound on the edges measured per pass; a few thousand spread over the map already pin the lattice down to a hundredth of a pixel. */
const MAX_EDGES = 2500;
const REACH_SCHEDULE = [8, 4, 2];
/** A change of aspect turns slanted edges a little, which the linear solve leaves out: one more pass at the narrowest window takes it up. */
const FREE_ASPECT_SCHEDULE = [...REACH_SCHEDULE, 2];
/** Window used to tell real lines from chance hits when scoring a finished fit. */
const SUPPORT_REACH = 6;
/** Excess of on-line edges over chance, in standard deviations, below which support counts as zero. */
const MIN_SUPPORT_SIGMAS = 5;

/** Locates the line across one edge within `reach` pixels of its predicted position, to a fraction of a profile step. */
function measureEdge(image: GrayImage, edge: LatticeEdge, reach: number, aspect: number): EdgeMeasurement | null {
  const response = edgeResponse(image, edge, reach, PROFILE_STEP, aspect);
  let peak = -1;
  let strength = 0;
  for (let j = 0; j < response.length; j++) {
    if (response[j]! > strength) {
      strength = response[j]!;
      peak = j;
    }
  }
  // A peak on the window border is the flank of something outside the window.
  if (peak <= 0 || peak >= response.length - 1) return null;

  const before = response[peak - 1]!;
  const after = response[peak + 1]!;
  const curvature = before - 2 * strength + after;
  const subStep = curvature < 0 ? (0.5 * (before - after)) / curvature : 0;
  return { edge, shift: (peak - (response.length - 1) / 2 + subStep) * PROFILE_STEP, strength };
}

function measureEdges(image: GrayImage, edges: LatticeEdge[], reach: number, aspect: number): EdgeMeasurement[] {
  return edges.map((edge) => measureEdge(image, edge, reach, aspect)).filter((m): m is EdgeMeasurement => m !== null);
}

/** Solves `a x = b` for a small symmetric system by Gaussian elimination with pivoting; null when it is singular. */
function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, r) => [...row, b[r]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-9) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = col + 1; r < n; r++) {
      const factor = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c++) m[r]![c] = m[r]![c]! - factor * m[col]![c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = m[r]![n]!;
    for (let c = r + 1; c < n; c++) sum -= m[r]![c]! * x[c]!;
    x[r] = sum / m[r]![r]!;
  }
  return x;
}

/** Weighted least squares for the lattice unknowns: the two offsets, the size and, with `freeAspect`, the aspect. */
function solveLattice(measurements: EdgeMeasurement[], weights: Float64Array, freeAspect: boolean): LatticeDelta | null {
  const unknowns = freeAspect ? 4 : 3;
  const ata = Array.from({ length: unknowns }, () => new Array<number>(unknowns).fill(0));
  const atb = new Array<number>(unknowns).fill(0);
  measurements.forEach((m, i) => {
    const w = weights[i]!;
    if (w <= 0) return;
    const row = [m.edge.nx, m.edge.ny, edgeShift(m.edge, 0, 0, 1), edgeShift(m.edge, 0, 0, 0, 1)];
    for (let r = 0; r < unknowns; r++) {
      atb[r] = atb[r]! + w * row[r]! * m.shift;
      for (let c = 0; c < unknowns; c++) ata[r]![c] = ata[r]![c]! + w * row[r]! * row[c]!;
    }
  });
  const solved = solveLinear(ata, atb);
  return solved ? { dx: solved[0]!, dy: solved[1]!, dSize: solved[2]!, dAspect: solved[3] ?? 0 } : null;
}

/** Robust solve on one set of measurements: the outlier cutoff shrinks from the window size to a sub-pixel band. */
function robustDelta(measurements: EdgeMeasurement[], reach: number, freeAspect: boolean): LatticeDelta {
  const strengths = measurements.map((m) => m.strength).sort((a, b) => a - b);
  const strongEdge = strengths[Math.floor(strengths.length * 0.75)] ?? 1;

  let delta = NO_CHANGE;
  const weights = new Float64Array(measurements.length);
  for (const cutoff of [reach, reach / 2, Math.max(reach / 4, MIN_CUTOFF), MIN_CUTOFF]) {
    measurements.forEach((m, i) => {
      const u = (m.shift - edgeShift(m.edge, delta.dx, delta.dy, delta.dSize, delta.dAspect)) / cutoff;
      weights[i] = Math.abs(u) < 1 ? (1 - u * u) ** 2 * Math.min(1, m.strength / strongEdge) : 0;
    });
    delta = solveLattice(measurements, weights, freeAspect) ?? delta;
  }
  return delta;
}

function clampReach(reach: number, cellSize: number): number {
  return Math.max(1.5, Math.min(reach, cellSize * MAX_REACH_IN_CELLS));
}

/**
 * Share of the grid's edges that have a line exactly where the grid predicts one,
 * corrected for chance: a peak found anywhere in the window lands inside the
 * tolerance band `tolerance / reach` of the time even on a map without a grid.
 * 0 means no better than chance, 1 means every edge of the grid is on a line.
 * The weakest edge direction counts: a grid of another type can share the lines
 * of one direction, but not of all of them. Longer edges average more of the map
 * and find fainter lines, so grids of different sizes are only comparable when
 * measured with the same `edgeLength`.
 */
export function latticeSupport(image: GrayImage, gridType: GridType, candidate: LatticeCandidate, edgeLength: number = candidate.cellSize): number {
  const reach = clampReach(SUPPORT_REACH, candidate.cellSize);
  const chance = MIN_CUTOFF / reach;
  const edges = latticeEdges(image, gridType, candidate, reach, MAX_EDGES, edgeLength);
  const onLine = new Set(measureEdges(image, edges, reach, aspectOf(candidate)).filter((m) => Math.abs(m.shift) < MIN_CUTOFF).map((m) => m.edge));

  const directions = new Map<number, { edges: number; onLine: number }>();
  for (const edge of edges) {
    const key = edgeDirectionKey(edge);
    const tally = directions.get(key) ?? { edges: 0, onLine: 0 };
    tally.edges++;
    if (onLine.has(edge)) tally.onLine++;
    directions.set(key, tally);
  }

  let support = directions.size > 0 ? 1 : 0;
  for (const tally of directions.values()) {
    const excess = tally.onLine / tally.edges - chance;
    // With few edges a handful of chance hits looks like a grid; demand a clear excess over the binomial noise.
    const noise = Math.sqrt((chance * (1 - chance)) / tally.edges);
    support = Math.min(support, excess < MIN_SUPPORT_SIGMAS * noise ? 0 : excess / (1 - chance));
  }
  return support;
}

export interface LatticeFit {
  candidate: LatticeCandidate;
  support: number;
}

/**
 * Refines a candidate that is good to a few pixels into a sub-pixel fit over the whole map.
 * `freeAspect` also fits the aspect of the map's cells; without it the candidate's own is kept.
 */
export function fitLattice(image: GrayImage, gridType: GridType, start: LatticeCandidate, freeAspect = false): LatticeFit {
  let candidate = start;
  for (const scheduled of freeAspect ? FREE_ASPECT_SCHEDULE : REACH_SCHEDULE) {
    const reach = clampReach(scheduled, candidate.cellSize);
    const measurements = measureEdges(image, latticeEdges(image, gridType, candidate, reach, MAX_EDGES), reach, aspectOf(candidate));
    if (measurements.length < (freeAspect ? 4 : 3)) break;
    const delta = robustDelta(measurements, reach, freeAspect);
    candidate = moveCandidate(image, candidate, delta.dx, delta.dy, delta.dSize, delta.dAspect);
  }
  return { candidate, support: latticeSupport(image, gridType, candidate) };
}
