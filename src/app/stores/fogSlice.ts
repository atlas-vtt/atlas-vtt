/** Fog operations (`FogOperation`) in the view store: scene objects of one level each, every change one undo step. */

import { fogAreaList, isFogArea, MAX_FOG_AREAS, lassoOutline, type FogArea } from '../fog/fogAreas';
import { fogCoverage } from '../fog/fogCoverage';
import { roomsToHide } from '../fog/fogRoomCover';
import { roomsOfWalls } from '../fog/fogRooms';
import type { MapRect } from '../grid/cellNumbering';
import { levelObjects } from '../levels/levelObjects';
import { onLevel, placedOnViewedLevel, viewedLevelId } from '../levels/sceneLevels';
import type { FogOperation, FogOperationInput } from '../types/fogTypes';
import type { QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import type { ViewState } from '../types/viewState';
import { wallList } from '../vision/wallList';

/** What hiding a level's rooms came to (the store's `hideRooms`). */
export interface RoomsHidden {
  /** The rooms the walls enclose. */
  rooms: number;
  /** Those that were given fog: the rest were hidden already. */
  hidden: number;
}

export interface FogSlice {
  /** Adds an operation on the level shown and returns its id: it acts after all the fog there is. */
  addFogOperation: (data: FogOperationInput) => string;
  /**
   * Adds operations on the level shown in one undo step and returns their ids: they act in the
   * order given, after all the fog there is.
   */
  addFogOperations: (data: readonly FogOperationInput[]) => string[];
  /** Deletes all the fog of the level the view shows, in one undo step: what was revealed and is remembered goes with it. Other floors keep theirs. */
  clearFog: () => void;
  /**
   * Hides the whole map of the level shown, in one undo step. What was revealed there and is
   * remembered is forgotten: it lies under the cover. `mapRect` is the map as the view draws it;
   * false, and nothing hidden, where there is none.
   */
  coverAllFog: (mapRect: MapRect | null) => boolean;
  /**
   * Reveals the fog inside `outlines` on the level shown, in one undo step, and remembers each
   * (the `area` mark), its outline as it is given, so that hiding it brings exactly that fog
   * back. Once the level holds as many as are read, the rest is plain fog taken away. Outlines
   * that enclose nothing are passed over.
   */
  revealFogGround: (outlines: ReadonlyArray<readonly Point[]>) => void;
  /**
   * Hides remembered revealed fog of the level shown again, in one undo step: it becomes plain
   * fog, after all the fog there is. False for an id that is none.
   */
  hideFogArea: (id: string) => boolean;
  /** Forgets remembered revealed fog of the level shown, in one undo step: it stays revealed, and nothing brings it back. False for an id that is none. */
  forgetFogArea: (id: string) => boolean;
  /**
   * Paints fog over every room the walls of the level shown enclose that is not hidden yet, in
   * one undo step. `mapRect` is the map as the view draws it, `coverage` the level's fog as it
   * is; where none is given, it is worked out here.
   */
  hideRooms: (mapRect: MapRect | null, coverage?: QShape | null) => RoomsHidden;
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

/** `area` as the plain operation it is without its mark. Its other fields stay, also those a newer Atlas wrote. */
function unmarked(area: FogArea): FogOperation {
  const { area: _mark, ...plain } = area;
  return plain;
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

/** The fog `fog` holds, as its shape; null where it cannot be worked out. */
function coverageOf(fog: Readonly<Record<string, FogOperation>>): QShape | null {
  try {
    return fogCoverage(fog).shape;
  } catch {
    return null;
  }
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
      // Nothing to delete leaves no undo step.
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
        for (const [id, operation] of Object.entries(draft.objects.fog)) {
          if (isFogArea(operation) && onViewedLevel(draft, operation)) draft.objects.fog[id] = unmarked(operation);
        }
        append(draft, [{ type: 'rectangle', isErasing: false, x, y, width, height }]);
      });
      return true;
    },

    revealFogGround: (outlines) => {
      let room = MAX_FOG_AREAS - fogAreaList(levelObjects(get()).fog).length;
      const revealed = outlines.flatMap((outline): FogOperationInput[] => {
        const points = lassoOutline(outline);
        if (!points) return [];
        return [room-- > 0 ? { type: 'lasso', points, isErasing: true, area: {} } : { type: 'lasso', points, isErasing: true }];
      });
      if (revealed.length > 0) set((draft) => { append(draft, revealed); });
    },

    hideFogArea: (id) => {
      if (!viewedArea(get(), id)) return false;
      set((draft) => {
        const area = viewedArea(draft, id);
        if (area) draft.objects.fog[id] = { ...unmarked(area), isErasing: false, timestamp: timeAfterAll(draft.objects.fog) };
      });
      return true;
    },

    forgetFogArea: (id) => {
      if (!viewedArea(get(), id)) return false;
      set((draft) => {
        const area = viewedArea(draft, id);
        if (area) draft.objects.fog[id] = unmarked(area);
      });
      return true;
    },

    hideRooms: (mapRect, coverage) => {
      const view = get();
      if (!isArea(mapRect)) return { rooms: 0, hidden: 0 };
      const { walls, fog } = levelObjects(view);
      const rooms = roomsOfWalls(wallList(walls), mapRect, view.grid?.size ?? 0);
      const covered = coverage ?? coverageOf(fog);
      // Fog that cannot be worked out draws as a covered map: there is nothing to add to it.
      const open = covered ? roomsToHide(rooms, covered) : [];
      const painted = open.flatMap((room): FogOperationInput[] => {
        const points = lassoOutline(room);
        return points ? [{ type: 'lasso', points, isErasing: false }] : [];
      });
      if (painted.length > 0) set((draft) => { append(draft, painted); });
      return { rooms: rooms.length, hidden: painted.length };
    },
  };
}
