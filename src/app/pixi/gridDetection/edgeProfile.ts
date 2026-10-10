/**
 * Cell edges of a candidate grid and the line evidence across them.
 *
 * The image is averaged along an edge before anything is rectified, so a faint
 * line adds up coherently over the edge's length while texture averages out.
 * Both the lattice search and the lattice fit read the map through these profiles.
 */

import type { GridType } from '../../grid/GridSystem';
import { sampleBilinear } from './grayImage';
import type { GrayImage } from './grayImage';
import { gridLineSegments } from './gridTemplate';

/**
 * A grid on the squared-up image: the image turned level about its centre (`rotation`) and then its
 * rows brought `aspect` times closer together, where the map's cells are regular and its lines level.
 * Size, offsets and every edge are in that space; with `aspect` 1 and no rotation it is the image itself.
 */
export interface LatticeCandidate {
  cellSize: number;
  offsetX: number;
  offsetY: number;
  /** How many times further apart the image's rows lie than a regular grid's; unset is 1. */
  aspect?: number;
  /** The angle in radians by which the image is turned against a level grid, clockwise on screen (a scan that lay askew); unset is 0. */
  rotation?: number;
}

/** How the squared-up image of a candidate lies on the image itself. */
export interface LatticeFrame {
  aspect: number;
  cos: number;
  sin: number;
  /** The image's centre, which the rotation turns about. */
  centerX: number;
  centerY: number;
}

export function frameOf(image: GrayImage, candidate: LatticeCandidate): LatticeFrame {
  const rotation = rotationOf(candidate);
  return { aspect: aspectOf(candidate), cos: Math.cos(rotation), sin: Math.sin(rotation), centerX: image.width / 2, centerY: image.height / 2 };
}

const PLAIN_FRAME: LatticeFrame = { aspect: 1, cos: 1, sin: 0, centerX: 0, centerY: 0 };

export interface LatticeEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Unit normal of the edge. */
  nx: number;
  ny: number;
  /** Edge midpoint relative to the image centre, in cells. */
  cx: number;
  cy: number;
  /** Cell size and aspect of the grid the edge belongs to. */
  cellSize: number;
  aspect: number;
}

export function aspectOf(candidate: LatticeCandidate): number {
  return candidate.aspect ?? 1;
}

export function rotationOf(candidate: LatticeCandidate): number {
  return candidate.rotation ?? 0;
}

/** Distance between a line's centre and the flanks it is compared with; lines thicker than twice this lose contrast. */
const LINE_PROBE = 3;
/** Lines grow with their cells (a map of 300 px hexes is printed with lines of several pixels): the flanks lie at least this share of a cell away. */
const LINE_PROBE_PER_CELL = 1 / 32;

/** Distance between a line's centre and the flanks it is compared with, for a grid of `cellSize`. */
function lineProbe(cellSize: number): number {
  return Math.max(LINE_PROBE, Math.floor(cellSize * LINE_PROBE_PER_CELL));
}
/** Spacing of the samples averaged along an edge. */
const ALONG_STEP = 2;
/** Ends of an edge are left out: crossing lines and hex vertices disturb the profile there. */
const EDGE_TRIM = 0.1;

/**
 * Edges of the candidate grid whose whole measuring window (`reach` to either side)
 * lies inside the image, thinned evenly to at most `maxEdges`. Long lines are split
 * into edges of `edgeLength` (one cell by default) so a partly hidden line still
 * yields clean measurements.
 */
