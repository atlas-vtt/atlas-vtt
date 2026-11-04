import type { GridState } from '../types/gridTypes';
import { cellToWorld, formationGridFromOptions, worldToCell, type FormationGrid } from '../encounters/encounterFormation';
import { snapTokenCenter } from '../grid/gridPlacement';
import {
  anchorKey,
  contentCenter,
  objectAnchors,
  translateMapObjects,
  type CopyableCollections,
  type MapObjectContent,
  type Point,
} from './mapObjectContent';

/** Offset of a duplicate on maps without a grid, in world pixels. */
const UNGRIDDED_STEP = 20;
/** Upper bound on the cascade that keeps copies from landing exactly on existing objects. */
const MAX_CASCADE_STEPS = 50;

/** Grid geometry when tokens snap to it, mirroring the drag behaviour (snapping defaults to on). */
function tokenSnapGrid(grid: GridState | null): FormationGrid | null {
  const geometry = formationGridFromOptions(grid);
  return geometry && (grid?.snapToGrid ?? true) ? geometry : null;
}

function snapToken(grid: FormationGrid, point: Point, tokenSize: number): Point {
  return snapTokenCenter(point, tokenSize, grid.type, grid.size, (p) => cellToWorld(grid, worldToCell(grid, p)));
}

/** One diagonal cell as a lattice vector, so shifted copies stay aligned with the grid. */
export function duplicateStep(grid: GridState | null): Point {
  const geometry = formationGridFromOptions(grid);
  if (!geometry) return { x: UNGRIDDED_STEP, y: UNGRIDDED_STEP };
  const origin = cellToWorld(geometry, { q: 0, r: 0 });
  const next = cellToWorld(geometry, geometry.type === 'square' ? { q: 1, r: 1 } : { q: 0, r: 1 });
  return { x: next.x - origin.x, y: next.y - origin.y };
}

/**
 * Offset that centres the content on `target`. When tokens snap, the offset is adjusted so the
 * first token lands where it snaps, which keeps the whole group's grid alignment intact.
 */
export function pasteOffset(content: MapObjectContent, target: Point, grid: GridState | null): Point {
  const center = contentCenter(content);
  const offset = { x: target.x - center.x, y: target.y - center.y };
  const geometry = tokenSnapGrid(grid);
  const anchor = content.tokens[0];
  if (!geometry || !anchor) return offset;
  const snapped = snapToken(geometry, { x: anchor.x + offset.x, y: anchor.y + offset.y }, anchor.size || 1);
  return { x: snapped.x - anchor.x, y: snapped.y - anchor.y };
}

/**
 * Moves the content by `offset` and snaps tokens the way a drag does. While a copy would sit exactly
 * on top of an identical existing object, the copies move one more cell, so repeated pastes and
 * duplicates fan out instead of hiding under each other. The cascade only compares anchors; the
 * content is copied once, at the final offset.
 */
export function placeMapObjects(
  content: MapObjectContent,
  offset: Point,
  grid: GridState | null,
  existing: CopyableCollections,
): MapObjectContent {
  const geometry = tokenSnapGrid(grid);
  const placeToken = geometry ? (point: Point, tokenSize: number): Point => snapToken(geometry, point, tokenSize) : undefined;
  const occupied = new Set(objectAnchors(existing).map(({ kind, point }) => anchorKey(kind, point)));
  const anchors = objectAnchors(content);
  const step = duplicateStep(grid);
  const offsetAt = (steps: number): Point => ({ x: offset.x + step.x * steps, y: offset.y + step.y * steps });
  const overlapsAt = (shift: Point): boolean => anchors.some(({ kind, point, tokenSize }) => {
    const moved = { x: point.x + shift.x, y: point.y + shift.y };
    return occupied.has(anchorKey(kind, tokenSize !== undefined && placeToken ? placeToken(moved, tokenSize) : moved));
  });

  let steps = 0;
  while (steps < MAX_CASCADE_STEPS && overlapsAt(offsetAt(steps))) steps++;
  return translateMapObjects(content, offsetAt(steps), placeToken);
}
