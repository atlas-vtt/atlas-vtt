import type { Point } from '../grid/hexGeometry';
import { objectsMovedWithMap } from '../grid/mapStretchObjects';
import type { GridState } from '../types/gridTypes';
import type { LevelAlignment } from '../types/sceneLevelTypes';
import type { ViewState } from '../types/viewState';
import { gridPeriod } from './levelAlignmentFit';
import type { LevelAlignments } from './levelAlignment';
import { hasLevels, movesWithLevel, onLevel, type SceneLevels } from './sceneLevels';

/** What a change of the scene's grid reads of the scene. */
export interface GridCarryScene {
  levels?: SceneLevels;
  grid: GridState | null;
  levelAlignments?: LevelAlignments | undefined;
  objects: ViewState['objects'];
}

/** The levels after a change of the scene's grid. */
export interface CarriedLevels {
  levelAlignments: LevelAlignments | undefined;
  objects: ViewState['objects'];
  /** Levels whose images were fitted to the old grid and cannot follow the new one: its type changed. */
  refit: string[];
}

const typeOf = (grid: GridState): NonNullable<GridState['type']> => grid.type ?? 'square';
const round = (value: number, places: number): number => Math.round(value * places) / places;

/**
 * Where the old grid's lattice lies in the new one: scaled by the cells' ratio about the old
 * grid's origin, then set on the new one's. Every cell of the old grid lands on a cell of the new.
 */
function latticeMove(from: GridState, to: GridState): (point: Point) => Point {
  const ratio = to.size / from.size;
  return (point) => ({ x: (point.x - from.offsetX) * ratio + to.offsetX, y: (point.y - from.offsetY) * ratio + to.offsetY });
}

/** `alignment` moved by `move`, then by whole periods of the new grid until it lies right of and below the origin; the shift it took. */
function carriedAlignment(alignment: LevelAlignment, move: (point: Point) => Point, ratio: number, to: GridState): { alignment: LevelAlignment; shift: Point } {
  const period = gridPeriod(to);
  const moved = move(alignment.offset);
  const shift = { x: moved.x < 0 ? Math.ceil(-moved.x / period.x) * period.x : 0, y: moved.y < 0 ? Math.ceil(-moved.y / period.y) * period.y : 0 };
  return {
    alignment: { ...alignment, scale: alignment.scale * ratio, offset: { x: round(moved.x + shift.x, 1e4), y: round(moved.y + shift.y, 1e4) } },
    shift,
  };
}

/**
 * The scene's levels once its grid becomes `next`. Every level fitted to the grid (one with an
 * alignment of its own) stays on its art: its image and the objects on that level alone take the
 * move the grid's change implies, so its cells stay on the same pixels of its image; an object on
 * several fitted levels and no frame level takes that move without a level's shift. Frame levels
 * (drawn by the scene's own stretch, like the first) and every object on one, shared ones too, stay
 * in the frame: the grid alignment moves them with the frame's map (`movesWithFrame`). A change of
 * the grid's type cannot be carried over: those levels keep their alignment and are named in
 * `refit`. Null where nothing is to be carried.
 */
export function levelsCarriedWithGrid(scene: GridCarryScene, next: GridState | null): CarriedLevels | null {
  const { grid: before, levelAlignments } = scene;
  const fitted = Object.keys(levelAlignments ?? {}).filter((id) => scene.levels?.some((level) => level.id === id));
  if (!before || !next || !levelAlignments || fitted.length === 0) return null;
  if (typeOf(before) !== typeOf(next)) return { levelAlignments, objects: scene.objects, refit: fitted };
  if (before.size === next.size && before.offsetX === next.offsetX && before.offsetY === next.offsetY) return null;
  if (!(before.size > 0) || !(next.size > 0)) return null;

  const ratio = next.size / before.size;
  const move = latticeMove(before, next);
  const alignments: LevelAlignments = { ...levelAlignments };
  let { objects } = scene;
  // What stands on several fitted levels and no frame level takes the lattice's move itself
  const levels = scene.levels;
  if (hasLevels(levels)) {
    const onFitted = (object: object): number => fitted.filter((id) => onLevel(object, id, levels)).length;
    const onFrame = (object: object): boolean => levels.some((level) => !levelAlignments[level.id] && onLevel(object, level.id, levels));
    objects = objectsMovedWithMap(objects, (point) => {
      const moved = move(point);
      return { x: round(moved.x, 1e6), y: round(moved.y, 1e6) };
    }, (object) => !onFrame(object) && onFitted(object) > 1);
  }
  for (const id of fitted) {
    const { alignment, shift } = carriedAlignment(levelAlignments[id]!, move, ratio, next);
    alignments[id] = alignment;
    const placed = (point: Point): Point => {
      const moved = move(point);
      return { x: round(moved.x + shift.x, 1e6), y: round(moved.y + shift.y, 1e6) };
    };
    objects = objectsMovedWithMap(objects, placed, movesWithLevel(scene, id));
  }
  return { levelAlignments: alignments, objects, refit: [] };
}