export function latticeEdges(
  image: GrayImage,
  gridType: GridType,
  candidate: LatticeCandidate,
  reach: number,
  maxEdges: number,
  edgeLength: number = candidate.cellSize,
): LatticeEdge[] {
  const { cellSize, offsetX, offsetY } = candidate;
  const frame = frameOf(image, candidate);
  const aspect = frame.aspect;
  const width = image.width;
  const height = image.height / aspect;
  const margin = reach + lineProbe(cellSize) + 2;
  const inside = (x: number, y: number): boolean => {
    if (frame.sin === 0) return x >= margin && y >= margin && x < width - margin && y < height - margin;
    // Turned, the squared-up image's rim lies partly off the image: the point itself must be on it.
    const qx = x - frame.centerX;
    const qy = y * aspect - frame.centerY;
    const px = frame.centerX + frame.cos * qx - frame.sin * qy;
    const py = frame.centerY + frame.sin * qx + frame.cos * qy;
    return px >= margin && py >= margin && px < image.width - margin && py < image.height - margin;
  };

  const edges: LatticeEdge[] = [];
  for (const s of gridLineSegments(gridType, cellSize, offsetX, offsetY, { minX: 0, minY: 0, maxX: width, maxY: height })) {
    const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const pieces = Math.max(1, Math.round(length / edgeLength));
    if (length / pieces < 2 * ALONG_STEP) continue;
    // One sign convention per direction, whichever way the drawer happened to trace the edge.
    const flip = s.y1 - s.y2 < -1e-9 || (Math.abs(s.y1 - s.y2) <= 1e-9 && s.x2 - s.x1 < 0) ? -1 : 1;
    const nx = (flip * (s.y1 - s.y2)) / length;
    const ny = (flip * (s.x2 - s.x1)) / length;
    for (let i = 0; i < pieces; i++) {
      const x1 = s.x1 + ((s.x2 - s.x1) * i) / pieces;
      const y1 = s.y1 + ((s.y2 - s.y1) * i) / pieces;
      const x2 = s.x1 + ((s.x2 - s.x1) * (i + 1)) / pieces;
      const y2 = s.y1 + ((s.y2 - s.y1) * (i + 1)) / pieces;
      if (!inside(x1, y1) || !inside(x2, y2)) continue;
      const cx = ((x1 + x2) / 2 - width / 2) / cellSize;
      const cy = ((y1 + y2) / 2 - height / 2) / cellSize;
      edges.push({ x1, y1, x2, y2, nx, ny, cx, cy, cellSize, aspect });
    }
  }
  const stride = Math.max(1, edges.length / maxEdges);
  return stride === 1 ? edges : Array.from({ length: maxEdges }, (_, i) => edges[Math.floor(i * stride)]!);
}

/** An edge is measured in this many pieces where it is long enough, and what most of them agree on counts. */
const EDGE_PIECES = 5;
/** Samples a piece needs for its average to mean anything. */
const MIN_PIECE_SAMPLES = 3;

/**
 * Line response at every `step` across an edge, from `-reach` to `+reach` along its
 * normal (index `reach / step` is the edge itself). The response is the contrast
 * between a point and its two flanks minus the flank asymmetry, so lines of either
 * polarity peak at their centre and plain steps in brightness do not count. The edge
 * lies on the squared-up image that `frame` places on the image.
 *
 * A long edge is measured in pieces, each averaged along its own length, and the
 * response is the mean of the middle ones: what lies across part of an edge (a terrain
 * icon on a hex map, a wall, a label) is far stronger than a grid line and would
 * otherwise set the whole edge's answer, while a line shows in most pieces.
 */
