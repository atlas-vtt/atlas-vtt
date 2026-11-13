/** Fog operations (`FogOperation`) in the view store: scene objects of one level each, every change one undo step. */

import { areaGeometry, areaIsHidden, areaName, areaOutline, flippedArea, fogAreaOutlines, isFogArea, MAX_AREA_NAME, MAX_FOG_AREAS, type FogArea, type FogAreaGeometry, type FogAreaShape } from '../fog/fogAreas';
import { planRoomAreas, type RoomAreasMade } from '../fog/fogRoomAreas';
import { roomsOfWalls, roomTexel } from '../fog/fogRooms';
import type { MapRect } from '../grid/cellNumbering';
import { levelObjects } from '../levels/levelObjects';
import { onLevel, placedOnViewedLevel, viewedLevelId } from '../levels/sceneLevels';
import type { FogAreaMark, FogOperation, FogOperationInput } from '../types/fogTypes';
import type { Point } from '../types/visionTypes';
import type { ViewState } from '../types/viewState';
import { wallList } from '../vision/wallList';

/**
 * What changes of an area. `points` is a new outline, which makes its operation a lasso; `x`,
 * `y`, `width` and `height` change a rectangle that stays one (and nothing of a lasso, or beside
 * `points`). A `name` given as undefined or blank takes the name away.
 */
