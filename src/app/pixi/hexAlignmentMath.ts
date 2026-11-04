/**
 * Hex Grid Alignment Math
 *
 * Each measurement is two corners of one hex. Meant is one hex edge (two
 * neighbouring corners), which fixes the lattice completely: its length is the
 * circumradius (size / sqrt(3)), its angle reveals the orientation, and the two
 * hexes sharing it sit one apothem (size / 2) to either side of its midpoint.
 * People also click the corners they see as "left and right": two corners with
 * one between them, or two opposite corners. Those pairs lie at other angles and
 * distances, so every way the pairs can be read is worked out
 * (`hexAlignmentCandidates`): the grid type the GM chose is tried before the
 * other orientation, and a hex edge before the other readings. The map's lines
 * decide between them where they can (`snapGridToMapGray`); the first is the answer otherwise.
 *
 * Multiple edges are fused by assigning every clicked corner to a lattice vertex
 * and solving for size and origin by least squares. Because the first edge only
 * gives a rough size, each further edge is tried against every lattice vertex
 * near its rough position (hex vertices come in two kinds, so candidates must be
 * vertices rather than whole-cell shifts) and the assignment with the smallest
 * joint residual wins. Far-apart edges then pin the size down with a long baseline.
 */

import type { AlignmentPoint, AlignmentResult, MeasurementPair } from './gridAlignmentMath';
import { axialToPixel, createHexLayout, hexCellExtent, hexOrientationForGridType, hexVertices, pixelToAxial } from '../grid/hexGeometry';
import type { AxialCoord, HexGridType, HexLayout, Point } from '../grid/hexGeometry';

const SQRT3 = Math.sqrt(3);
/** Relative uncertainty of a size estimated from short edges; drives the integer search radius. */
const SIZE_UNCERTAINTY = 0.08;
const MAX_SEARCH_RADIUS = 8;
/** Partial assignments kept alive while later edges disambiguate the scale. */
const BEAM_WIDTH = 6;

interface LatticeVertex {
  cell: AxialCoord;
  corner: number;
}

interface Sample {
  point: AlignmentPoint;
  vertex: LatticeVertex;
}

interface LatticeFit {
  size: number;
  /** Pixel centre of hex (0, 0). */
  center: Point;
  maxResidual: number;
}

/**
 * Which two corners of a hex a measurement names: the ends of one edge, two opposite corners, or two
 * corners with one between them, whose hex lies to either side of the line through them.
 */
type PairReading = 'edge' | 'opposite' | 'across' | 'across-far';

/** Flat-to-flat size of the hex as a multiple of the distance between the two corners. */
const SIZE_PER_LENGTH: Record<PairReading, number> = { edge: SQRT3, opposite: SQRT3 / 2, across: 1, 'across-far': 1 };

/** Edges of one orientation lie along the lines the corner-skipping pairs of the other do, so the angle names the readings. */
const READINGS_ALONG_EDGES: PairReading[] = ['edge', 'opposite'];
const READINGS_ACROSS: PairReading[] = ['across', 'across-far'];

function pairLength(pair: MeasurementPair): number {
  return Math.hypot(pair.b.x - pair.a.x, pair.b.y - pair.a.y);
}

/** Flat-to-flat size implied by one edge; edge length equals the circumradius. */
export function hexSizeFromEdge(pair: MeasurementPair): number {
  const length = pairLength(pair);
  return length < 1 ? 0 : length * SQRT3;
}

/**
 * Flat-top edges lie at multiples of 60°, pointy-top edges at 30° + multiples of 60°,
 * so six times the edge angle lands near 0° for flat and 180° for pointy.
 */
export function detectHexOrientation(pairs: MeasurementPair[], fallback: HexGridType): HexGridType {
  let cos = 0;
  let sin = 0;
  for (const { a, b } of pairs) {
    const angle = Math.atan2(b.y - a.y, b.x - a.x) * 6;
    cos += Math.cos(angle);
    sin += Math.sin(angle);
  }
  if (Math.hypot(cos, sin) < 0.5 * pairs.length) return fallback;
  return cos > 0 ? 'hex-horizontal' : 'hex-vertical';
}

function layoutFromCenter(type: HexGridType, size: number, center: Point): HexLayout {
  const extent = hexCellExtent({ orientation: hexOrientationForGridType(type), size, originX: 0, originY: 0 });
  return createHexLayout(type, size, center.x - extent.width / 2, center.y - extent.height / 2);
}

/** Position of a lattice vertex on a unit-size lattice centred at the origin. */
function unitPosition(type: HexGridType, vertex: LatticeVertex): Point {
  const unit = unitLayout(type);
  const center = axialToPixel(unit, vertex.cell);
  const corner = hexVertices(unit, { x: 0, y: 0 })[vertex.corner]!;
  return { x: center.x + corner.x, y: center.y + corner.y };
}

