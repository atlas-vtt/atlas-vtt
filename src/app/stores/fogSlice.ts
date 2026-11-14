/** Fog operations (`FogOperation`) in the view store: scene objects of one level each, every change one undo step. */

import { areaGeometry, areaIsHidden, areaOutline, flippedArea, fogAreaList, isFogArea, MAX_FOG_AREAS, type FogArea, type FogAreaGeometry, type FogAreaShape } from '../fog/fogAreas';
import { planRoomAreas, type RoomAreasMade } from '../fog/fogRoomAreas';
import { roomsOfWalls, roomTexel } from '../fog/fogRooms';
import type { MapRect } from '../grid/cellNumbering';
import { levelObjects } from '../levels/levelObjects';
import { onLevel, placedOnViewedLevel, viewedLevelId } from '../levels/sceneLevels';
import type { FogOperation, FogOperationInput } from '../types/fogTypes';
import type { Point } from '../types/visionTypes';
import type { ViewState } from '../types/viewState';
import { wallList } from '../vision/wallList';

export interface FogSlice {
  /** Adds an operation on the level shown and returns its id: it acts after all the fog there is. */
  addFogOperation: (data: FogOperationInput) => string;
  /**
   * Adds operations on the level shown in one undo step and returns their ids: they act in the
   * order given, after all the fog there is.
   */
  addFogOperations: (data: readonly FogOperationInput[]) => string[];
  /**
   * Reveals the whole level the view shows, in one undo step: all its fog goes, the pieces that
   * were remembered with it. Other floors keep theirs.
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
  addFogArea: (shape: FogAreaShape) => string | null;
  /** Switches an area of the level shown between hidden and revealed, in one undo step; false for an id that is none. */
  flipFogArea: (id: string) => boolean;
  /**
   * Gives an area of the level shown the outline `points`, in one undo step. It is hidden anew
   * with it, after all the fog there is, so nothing of its new ground stays open. False where
   * the outline is the one it has, or encloses nothing.
   */
  reshapeFogArea: (id: string, points: readonly Point[]) => boolean;
  /**
   * Hides every room the walls of the level shown enclose, in one undo step: an area, hidden, of
   * each room that is none yet (plain fog once the level holds as many areas as are read), and
   * the area of a room hidden again where it was revealed. `mapRect` is the map as the view draws it.
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
 * The fog of `view` with the areas of the level it shows all hidden: each that is revealed is
 * flipped, after all the fog there is. Everything else stays.
 */
function withAreasHidden(view: FogDraft): Record<string, FogOperation> {
  let time = timeAfterAll(view.objects.fog);
  const fog: Record<string, FogOperation> = {};
  for (const [id, operation] of Object.entries(view.objects.fog)) {
    const revealed = onViewedLevel(view, operation) && isFogArea(operation) && !areaIsHidden(operation);
    fog[id] = revealed ? flippedArea(operation, time++) : operation;
  }
  return fog;
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
      if (!Object.values(get().objects.fog).some((operation) => onViewedLevel(get(), operation))) return;
      set((draft) => {
        for (const [id, operation] of Object.entries(draft.objects.fog)) {
          if (onViewedLevel(draft, operation)) delete draft.objects.fog[id];
        }
      });
    },

    coverAllFog: (mapRect) => {
      if (!isArea(mapRect)) return false;
      const { x, y, width, height } = mapRect;
      set((draft) => {
        // The level's areas are hidden with it, so each is one click from revealed.
        draft.objects.fog = withAreasHidden(draft);
        append(draft, [{ type: 'rectangle', isErasing: false, x, y, width, height }]);
      });
      return true;
    },

    addFogArea: (shape) => {
      const geometry = areaGeometry(shape);
      if (!geometry || viewedAreaCount(get()) >= MAX_FOG_AREAS) return null;
      let ids: string[] = [];
      set((draft) => { ids = append(draft, [{ ...geometry, isErasing: false, area: {} }]); });
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

    reshapeFogArea: (id, points) => {
      const area = viewedArea(get(), id);
      const geometry = area && areaGeometry({ type: 'lasso', points });
      if (!area || !geometry || keepsOutline(area, geometry)) return false;
      set((draft) => {
        const current = viewedArea(draft, id);
        if (current) draft.objects.fog[id] = { ...reshapedArea(current, geometry), isErasing: false, timestamp: timeAfterAll(draft.objects.fog) };
      });
      return true;
    },

    addRoomAreas: (mapRect) => {
      const view = get();
      if (!isArea(mapRect)) return { rooms: 0, made: 0 };
      const { walls, fog } = levelObjects(view);
      const cell = view.grid?.size ?? 0;
      const rooms = roomsOfWalls(wallList(walls), mapRect, cell);
      const pieces = fogAreaList(fog).filter((area) => areaOutline(area).length >= 3);
      const plan = planRoomAreas(rooms, pieces.map((area) => ({ outline: areaOutline(area), hidden: areaIsHidden(area) })), roomTexel(mapRect, cell));
      let room = MAX_FOG_AREAS - viewedAreaCount(view);
      const areas = plan.shapes.flatMap((shape): FogOperationInput[] => {
        const geometry = areaGeometry(shape);
        if (!geometry) return [];
        return [room-- > 0 ? { ...geometry, isErasing: false, area: {} } : { ...geometry, isErasing: false }];
      });
      const hide = plan.hide.map((index) => pieces[index]!.id);
      if (areas.length + hide.length > 0) {
        set((draft) => {
          for (const id of hide) {
            const area = viewedArea(draft, id);
            if (area) draft.objects.fog[id] = flippedArea(area, timeAfterAll(draft.objects.fog));
          }
          append(draft, areas);
        });
      }
      return { rooms: rooms.length, made: areas.length + hide.length };
    },
  };
}
