import { axialToPixel, hexCircumradius, hexOriginCenter } from './hexGeometry';
import type { AxialCoord, HexLayout } from './hexGeometry';
import { EDGE_MARGIN, EPSILON } from './cellNumbering';
import type { CellLattice, CellLines, MapRect, PlacedCell } from './cellNumbering';

export function axialKey(coord: AxialCoord): string {
  return `${coord.q},${coord.r}`;
}

/** The lattice of a hex grid: cells addressed by axial coordinates. */
export function hexLattice(layout: HexLayout): CellLattice {
  return {
    size: layout.size,
    cellsOnMap(map: MapRect): PlacedCell[] {
      const lines = hexLinesOnMap(layout, map);
      return placeHexes(lines, lines.firstLine, lines.lastLine, (line) => lines.hexesOf(line));
    },
    cellsInRect(map: MapRect, rect: MapRect): PlacedCell[] {
      const lines = hexLinesOnMap(layout, map);
      const across = lines.across(rect);
      const along = lines.along(rect);
      const firstLine = Math.max(lines.firstLine, Math.ceil((across.min - lines.acrossOrigin) / lines.spacing));
      const lastLine = Math.min(lines.lastLine, Math.floor((across.max - lines.acrossOrigin) / lines.spacing));
      return placeHexes(lines, firstLine, lastLine, (line) => {
        const onMap = lines.hexesOf(line);
        const phase = line / 2;
        return {
          first: Math.max(onMap.first, Math.ceil((along.min - lines.alongOrigin) / layout.size - phase)),
          last: Math.min(onMap.last, Math.floor((along.max - lines.alongOrigin) / layout.size - phase)),
        };
      });
    },
    linesOnMap(map: MapRect): CellLines {
      const lines = hexLinesOnMap(layout, map);
      const counts: number[] = [];
      for (let line = lines.firstLine; line <= lines.lastLine; line++) {
        const { first, last } = lines.hexesOf(line);
        counts.push(Math.max(0, last - first + 1));
      }
      return { lineIsRow: lines.isPointy, counts };
    },
  };
}

interface Range {
  min: number;
  max: number;
}

/**
 * The hexes of a map by lines: the grid's columns on flat-top grids and its rows on pointy-top
 * grids. Each line counts from its first hex on the map, which follows the half-cell stagger.
 */
interface HexLines {
  layout: HexLayout;
  isPointy: boolean;
  /** Distance between neighbouring lines. */
  spacing: number;
  acrossOrigin: number;
  alongOrigin: number;
  firstLine: number;
  lastLine: number;
  /** The first and last hex of a line on the map, by index along it (inclusive). */
  hexesOf(line: number): { first: number; last: number };
  /** A rect's extent across the lines. */
  across(rect: MapRect): Range;
  /** A rect's extent along the lines. */
  along(rect: MapRect): Range;
}

function hexLinesOnMap(layout: HexLayout, map: MapRect): HexLines {
  const isPointy = layout.orientation === 'pointy';
  const size = layout.size;
  const spacing = 1.5 * hexCircumradius(size);
  const origin = hexOriginCenter(layout);
  const margin = EDGE_MARGIN * size;
  const across = (rect: MapRect): Range =>
    isPointy ? { min: rect.y, max: rect.y + rect.height } : { min: rect.x, max: rect.x + rect.width };
  const along = (rect: MapRect): Range =>
    isPointy ? { min: rect.x, max: rect.x + rect.width } : { min: rect.y, max: rect.y + rect.height };

  const acrossOrigin = isPointy ? origin.y : origin.x;
  const alongOrigin = isPointy ? origin.x : origin.y;
  const acrossMap = across(map);
  const alongMap = along(map);
  const alongMin = alongMap.min + margin;
  const alongMax = alongMap.max - margin;

  return {
    layout,
    isPointy,
    spacing,
    acrossOrigin,
    alongOrigin,
    firstLine: Math.ceil((acrossMap.min + margin - acrossOrigin) / spacing - EPSILON),
    lastLine: Math.floor((acrossMap.max - margin - acrossOrigin) / spacing + EPSILON),
    hexesOf(line: number): { first: number; last: number } {
      const phase = line / 2;
      return {
        first: Math.ceil((alongMin - alongOrigin) / size - phase - EPSILON),
        last: Math.floor((alongMax - alongOrigin) / size - phase + EPSILON),
      };
    },
    across,
    along,
  };
}

/** The hexes `rangeOf` names on the lines `firstLine` to `lastLine`, with their 0-based row and column on the map. */
function placeHexes(
  lines: HexLines,
  firstLine: number,
  lastLine: number,
  rangeOf: (line: number) => { first: number; last: number },
): PlacedCell[] {
  const hexes: PlacedCell[] = [];
  for (let line = firstLine; line <= lastLine; line++) {
    const firstOnMap = lines.hexesOf(line).first;
    const { first, last } = rangeOf(line);
    for (let index = first; index <= last; index++) {
      const coord: AxialCoord = lines.isPointy ? { q: index, r: line } : { q: line, r: index };
      const lineNumber = line - lines.firstLine;
      const indexInLine = index - firstOnMap;
      hexes.push({
        key: axialKey(coord),
        center: axialToPixel(lines.layout, coord),
        row: lines.isPointy ? lineNumber : indexInLine,
        column: lines.isPointy ? indexInLine : lineNumber,
      });
    }
  }
  return hexes;
}
