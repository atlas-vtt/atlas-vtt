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
 * A grid on the squared-up image: the image with its rows `aspect` times closer together, where the
 * map's cells are regular. Size, offsets and every edge are in that space; `aspect` 1 is the image itself.
 */
export interface LatticeCandidate {
  cellSize: number;
  offsetX: number;
  offsetY: number;
  /** How many times further apart the image's rows lie than a regular grid's; unset is 1. */
  aspect?: number;
}

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
  /** Cell size of the grid the edge belongs to. */
  cellSize: number;
}

export function aspectOf(candidate: LatticeCandidate): number {
  return candidate.aspect ?? 1;
}

/** Distance between a line's centre and the flanks it is compared with; lines thicker than twice this lose contrast. */
const LINE_PROBE = 3;
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
  const width = image.width;
  const height = image.height / aspectOf(candidate);
  const margin = reach + LINE_PROBE + 2;
  const inside = (x: number, y: number): boolean => x >= margin && y >= margin && x < width - margin && y < height - margin;

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
      edges.push({ x1, y1, x2, y2, nx, ny, cx, cy, cellSize });
    }
  }
  const stride = Math.max(1, edges.length / maxEdges);
  return stride === 1 ? edges : Array.from({ length: maxEdges }, (_, i) => edges[Math.floor(i * stride)]!);
}

/**
 * Line response at every `step` across an edge, from `-reach` to `+reach` along its
 * normal (index `reach / step` is the edge itself). The response is the contrast
 * between a point and its two flanks minus the flank asymmetry, so lines of either
 * polarity peak at their centre and plain steps in brightness do not count. The edge
 * lies on the squared-up image of `aspect`.
 */
export function edgeResponse(image: GrayImage, edge: LatticeEdge, reach: number, step: number, aspect = 1): Float32Array {
  const probe = Math.round(LINE_PROBE / step);
  const half = Math.round(reach / step);
  const profile = new Float32Array(2 * (half + probe) + 1);
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const count = Math.max(2, Math.floor((Math.hypot(dx, dy) * (1 - 2 * EDGE_TRIM)) / ALONG_STEP));
  for (let i = 0; i < count; i++) {
    const t = EDGE_TRIM + ((1 - 2 * EDGE_TRIM) * (i + 0.5)) / count;
    const px = edge.x1 + dx * t;
    const py = edge.y1 + dy * t;
    for (let j = 0; j < profile.length; j++) {
      const d = (j - half - probe) * step;
      profile[j] = profile[j]! + sampleBilinear(image, px + edge.nx * d, (py + edge.ny * d) * aspect);
    }
  }

  const response = new Float32Array(2 * half + 1);
  for (let j = 0; j < response.length; j++) {
    const on = profile[j + probe]!;
    const a = profile[j]!;
    const b = profile[j + 2 * probe]!;
    response[j] = (Math.abs(on - (a + b) / 2) - Math.abs(a - b)) / count;
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
 * How far a change of offset, size and aspect moves an edge along its normal. `dAspect` is relative:
 * rows that lie 1 % further apart than the candidate says move every line 1 % away from the centre row.
 */
export function edgeShift(edge: LatticeEdge, dx: number, dy: number, dSize: number, dAspect = 0): number {
  return edge.nx * dx + edge.ny * dy + (edge.nx * edge.cx + edge.ny * edge.cy) * dSize + edge.ny * edge.cy * edge.cellSize * dAspect;
}

/**
 * Size changes scale the grid about the image centre, where the edge coordinates are measured from.
 * A change of aspect squares the image up anew, which moves its centre row; the grid keeps its place on the map.
 */
export function moveCandidate(image: GrayImage, candidate: LatticeCandidate, dx: number, dy: number, dSize: number, dAspect = 0): LatticeCandidate {
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
  };
}
