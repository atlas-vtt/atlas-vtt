/** Rooms (`Room`) in the view store: map geometry, each change one undo step; the room tool's choices beside them. */

import { onLevel, placedOnViewedLevel, viewedLevelId } from '../levels/sceneLevels';
import { joined, MAX_ROOMS, readRooms, within, without, type Room, type RoomArea } from '../lighting/rooms';
import type { ViewState } from '../types/viewState';
import { isRecord } from '../utils/guards';

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
  /** The room what is carved goes into, and the one outlined; none starts a new room. Not saved with the map. */
  activeRoomId: string | null;
  /** The room the next shape splits in two; null while not splitting. */
  roomSplit: string | null;
  /** The rooms mode's choices; not saved with the map. */
  roomTool: RoomToolOptions;
  setRoomTool: (changes: Partial<RoomToolOptions>) => void;
  setActiveRoom: (id: string | null) => void;
  setRoomSplit: (id: string | null) => void;
  /**
   * Carves `area` out of the rock into the highlighted room; with none highlighted, into a new one
   * (on a level that holds `MAX_ROOMS`, into its last room).
   */
  carveRoom: (area: RoomArea) => void;
  /** Fills `area` back in: every room of the level shown loses it, and rooms left empty go. */
  fillRooms: (area: RoomArea) => void;
  /** Moves the part of `id` inside `area` into a new room after it. */
  splitRoom: (id: string, area: RoomArea) => void;
  /** Names a room (an empty name clears it) or hides and shows it. */
  updateRoom: (id: string, changes: Partial<Pick<Room, 'name' | 'hidden'>>) => void;
  deleteRoom: (id: string) => void;
  /** Joins a room into the one before it in the level's list (above it in the menu). */
  mergeRoomIntoPrevious: (id: string) => void;
  /** Joins every room of the level shown into its first. */
  joinRooms: () => void;
}

type RoomsDraft = Pick<ViewState, 'levels' | 'viewedLevel' | 'objects'> & Pick<RoomsSlice, 'activeRoomId' | 'roomSplit' | 'roomTool'>;

type ImmerSet = (fn: (draft: RoomsDraft) => void) => void;

const roomsOf = (draft: RoomsDraft): Record<string, Room> => {
  // Whatever is in their place that is no record (a store filled by something else than a load) gives way.
  if (!isRecord(draft.objects.rooms)) draft.objects.rooms = {};
  return draft.objects.rooms;
};

/** The rooms of the level the view shows, in their order. */
function shownRooms(draft: RoomsDraft): Room[] {
  const level = viewedLevelId(draft);
  return readRooms(roomsOf(draft)).filter((room) => level === null || onLevel(room, level, draft.levels));
}

function addRoom(draft: RoomsDraft, area: RoomArea, after?: Room): string {
  const rooms = roomsOf(draft);
  const id = `room_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const list = readRooms(rooms);
  // Right after `after`, else last: the rooms behind it move up one.
  const order = after ? after.order + 1 : (list[list.length - 1]?.order ?? -1) + 1;
  for (const room of list) if (room.order >= order) rooms[room.id]!.order = room.order + 1;
  // A part split off stays on its room's level; anything else is on the level shown.
  const level = after ? after.level : placedOnViewedLevel(draft).level;
  rooms[id] = { id, kind: 'room', name: '', order, area, ...(level && { level }) };
  return id;
}

function removeRoom(draft: RoomsDraft, id: string): void {
  delete roomsOf(draft)[id];
  if (draft.activeRoomId === id) draft.activeRoomId = null;
  if (draft.roomSplit === id) draft.roomSplit = null;
}

export function createRoomsSlice(set: ImmerSet): Omit<RoomsSlice, 'activeRoomId' | 'roomSplit' | 'roomTool'> {
  return {
    setRoomTool: (changes) => set((draft) => { draft.roomTool = { ...draft.roomTool, ...changes }; }),
    setActiveRoom: (id) => set((draft) => { draft.activeRoomId = id; }),
    setRoomSplit: (id) => set((draft) => { draft.roomSplit = id; }),

    carveRoom: (area) => set((draft) => {
      if (area.length === 0) return;
      const shown = shownRooms(draft);
      const into = shown.find((room) => room.id === draft.activeRoomId) ?? (shown.length >= MAX_ROOMS ? shown[shown.length - 1] : undefined);
      if (into) roomsOf(draft)[into.id]!.area = joined(into.area, area);
      else draft.activeRoomId = addRoom(draft, area);
    }),

    fillRooms: (area) => set((draft) => {
      for (const room of shownRooms(draft)) {
        // A room the area misses keeps its outline as it was, and no change in the undo step.
        if (within(room.area, area).length === 0) continue;
        const left = without(room.area, area);
        if (left.length === 0) removeRoom(draft, room.id);
        else roomsOf(draft)[room.id]!.area = left;
      }
    }),

    splitRoom: (id, area) => set((draft) => {
      draft.roomSplit = null;
      const source = readRooms(roomsOf(draft)).find((room) => room.id === id);
      const part = source ? within(source.area, area) : [];
      if (!source || part.length === 0) return;
      const left = without(source.area, area);
      if (left.length === 0) return;
      roomsOf(draft)[id]!.area = left;
      draft.activeRoomId = addRoom(draft, part, source);
    }),

    updateRoom: (id, changes) => set((draft) => {
      const room = roomsOf(draft)[id];
      if (!room) return;
      if (changes.name !== undefined) room.name = changes.name.trim();
      if (changes.hidden !== undefined) {
        if (changes.hidden) room.hidden = true;
        else delete room.hidden;
      }
    }),

    deleteRoom: (id) => set((draft) => removeRoom(draft, id)),

    mergeRoomIntoPrevious: (id) => set((draft) => {
      const shown = shownRooms(draft);
      const index = shown.findIndex((room) => room.id === id);
      const below = shown[index - 1];
      if (index < 1 || !below) return;
      roomsOf(draft)[below.id]!.area = joined(below.area, shown[index]!.area);
      removeRoom(draft, id);
      draft.activeRoomId = below.id;
    }),

    joinRooms: () => set((draft) => {
      const [first, ...rest] = shownRooms(draft);
      if (!first || rest.length === 0) return;
      roomsOf(draft)[first.id]!.area = rest.reduce((area, room) => joined(area, room.area), first.area);
      for (const room of rest) removeRoom(draft, room.id);
      draft.activeRoomId = first.id;
    }),
  };
}