export function edgeResponse(image: GrayImage, edge: LatticeEdge, reach: number, step: number, frame: LatticeFrame = PLAIN_FRAME): Float32Array {
  const { aspect, cos, sin, centerX, centerY } = frame;
  const probe = Math.round(lineProbe(edge.cellSize) / step);
  const half = Math.round(reach / step);
  const width = 2 * (half + probe) + 1;
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const count = Math.max(2, Math.floor((Math.hypot(dx, dy) * (1 - 2 * EDGE_TRIM)) / ALONG_STEP));
  const pieces = count >= EDGE_PIECES * MIN_PIECE_SAMPLES ? EDGE_PIECES : 1;
  // One row of sums per piece.
  const profiles = new Float32Array(pieces * width);
  const samples = new Float32Array(pieces);
  for (let i = 0; i < count; i++) {
    const t = EDGE_TRIM + ((1 - 2 * EDGE_TRIM) * (i + 0.5)) / count;
    const px = edge.x1 + dx * t;
    const py = edge.y1 + dy * t;
    const piece = Math.floor((i * pieces) / count);
    const row = piece * width;
    samples[piece] = samples[piece]! + 1;
    for (let j = 0; j < width; j++) {
      const d = (j - half - probe) * step;
      const x = px + edge.nx * d;
      const y = (py + edge.ny * d) * aspect;
      profiles[row + j] = profiles[row + j]! + (sin === 0
        ? sampleBilinear(image, x, y)
        : sampleBilinear(image, centerX + cos * (x - centerX) - sin * (y - centerY), centerY + sin * (x - centerX) + cos * (y - centerY)));
    }
  }

  const response = new Float32Array(2 * half + 1);
  for (let j = 0; j < response.length; j++) {
    let sum = 0;
    let least = Infinity;
    let most = -Infinity;
    for (let piece = 0; piece < pieces; piece++) {
      const row = piece * width + j;
      const on = profiles[row + probe]!;
      const a = profiles[row]!;
      const b = profiles[row + 2 * probe]!;
      const answer = (Math.abs(on - (a + b) / 2) - Math.abs(a - b)) / samples[piece]!;
      sum += answer;
      if (answer < least) least = answer;
      if (answer > most) most = answer;
    }
    // The strongest and the weakest piece never count.
    response[j] = pieces === 1 ? sum : (sum - least - most) / (pieces - 2);
  }
  return response;
}

/**
 * Key shared by all edges of one direction: `latticeEdges` gives the edges of a
 * direction one common normal, and a line direction only counts modulo 180°.
 */
export function edgeDirectionKey(edge: LatticeEdge): number {
  const degrees = Math.round((Math.atan2(edge.ny, edge.nx) * 180) / Math.PI);
  return ((degrees % 180) + 180) % 180;
}

/**
 * How far a change of offset, size, aspect and rotation moves an edge along its normal. `dAspect` is
 * relative: rows that lie 1 % further apart than the candidate says move every line 1 % away from the
 * centre row. `dRotation` (radians) turns the image about its centre, which on the squared-up image
 * moves a point across by its height and down by its distance from the middle column.
 */
export function edgeShift(edge: LatticeEdge, dx: number, dy: number, dSize: number, dAspect = 0, dRotation = 0): number {
  const shift = edge.nx * dx + edge.ny * dy + (edge.nx * edge.cx + edge.ny * edge.cy) * dSize + edge.ny * edge.cy * edge.cellSize * dAspect;
  if (dRotation === 0) return shift;
  const turned = (edge.ny * edge.cx) / edge.aspect - edge.nx * edge.cy * edge.aspect;
  return shift + turned * edge.cellSize * dRotation;
}

/**
 * Size changes scale the grid about the image centre, where the edge coordinates are measured from.
 * A change of aspect squares the image up anew, which moves its centre row; the grid keeps its place on the map.
 */
export function moveCandidate(image: GrayImage, candidate: LatticeCandidate, dx: number, dy: number, dSize: number, dAspect = 0, dRotation = 0): LatticeCandidate {
  const cellSize = candidate.cellSize + dSize;
  const scale = cellSize / candidate.cellSize;
  const aspect = aspectOf(candidate);
  const centerX = image.width / 2;
  const centerY = image.height / aspect / 2;
  return {
    cellSize,
    offsetX: centerX + (candidate.offsetX - centerX) * scale + dx,
    offsetY: centerY + (candidate.offsetY - centerY) * scale + dy - (centerY * dAspect) / (1 + dAspect),
    aspect: aspect * (1 + dAspect),
    // The image turns about its centre, which is the centre of the squared-up image too: the grid keeps its place.
    rotation: rotationOf(candidate) + dRotation,
  };
}
