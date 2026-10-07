import { EDGE_MARGIN, EPSILON } from './cellNumbering';
import type { CellLattice, MapRect, PlacedCell } from './cellNumbering';
import { squareOffset } from './gridOrigin';

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** The lattice of a square grid: cells addressed by integer column and row. */
export function squareLattice(size: number, offsetX: number, offsetY: number): CellLattice {
  return {
    size,
    cellsOnMap(map: MapRect): PlacedCell[] {
      // Whole cells away the squares are the same; their keys are this lattice's own.
      return squaresOnMap(size, squareOffset(offsetX, size), squareOffset(offsetY, size), map);
    },
  };
}

/** The squares on the map with their 0-based row and column, counted from the first whole square. */
function squaresOnMap(size: number, offsetX: number, offsetY: number, map: MapRect): PlacedCell[] {
  const margin = EDGE_MARGIN * size;

  const firstCol = Math.ceil((map.x + margin - offsetX) / size - 0.5 - EPSILON);
  const lastCol = Math.floor((map.x + map.width - margin - offsetX) / size - 0.5 + EPSILON);
  const firstRow = Math.ceil((map.y + margin - offsetY) / size - 0.5 - EPSILON);
  const lastRow = Math.floor((map.y + map.height - margin - offsetY) / size - 0.5 + EPSILON);

  const cells: PlacedCell[] = [];
  for (let r = firstRow; r <= lastRow; r++) {
    for (let col = firstCol; col <= lastCol; col++) {
      cells.push({
        key: cellKey(col, r),
        center: { x: offsetX + (col + 0.5) * size, y: offsetY + (r + 0.5) * size },
        row: r - firstRow,
        column: col - firstCol,
      });
    }
  }
  return cells;
}