function nearestLatticeVertex(layout: HexLayout, point: AlignmentPoint): LatticeVertex {
  const cell = pixelToAxial(layout, point);
  const corners = hexVertices(layout, axialToPixel(layout, cell));
  let corner = 0;
  let best = Infinity;
  corners.forEach((c, i) => {
    const d = Math.hypot(c.x - point.x, c.y - point.y);
    if (d < best) {
      best = d;
      corner = i;
    }
  });
  return { cell, corner };
}

/** Least-squares size and origin for `point ≈ center + size * unitPosition`. */
function fitLattice(type: HexGridType, samples: Sample[]): LatticeFit | null {
  const units = samples.map((s) => unitPosition(type, s.vertex));
  const n = samples.length;
  const meanU = { x: 0, y: 0 };
  const meanP = { x: 0, y: 0 };
  samples.forEach((s, i) => {
    meanU.x += units[i]!.x / n;
    meanU.y += units[i]!.y / n;
    meanP.x += s.point.x / n;
    meanP.y += s.point.y / n;
  });

  let numerator = 0;
  let denominator = 0;
  samples.forEach((s, i) => {
    const du = { x: units[i]!.x - meanU.x, y: units[i]!.y - meanU.y };
    numerator += du.x * (s.point.x - meanP.x) + du.y * (s.point.y - meanP.y);
    denominator += du.x * du.x + du.y * du.y;
  });
  if (denominator < 1e-9) return null;

  const size = numerator / denominator;
  if (!(size > 0)) return null;
  const center = { x: meanP.x - size * meanU.x, y: meanP.y - size * meanU.y };

  let maxResidual = 0;
  samples.forEach((s, i) => {
    const residual = Math.hypot(center.x + size * units[i]!.x - s.point.x, center.y + size * units[i]!.y - s.point.y);
    maxResidual = Math.max(maxResidual, residual);
  });
  return { size, center, maxResidual };
}

function assign(type: HexGridType, fit: LatticeFit, points: AlignmentPoint[]): Sample[] {
  const layout = layoutFromCenter(type, fit.size, fit.center);
  return points.map((point) => ({ point, vertex: nearestLatticeVertex(layout, point) }));
}

function unitLayout(type: HexGridType): HexLayout {
  return layoutFromCenter(type, 1, { x: 0, y: 0 });
}

