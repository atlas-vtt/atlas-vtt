/** The rooms mode's choices in the view store. A room is its walls: nothing of it is kept but them. */

/** What a stroke of the rooms mode does, with which shape. Alt does the opposite of carving or filling while held. */
export interface RoomToolOptions {
  /** A door is dragged across an opening; Alt makes it a secret door. */
  action: 'carve' | 'fill' | 'door';
  shape: 'rectangle' | 'polygon' | 'lasso' | 'brush';
  /** Radius of the brush in map pixels. */
  brushSize: number;
}

export const DEFAULT_ROOM_TOOL: RoomToolOptions = { action: 'carve', shape: 'rectangle', brushSize: 50 };

export interface RoomsSlice {
  /** The rooms mode's choices; not saved with the map. */
  roomTool: RoomToolOptions;
  setRoomTool: (changes: Partial<RoomToolOptions>) => void;
}

type ImmerSet = (fn: (draft: Pick<RoomsSlice, 'roomTool'>) => void) => void;

export function createRoomsSlice(set: ImmerSet): Omit<RoomsSlice, 'roomTool'> {
  return {
    setRoomTool: (changes) => set((draft) => { draft.roomTool = { ...draft.roomTool, ...changes }; }),
  };
}
