import { BUCKET_RADIUS, BUCKET_SENSITIVITY } from '../lighting/bucketFill/bucketFill';
import { isRecord } from '../utils/guards';
import { clamp } from '../utils/math';

/** The rooms mode's choices in the view store. A room is its walls: nothing of it is kept but them. */

/** What a stroke of the rooms mode does, with which shape. Alt does the opposite of carving or filling while held. */
export interface RoomToolOptions {
  /** A door is dragged across an opening; Alt makes it a secret door. */
  action: 'carve' | 'fill' | 'door';
  /** The bucket pours over the map's art and takes the floor it finds up to the walls (`pourBucket`). */
  shape: 'rectangle' | 'polygon' | 'lasso' | 'brush' | 'bucket';
  /** How readily the bucket stops at an edge (`BUCKET_SENSITIVITY`). */
  bucketSensitivity: number;
  /** Stabilization: a brush or bucket stroke trails on a rope twice the brush's size behind the pointer (`pulled`). Remembered on the device. */
  stabilize: boolean;
}

/**
 * The brush's radius and how far the bucket reaches, in map pixels. Holes are filled within the
 * bucket's reach, and gaps closed up to a share of it (`BUCKET_GAP_SHARE`). A scene keeps its own
 * once the GM changes them; until then they follow its grid (`roomSizesOf`).
 */
export interface RoomSizes {
  brushSize: number;
  bucketRadius: number;
}

export const BRUSH_SIZE = { min: 10, max: 300 } as const;
/** A scene's sizes until the GM sets its own: the brush a little narrower than a cell (a radius, so half of 90 %), the bucket that many brushes. */
const BRUSH_CELL_SHARE = 0.9 / 2;
const BUCKET_BRUSHES = 7;

export const DEFAULT_ROOM_TOOL: RoomToolOptions = {
  action: 'carve', shape: 'rectangle', bucketSensitivity: BUCKET_SENSITIVITY.default, stabilize: false,
};


export interface RoomsSlice {
  /** The rooms mode's choices; not saved with the map. */
  roomTool: RoomToolOptions;
  /** The scene's own sizes, saved with the map once set; read with `roomSizesOf`. */
  roomSizes?: RoomSizes | undefined;
  setRoomTool: (changes: Partial<RoomToolOptions & RoomSizes>) => void;
}

/** The sizes the rooms mode uses on a scene: its own, else those its grid gives. */
export function roomSizesOf(state: { roomSizes?: RoomSizes | undefined; grid?: { size: number } | null | undefined }): RoomSizes {
  if (state.roomSizes) return state.roomSizes;
  const cell = state.grid?.size ?? 0;
  const brushSize = clamp(Math.round(BRUSH_CELL_SHARE * (Number.isFinite(cell) && cell > 0 ? cell : 70)), BRUSH_SIZE.min, BRUSH_SIZE.max);
  return { brushSize, bucketRadius: clamp(BUCKET_BRUSHES * brushSize, BUCKET_RADIUS.min, BUCKET_RADIUS.max) };
}

/** A map file's sizes, or none where they cannot be read. */
export function readRoomSizes(saved: unknown): RoomSizes | undefined {
  if (!isRecord(saved)) return undefined;
  const { brushSize, bucketRadius } = saved;
  if (typeof brushSize !== 'number' || !Number.isFinite(brushSize) || typeof bucketRadius !== 'number' || !Number.isFinite(bucketRadius)) return undefined;
  return nestedRings({ brushSize: clamp(brushSize, BRUSH_SIZE.min, BRUSH_SIZE.max), bucketRadius: clamp(bucketRadius, BUCKET_RADIUS.min, BUCKET_RADIUS.max) }, false);
}

/** The bucket's rings stay nested, brush within reach: the ring just set pushes the other. */
function nestedRings({ brushSize, bucketRadius }: RoomSizes, bucketSet: boolean): RoomSizes {
  return bucketSet
    ? { brushSize: Math.min(brushSize, bucketRadius), bucketRadius }
    : { brushSize, bucketRadius: Math.max(bucketRadius, brushSize) };
}

type RoomsDraft = Pick<RoomsSlice, 'roomTool' | 'roomSizes'> & { grid?: { size: number } | null };
type ImmerSet = (fn: (draft: RoomsDraft) => void) => void;

/** `remember` keeps Stabilization's choice on the device whenever it changes. */
export function createRoomsSlice(set: ImmerSet, remember: (stabilize: boolean) => void): Pick<RoomsSlice, 'setRoomTool'> {
  return {
    setRoomTool: ({ brushSize, bucketRadius, ...tool }) => set((draft) => {
      if (Object.keys(tool).length > 0) draft.roomTool = { ...draft.roomTool, ...tool };
      if (tool.stabilize !== undefined) remember(tool.stabilize);
      if (brushSize === undefined && bucketRadius === undefined) return;
      const now = roomSizesOf(draft);
      draft.roomSizes = nestedRings({ brushSize: brushSize ?? now.brushSize, bucketRadius: bucketRadius ?? now.bucketRadius }, bucketRadius !== undefined);
    }),
  };
}