/** Distinct lattice vertices belonging to cells within `radius` of `base`. */
function verticesNear(type: HexGridType, base: LatticeVertex, radius: number): LatticeVertex[] {
  const seen = new Set<string>();
  const result: LatticeVertex[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = -radius; dr <= radius; dr++) {
      const cell = { q: base.cell.q + dq, r: base.cell.r + dr };
      for (let corner = 0; corner < 6; corner++) {
        const vertex = { cell, corner };
        const u = unitPosition(type, vertex);
        const key = `${u.x.toFixed(4)},${u.y.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(vertex);
      }
    }
  }
  return result;
}

/**
 * Every plausible assignment of the edge: each lattice vertex near its rough
 * position as the start corner, with the end corner following from the measured
 * edge vector.
 */
function edgeCandidates(type: HexGridType, fit: LatticeFit, pair: MeasurementPair): Sample[][] {
  const base = assign(type, fit, [pair.a, pair.b]);
  const distanceInCells = Math.hypot(pair.a.x - fit.center.x, pair.a.y - fit.center.y) / fit.size;
  const radius = Math.min(MAX_SEARCH_RADIUS, Math.ceil(distanceInCells * SIZE_UNCERTAINTY) + 1);
  const unit = unitLayout(type);
  const edgeInUnits = { x: (pair.b.x - pair.a.x) / fit.size, y: (pair.b.y - pair.a.y) / fit.size };

  return verticesNear(type, base[0]!.vertex, radius).map((startVertex) => {
    const start = unitPosition(type, startVertex);
    const endVertex = nearestLatticeVertex(unit, { x: start.x + edgeInUnits.x, y: start.y + edgeInUnits.y });
    return [
      { point: pair.a, vertex: startVertex },
      { point: pair.b, vertex: endVertex },
    ];
  });
}

interface Hypothesis {
  samples: Sample[];
  fit: LatticeFit;
}

function hypothesisKey(samples: Sample[]): string {
  return samples.map((s) => `${s.vertex.cell.q},${s.vertex.cell.r},${s.vertex.corner}`).join(';');
}

/**
 * Beam search over edge assignments. Two short edges far apart cannot tell
 * "N cells at size S" from "N+1 cells at a slightly smaller S", so the best few
 * partial assignments are kept until edges in other directions settle it.
 */
function fuseEdges(type: HexGridType, pairs: MeasurementPair[], seed: LatticeFit): Hypothesis {
  const first = assign(type, seed, [pairs[0]!.a, pairs[0]!.b]);
  let beam: Hypothesis[] = [{ samples: first, fit: fitLattice(type, first) ?? seed }];

  for (const pair of pairs.slice(1)) {
    const next = new Map<string, Hypothesis>();
    for (const hypothesis of beam) {
      for (const candidate of edgeCandidates(type, hypothesis.fit, pair)) {
        const samples = [...hypothesis.samples, ...candidate];
        const key = hypothesisKey(samples);
        if (next.has(key)) continue;
        const fit = fitLattice(type, samples);
        if (fit) next.set(key, { samples, fit });
      }
    }
    beam = [...next.values()].sort((a, b) => a.fit.maxResidual - b.fit.maxResidual).slice(0, BEAM_WIDTH);
  }

  return beam[0]!;
}

/**
 * Seed the lattice from the first pair. Its hex's centre lies on the perpendicular through the
 * pair's midpoint: an apothem away for an edge, on the midpoint for opposite corners, and half a
 * circumradius away for corners with one between them.
 */
function seedFromPair(pair: MeasurementPair, size: number, reading: PairReading): LatticeFit {
  const dx = pair.b.x - pair.a.x;
  const dy = pair.b.y - pair.a.y;
  const length = Math.hypot(dx, dy);
  const halfRadius = size / SQRT3 / 2;
  const distance = { edge: size / 2, opposite: 0, across: halfRadius, 'across-far': -halfRadius }[reading];
  return {
    size,
    center: {
      x: (pair.a.x + pair.b.x) / 2 - (dy / length) * distance,
      y: (pair.a.y + pair.b.y) / 2 + (dx / length) * distance,
    },
    maxResidual: 0,
  };
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** The lattice of `type` that the pairs give when each is read as `reading`. */
function alignmentFor(pairs: MeasurementPair[], type: HexGridType, reading: PairReading): AlignmentResult {
  const roughSize = (pairs.reduce((sum, pair) => sum + pairLength(pair), 0) / pairs.length) * SIZE_PER_LENGTH[reading];

  const best = fuseEdges(type, pairs, seedFromPair(pairs[0]!, roughSize, reading));
  // Polish: re-assign every corner under the fused lattice and fit once more.
  const polished = assign(type, best.fit, best.samples.map((s) => s.point));
  const fit = fitLattice(type, polished) ?? best.fit;

  // Re-base so hex (0, 0) is the one containing the world origin, keeping offsets small.
  const layout = layoutFromCenter(type, fit.size, fit.center);
  const anchor = axialToPixel(layout, pixelToAxial(layout, { x: 0, y: 0 }));
  const extent = hexCellExtent(layout);

  return {
    cellSize: round2(fit.size),
    offsetX: round2(anchor.x - extent.width / 2),
    offsetY: round2(anchor.y - extent.height / 2),
    gridType: type,
    maxResidual: round2(fit.maxResidual),
  };
}

function otherOrientation(type: HexGridType): HexGridType {
  return type === 'hex-vertical' ? 'hex-horizontal' : 'hex-vertical';
}

/**
 * Every hex grid 1–n corner pairs can stand for, the likeliest first: grids of `type`, the one the
 * GM chose, before the other orientation's, and within a type the reading whose lattice the clicked
 * corners fit best, a hex edge before the others where they fit alike (a single pair fits all).
 * The first is the answer where the map's lines cannot decide; none for a pair of one point.
 */
export function hexAlignmentCandidates(pairs: MeasurementPair[], type: HexGridType): AlignmentResult[] {
  if (pairs.length === 0 || pairs.some((pair) => pairLength(pair) < 1)) return [];
  const edgesOfType = detectHexOrientation(pairs, type) === type;
  const byFit = (readings: PairReading[], gridType: HexGridType): AlignmentResult[] =>
    readings
      .map((reading) => alignmentFor(pairs, gridType, reading))
      // Array.prototype.sort is stable: readings that fit alike keep their order.
      .sort((a, b) => (a.maxResidual ?? 0) / a.cellSize - (b.maxResidual ?? 0) / b.cellSize);
  return [
    ...byFit(edgesOfType ? READINGS_ALONG_EDGES : READINGS_ACROSS, type),
    ...byFit(edgesOfType ? READINGS_ACROSS : READINGS_ALONG_EDGES, otherOrientation(type)),
  ];
}
