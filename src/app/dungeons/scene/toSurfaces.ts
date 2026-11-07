import { MAX_LEVEL_SURFACES, MAX_SURFACE_CORNERS } from '../../levels/levelSurfaces';
import type { LevelSurface } from '../../types/sceneLevelTypes';
import type { CellPoint, DungeonTerrain } from '../model';
import type { VisibleDungeon } from '../render/visibleDungeon';
import { floorBelow, stackOf } from '../floors/floorStack';
import { HOLE_KINDS, footingOf } from '../terrain/catalog';
import { cellOutlines } from './cellOutline';
import { terrainName } from './terrainName';
import type { DungeonPlacement } from './toWalls';

/**
 * A floor's holes and bridges as the openings of its level: a chasm, shaft or gallery over a
 * floor below is open (the view shows the level below through it, a token put down there falls
 * to the first floor below that has floor), and a bridge across it is floor laid over the hole,
 * after it, so it holds. The map image of such a floor is cut out on the same cells. A hole on
 * the lowest floor has nothing below it: it is drawn as depth and gets no opening, so a token
 * stays, as over a chasm. At most `MAX_LEVEL_SURFACES`: a hole that would not fit with its bridges is left out whole.
 */
export function floorSurfaces(dungeon: VisibleDungeon, placement: DungeonPlacement, id: string, level: string): Record<string, LevelSurface> {
  const { floor, model, index, roomShapes } = dungeon;
  if (floorBelow(stackOf(model), index) === null) return {};
  const shown = floor.terrain.filter(piece => roomShapes.has(piece.room));
  const openings = shown.filter(piece => piece.opening && HOLE_KINDS.has(piece.kind));
  const holes = openings.filter(piece => footingOf(piece.kind) === 'block');
  // A hole walked over (a murder hole) is too small to fall through: floor is laid over the picture cut out there.
  const narrow = openings.filter(piece => footingOf(piece.kind) === 'walk');
  const { originCell, pxPerCell } = placement;
  const world = (p: CellPoint): CellPoint => ({ x: (p.x - originCell.x) * pxPerCell, y: (p.y - originCell.y) * pxPerCell });
  const rings = (piece: DungeonTerrain, open: boolean): Omit<LevelSurface, 'id' | 'kind'>[] =>
    cellOutlines(piece.cells, MAX_SURFACE_CORNERS).map(polygon => ({ polygon: polygon.map(world), open, level, name: terrainName(piece) }));
  const open: Omit<LevelSurface, 'id' | 'kind'>[] = [];
  const laid: Omit<LevelSurface, 'id' | 'kind'>[] = [];
  for (const hole of holes) {
    const over = shown.filter(piece => piece.kind === 'bridge' && piece.spans === hole.id).flatMap(piece => rings(piece, false));
    const cut = rings(hole, true);
    if (open.length + laid.length + cut.length + over.length > MAX_LEVEL_SURFACES) break;
    open.push(...cut);
    laid.push(...over);
  }
  for (const hole of narrow) {
    const over = rings(hole, false);
    if (open.length + laid.length + over.length > MAX_LEVEL_SURFACES) break;
    laid.push(...over);
  }
  // Bridges after every hole: a later surface lies over an earlier one
  const drafts = [...open, ...laid];
  return Object.fromEntries(drafts.map((draft, n): [string, LevelSurface] => {
    const surfaceId = `${id}_${n + 1}`;
    return [surfaceId, { id: surfaceId, kind: 'level-surface', ...draft }];
  }));
}
