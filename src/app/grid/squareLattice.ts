import { EDGE_MARGIN, EPSILON } from './cellNumbering';
import type { CellLattice, CellLines, MapRect, PlacedCell } from './cellNumbering';

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** The lattice of a square grid: cells addressed by integer column and row. */
export function squareLattice(size: number, offsetX: number, offsetY: number): CellLattice {
  const grid: SquareGrid = { size, offsetX, offsetY };
  return {
    size,
    cellsOnMap(map: MapRect): PlacedCell[] {
      const span = squaresOnMap(grid, map);
      return placeSquares(grid, span, span);
    },
    cellsInRect(map: MapRect, rect: MapRect): PlacedCell[] {
      const span = squaresOnMap(grid, map);
      return placeSquares(grid, span, within(span, squaresCentredIn(grid, rect)));
    },
    linesOnMap(map: MapRect): CellLines {
      const span = squaresOnMap(grid, map);
      const rows = Math.max(0, span.lastRow - span.firstRow + 1);
      const columns = Math.max(0, span.lastCol - span.firstCol + 1);
      return { lineIsRow: true, counts: new Array<number>(rows).fill(columns) };
    },
  };
}

interface SquareGrid {
  size: number;
  offsetX: number;
  offsetY: number;
}

/** A block of squares by their lattice columns and rows, inclusive. */
interface SquareSpan {
  firstCol: number;
  lastCol: number;
  firstRow: number;
  lastRow: number;
}

/** The squares on the map: those whose centre lies `EDGE_MARGIN` of a cell inside every edge. */
function squaresOnMap({ size, offsetX, offsetY }: SquareGrid, map: MapRect): SquareSpan {
  const margin = EDGE_MARGIN * size;
  return {
    firstCol: Math.ceil((map.x + margin - offsetX) / size - 0.5 - EPSILON),
    lastCol: Math.floor((map.x + map.width - margin - offsetX) / size - 0.5 + EPSILON),
    firstRow: Math.ceil((map.y + margin - offsetY) / size - 0.5 - EPSILON),
    lastRow: Math.floor((map.y + map.height - margin - offsetY) / size - 0.5 + EPSILON),
  };
}

/** The squares whose centre lies in `rect`. */
function squaresCentredIn({ size, offsetX, offsetY }: SquareGrid, rect: MapRect): SquareSpan {
  return {
    firstCol: Math.ceil((rect.x - offsetX) / size - 0.5),
    lastCol: Math.floor((rect.x + rect.width - offsetX) / size - 0.5),
    firstRow: Math.ceil((rect.y - offsetY) / size - 0.5),
    lastRow: Math.floor((rect.y + rect.height - offsetY) / size - 0.5),
  };
}

function within(outer: SquareSpan, inner: SquareSpan): SquareSpan {
  return {
    firstCol: Math.max(outer.firstCol, inner.firstCol),
    lastCol: Math.min(outer.lastCol, inner.lastCol),
    firstRow: Math.max(outer.firstRow, inner.firstRow),
    lastRow: Math.min(outer.lastRow, inner.lastRow),
  };
}

/** The squares of `span` with their 0-based row and column, counted from the map's first whole square. */
function placeSquares({ size, offsetX, offsetY }: SquareGrid, map: SquareSpan, span: SquareSpan): PlacedCell[] {
  const cells: PlacedCell[] = [];
  for (let r = span.firstRow; r <= span.lastRow; r++) {
    for (let col = span.firstCol; col <= span.lastCol; col++) {
      cells.push({
        key: cellKey(col, r),
        center: { x: offsetX + (col + 0.5) * size, y: offsetY + (r + 0.5) * size },
        row: r - map.firstRow,
        column: col - map.firstCol,
      });
    }
  }
  return cells;
}
