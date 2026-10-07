import { drawStyledSegment, drawVertexMarker, gridMarkerArmLength } from './gridLineStyle';
import type { GridBounds, GridLineType, GridPath } from './gridLineStyle';
import { hexCircumradius, hexOriginCenter } from './hexGeometry';
import type { HexLayout, Point } from './hexGeometry';
import { hexLayoutNearZero } from './gridOrigin';

/**
 * One row (pointy) or column (flat) of hex centers. `along` runs parallel to the
 * line, `across` is perpendicular; `alongAt(index)` includes the half-cell phase
 * shift of alternate lines. The trailing line lies just past the last real one
 * and only contributes its leading zig-zag (the closing side of the last row).
 */
interface LatticeLine {
  across: number;
  alongAt: (index: number) => number;
  firstHex: number;
  lastHex: number;
  isTrailing: boolean;
}

interface HexLattice {
  size: number;
  radius: number;
  toLocal(along: number, across: number): Point;
  toDirection(along: number, across: number): Point;
  lines(): Iterable<LatticeLine>;
}

function createLattice(bounds: GridBounds, layout: HexLayout): HexLattice {
  const size = layout.size;
  const radius = hexCircumradius(size);
  const rowSpacing = 1.5 * radius;
  const origin = hexOriginCenter(layout);
  const isPointy = layout.orientation === 'pointy';

  const alongOrigin = isPointy ? origin.x : origin.y;
  const acrossOrigin = isPointy ? origin.y : origin.x;
  const alongMin = isPointy ? bounds.minX : bounds.minY;
  const alongMax = isPointy ? bounds.maxX : bounds.maxY;
  const acrossMin = isPointy ? bounds.minY : bounds.minX;
  const acrossMax = isPointy ? bounds.maxY : bounds.maxX;

  const firstLine = Math.floor((acrossMin - acrossOrigin) / rowSpacing) - 1;
  const lastLine = Math.ceil((acrossMax - acrossOrigin) / rowSpacing) + 1;

  return {
    size,
    radius,
    toLocal: (along, across) =>
      isPointy ? { x: along - bounds.minX, y: across - bounds.minY } : { x: across - bounds.minX, y: along - bounds.minY },
    toDirection: (along, across) => (isPointy ? { x: along, y: across } : { x: across, y: along }),
    *lines() {
      for (let line = firstLine; line <= lastLine + 1; line++) {
        const phase = line / 2;
        yield {
          across: acrossOrigin + rowSpacing * line,
          alongAt: (index: number): number => alongOrigin + size * (index + phase),
          firstHex: Math.floor((alongMin - alongOrigin) / size - phase) - 1,
          lastHex: Math.ceil((alongMax - alongOrigin) / size - phase) + 1,
          isTrailing: line > lastLine,
        };
      }
    },
  };
}

/**
 * Every edge is emitted exactly once: each line contributes one zig-zag along its
 * leading side plus one straight edge per hex on that side. The trailing side of
 * a line is the leading zig-zag of the next one, so nothing is double-drawn.
 */
function drawEdges(graphics: GridPath, lattice: HexLattice, lineType: GridLineType): void {
  const { size, radius } = lattice;
  const segment = (a1: number, c1: number, a2: number, c2: number): void => {
    const p1 = lattice.toLocal(a1, c1);
    const p2 = lattice.toLocal(a2, c2);
    drawStyledSegment(graphics, p1.x, p1.y, p2.x, p2.y, lineType);
  };

  for (const { across, alongAt, firstHex, lastHex, isTrailing } of lattice.lines()) {
    for (let index = firstHex; index <= lastHex; index++) {
      const along = alongAt(index);
      segment(along - size / 2, across - radius / 2, along, across - radius);
      segment(along, across - radius, along + size / 2, across - radius / 2);
    }
    if (isTrailing) continue;
    for (let index = firstHex; index <= lastHex + 1; index++) {
      const edge = alongAt(index) - size / 2;
      segment(edge, across - radius / 2, edge, across + radius / 2);
    }
  }
}

/** One crow's-foot marker per lattice vertex, enumerated the same way the zig-zags are. */
function drawVertexMarkers(graphics: GridPath, lattice: HexLattice, thickness: number, arm: number): void {
  const { size, radius } = lattice;
  const cos30 = Math.sqrt(3) / 2;
  // The lattice has two vertex kinds; their three incident edges point in these directions.
  const outerArms = [lattice.toDirection(0, -1), lattice.toDirection(cos30, 0.5), lattice.toDirection(-cos30, 0.5)];
  const sharedArms = [lattice.toDirection(-cos30, -0.5), lattice.toDirection(cos30, -0.5), lattice.toDirection(0, 1)];

  for (const { across, alongAt, firstHex, lastHex } of lattice.lines()) {
    for (let index = firstHex; index <= lastHex + 1; index++) {
      const along = alongAt(index);
      const shared = lattice.toLocal(along - size / 2, across - radius / 2);
      drawVertexMarker(graphics, shared.x, shared.y, sharedArms, arm, thickness);
      if (index > lastHex) break;
      const outer = lattice.toLocal(along, across - radius);
      drawVertexMarker(graphics, outer.x, outer.y, outerArms, arm, thickness);
    }
  }
}

/**
 * Draws a hex grid into `graphics` using coordinates local to `bounds.minX/minY`.
 * For solid/dashed styles the caller strokes the path; for the dotted style the
 * caller fills it, because vertex markers are filled polygons.
 */
export function drawHexGrid(
  graphics: GridPath,
  bounds: GridBounds,
  layout: HexLayout,
  lineType: GridLineType,
  markerThickness: number = 1,
  markerArm: number = gridMarkerArmLength(layout.size),
): void {
  // Whole repeats away the lattice is the same; next to zero, every step stays exact (`gridOrigin.ts`).
  const lattice = createLattice(bounds, hexLayoutNearZero(layout));
  if (lineType === 'dotted') {
    drawVertexMarkers(graphics, lattice, markerThickness, markerArm);
  } else {
    drawEdges(graphics, lattice, lineType);
  }
}
