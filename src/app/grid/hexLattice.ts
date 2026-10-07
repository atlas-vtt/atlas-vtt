import { axialToPixel, hexCircumradius, hexOriginCenter } from './hexGeometry';
import type { AxialCoord, HexLayout } from './hexGeometry';
import { EDGE_MARGIN, EPSILON } from './cellNumbering';
import type { CellLattice, MapRect, PlacedCell } from './cellNumbering';
import { hexLayoutNearZero } from './gridOrigin';
import { MAX_GRID_OFFSET } from './gridLimits';

export function axialKey(coord: AxialCoord): string {
  return `${coord.q},${coord.r}`;
}

/** The lattice of a hex grid: cells addressed by axial coordinates. */
export function hexLattice(layout: HexLayout): CellLattice {
  return {
    size: layout.size,
    cellsOnMap(map: MapRect): PlacedCell[] {
      return hexesOnMap(layout, map);
    },
  };
}

/**
 * The hexes on the map with their 0-based row and column. Lines are the grid's
 * columns on flat-top grids and its rows on pointy-top grids; each line counts
 * from its first hex on the map, which follows the half-cell stagger.
 */
function hexesOnMap(given: HexLayout, map: MapRect): PlacedCell[] {
  // An origin far from the map never lets the steps below advance; its keys only matter for an origin Atlas accepts.
  const layout = Math.abs(given.originX) > MAX_GRID_OFFSET || Math.abs(given.originY) > MAX_GRID_OFFSET ? hexLayoutNearZero(given) : given;
  const isPointy = layout.orientation === 'pointy';
  const size = layout.size;
  const lineSpacing = 1.5 * hexCircumradius(size);
  const origin = hexOriginCenter(layout);
  const margin = EDGE_MARGIN * size;

  const acrossOrigin = isPointy ? origin.y : origin.x;
  const alongOrigin = isPointy ? origin.x : origin.y;
  const acrossMin = (isPointy ? map.y : map.x) + margin;
  const acrossMax = (isPointy ? map.y + map.height : map.x + map.width) - margin;
  const alongMin = (isPointy ? map.x : map.y) + margin;
  const alongMax = (isPointy ? map.x + map.width : map.y + map.height) - margin;

  const firstLine = Math.ceil((acrossMin - acrossOrigin) / lineSpacing - EPSILON);
  const lastLine = Math.floor((acrossMax - acrossOrigin) / lineSpacing + EPSILON);

  const hexes: PlacedCell[] = [];
  for (let line = firstLine; line <= lastLine; line++) {
    const phase = line / 2;
    const firstHex = Math.ceil((alongMin - alongOrigin) / size - phase - EPSILON);
    const lastHex = Math.floor((alongMax - alongOrigin) / size - phase + EPSILON);
    for (let index = firstHex; index <= lastHex; index++) {
      const coord: AxialCoord = isPointy ? { q: index, r: line } : { q: line, r: index };
      const lineNumber = line - firstLine;
      const indexInLine = index - firstHex;
      const cell: PlacedCell = {
        key: axialKey(coord),
        center: axialToPixel(layout, coord),
        row: isPointy ? lineNumber : indexInLine,
        column: isPointy ? indexInLine : lineNumber,
      };
      hexes.push(cell);
    }
  }
  return hexes;
}