export interface FogAreaChanges {
  points?: readonly Point[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string | undefined;
}

export interface FogSlice {
  /** Adds an operation on the level shown and returns its id: it acts after all the fog there is. */
  addFogOperation: (data: FogOperationInput) => string;
  /**
   * Adds operations on the level shown in one undo step and returns their ids: they act in the
   * order given, after all the fog there is.
   */
  addFogOperations: (data: readonly FogOperationInput[]) => string[];
  /**
   * Reveals the whole level the view shows, in one undo step: its fog goes, and its areas stay,
   * revealed. Other floors keep theirs.
   */
  clearFog: () => void;
  /**
   * Hides the whole map of the level shown, in one undo step, its areas with it. `mapRect` is the
   * map as the view draws it; false, and nothing hidden, where there is none.
   */
  coverAllFog: (mapRect: MapRect | null) => boolean;
  /**
   * Adds an area of `shape` on the level shown, hidden, in one undo step, and returns its id.
   * Null, and nothing added, where the shape encloses nothing or the level holds as many areas as are read.
   */
  addFogArea: (shape: FogAreaShape, name?: string) => string | null;
  /** Switches an area of the level shown between hidden and revealed, in one undo step; false for an id that is none. */
  flipFogArea: (id: string) => boolean;
  /** Changes the outline or the name of an area of the level shown, in one undo step; false where nothing changed. */
  updateFogArea: (id: string, changes: FogAreaChanges) => boolean;
  /** Deletes those of `ids` that are areas of the level shown, in one undo step. */
  deleteFogAreas: (ids: readonly string[]) => void;
  /**
   * Makes an area, hidden, of every room the walls of the level shown enclose, in one undo step:
   * none of a room that an area already is. `mapRect` is the map as the view draws it.
   */
  addRoomAreas: (mapRect: MapRect | null) => RoomAreasMade;
}

type FogDraft = Pick<ViewState, 'levels' | 'viewedLevel' | 'objects' | 'grid'>;

type ImmerSet = (fn: (draft: FogDraft) => void) => void;

/** Whether `operation` is fog of the level `view` shows. An entry that is no object (a map file is kept as it came) is on the first level, as unset objects are. */
function onViewedLevel(view: FogDraft, operation: FogOperation): boolean {
  const level = viewedLevelId(view);
  return level === null || onLevel(typeof operation === 'object' && operation !== null ? operation : {}, level, view.levels);
}

/** The area `id` names on the level `view` shows, or null. */
function viewedArea(view: FogDraft, id: string): FogArea | null {
  const operation = Object.hasOwn(view.objects.fog, id) ? view.objects.fog[id] : undefined;
  return isFogArea(operation) && onViewedLevel(view, operation) ? operation : null;
}

function viewedAreaCount(view: FogDraft): number {
  let count = 0;
  for (const operation of Object.values(view.objects.fog)) {
    if (isFogArea(operation) && onViewedLevel(view, operation)) count++;
  }
  return count;
}

/**
 * The fog of `view` with the areas of the level it shows all `hidden`, or all revealed: each is
 * flipped where it is the other way, after all the fog there is. The level's other fog stays
 * only with `plain`; the fog of other levels always does.
 */
function withAreasAs(view: FogDraft, hidden: boolean, plain: boolean): Record<string, FogOperation> {
  let time = timeAfterAll(view.objects.fog);
  const fog: Record<string, FogOperation> = {};
  for (const [id, operation] of Object.entries(view.objects.fog)) {
    if (!onViewedLevel(view, operation)) fog[id] = operation;
    else if (isFogArea(operation)) fog[id] = areaIsHidden(operation) === hidden ? operation : flippedArea(operation, time++);
    else if (plain) fog[id] = operation;
  }
  return fog;
}

/** Whether `fog` holds the same operations as `other`, in the same order. */
function sameFog(fog: Record<string, FogOperation>, other: Record<string, FogOperation>): boolean {
  const ids = Object.keys(fog);
  const others = Object.keys(other);
  return ids.length === others.length && ids.every((id, index) => others[index] === id && fog[id] === other[id]);
}

/** The mark of an area named `name`: none where the name is blank. */
function markOf(name: string | undefined): FogAreaMark {
  const trimmed = name?.trim().slice(0, MAX_AREA_NAME) ?? '';
  return trimmed === '' ? {} : { name: trimmed };
}

/** The outline `changes` give `area`, or null where they give none. */
function changedShape(area: FogArea, changes: FogAreaChanges): FogAreaShape | null {
  if (changes.points) return { type: 'lasso', points: changes.points };
  if (area.type !== 'rectangle') return null;
  const { x, y, width, height } = changes;
  if (x === undefined && y === undefined && width === undefined && height === undefined) return null;
  // What is given is where the area lies on the map: an offset an older file holds is taken in.
  return { type: 'rectangle', x: x ?? area.x + (area.offsetX ?? 0), y: y ?? area.y + (area.offsetY ?? 0), width: width ?? area.width, height: height ?? area.height };
}

/** `area` with another outline. Its other fields stay, also those a newer Atlas wrote; an offset goes, since the outline is where the area lies. */
function reshapedArea(area: FogArea, geometry: FogAreaGeometry): FogArea {
  const { offsetX: _offsetX, offsetY: _offsetY, ...placed } = area;
  if (placed.type === 'rectangle') {
    const { x: _x, y: _y, width: _width, height: _height, ...kept } = placed;
    return { ...kept, ...geometry };
  }
  const { points: _points, ...kept } = placed;
  return { ...kept, ...geometry };
}

/** Whether `geometry` is the outline `area` has already. */
function keepsOutline(area: FogArea, geometry: FogAreaGeometry): boolean {
  return geometry.type === area.type && sameOutline(areaOutline({ id: '', kind: 'fog', timestamp: 0, isErasing: false, ...geometry }), areaOutline(area));
}

function sameOutline(a: readonly Point[], b: readonly Point[]): boolean {
  return a.length === b.length && a.every((point, index) => point.x === b[index]!.x && point.y === b[index]!.y);
}

function newFogId(): string {
  return `fog_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * A time after every operation's, so what is written now acts last whatever the clock says. An
 * entry that is no object (a map file is kept as it came) has no time.
 */
function timeAfterAll(fog: Readonly<Record<string, FogOperation>>): number {
  let newest = -Infinity;
  for (const entry of Object.values<unknown>(fog)) {
    if (typeof entry !== 'object' || entry === null || !('timestamp' in entry)) continue;
    const { timestamp } = entry;
    if (typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > newest) newest = timestamp;
  }
  return Math.max(Date.now(), newest + 1);
}

/** Adds `data` to `draft` on the level it shows, each a tick after the one before, and returns the ids. */
function append(draft: FogDraft, data: readonly FogOperationInput[]): string[] {
  const start = timeAfterAll(draft.objects.fog);
  return data.map((input, index) => {
    const id = newFogId();
    draft.objects.fog[id] = { id, kind: 'fog', timestamp: start + index, ...input, ...placedOnViewedLevel(draft) };
    return id;
  });
}

function isArea(rect: MapRect | null): rect is MapRect {
  return rect !== null && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
}

export function createFogActions(set: ImmerSet, get: () => FogDraft): FogSlice {
  return {
    addFogOperation: (data) => {
      let ids: string[] = [];
      set((draft) => { ids = append(draft, [data]); });
      return ids[0]!;
    },

    addFogOperations: (data) => {
      let ids: string[] = [];
      if (data.length > 0) set((draft) => { ids = append(draft, data); });
      return ids;
    },

    clearFog: () => {
      // Nothing to reveal leaves no undo step.
      if (sameFog(withAreasAs(get(), false, false), get().objects.fog)) return;
      set((draft) => { draft.objects.fog = withAreasAs(draft, false, false); });
    },

    coverAllFog: (mapRect) => {
      if (!isArea(mapRect)) return false;
      const { x, y, width, height } = mapRect;
      set((draft) => {
        // The level's areas are hidden with it, so each is one click from revealed.
        draft.objects.fog = withAreasAs(draft, true, true);
        append(draft, [{ type: 'rectangle', isErasing: false, x, y, width, height }]);
      });
      return true;
    },

    addFogArea: (shape, name) => {
      const geometry = areaGeometry(shape);
      if (!geometry || viewedAreaCount(get()) >= MAX_FOG_AREAS) return null;
      let ids: string[] = [];
      set((draft) => { ids = append(draft, [{ ...geometry, isErasing: false, area: markOf(name) }]); });
      return ids[0] ?? null;
    },

    flipFogArea: (id) => {
      if (!viewedArea(get(), id)) return false;
      set((draft) => {
        const area = viewedArea(draft, id);
        if (area) draft.objects.fog[id] = flippedArea(area, timeAfterAll(draft.objects.fog));
      });
      return true;
    },

    updateFogArea: (id, changes) => {
      const area = viewedArea(get(), id);
      if (!area) return false;
      const shape = changedShape(area, changes);
      const given = shape && areaGeometry(shape);
      const geometry = given && !keepsOutline(area, given) ? given : null;
      const mark = 'name' in changes ? markOf(changes.name) : null;
      const renamed = mark !== null && mark.name !== areaName(area);
      if (!geometry && !renamed) return false;
      set((draft) => {
        const current = viewedArea(draft, id);
        if (!current) return;
        if (renamed) {
          const { name: _name, ...kept } = current.area;
          current.area = { ...kept, ...mark };
        }
        if (geometry) draft.objects.fog[id] = reshapedArea(current, geometry);
      });
      return true;
    },

    deleteFogAreas: (ids) => {
      const areas = ids.filter((id) => viewedArea(get(), id));
      if (areas.length === 0) return;
      set((draft) => {
        for (const id of areas) delete draft.objects.fog[id];
      });
    },

    addRoomAreas: (mapRect) => {
      const view = get();
      if (!isArea(mapRect)) return { rooms: 0, made: 0, full: false };
      const { walls, fog } = levelObjects(view);
      const cell = view.grid?.size ?? 0;
      const rooms = roomsOfWalls(wallList(walls), mapRect, cell);
      const plan = planRoomAreas(rooms, fogAreaOutlines(fog), roomTexel(mapRect, cell), MAX_FOG_AREAS - viewedAreaCount(view));
      const areas = plan.shapes.flatMap((shape) => {
        const geometry = areaGeometry(shape);
        return geometry ? [{ ...geometry, isErasing: false, area: {} }] : [];
      });
      if (areas.length > 0) set((draft) => { append(draft, areas); });
      return { rooms: rooms.length, made: areas.length, full: plan.full };
    },
  };
}
