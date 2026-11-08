import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { areaOf, blockingWalls, extended, MAX_ROOMS, movedArea, outlinesWithHoles, roomList, type Room } from '../../src/app/lighting/rooms';
import { createRoomsSlice, DEFAULT_ROOM_TOOL } from '../../src/app/stores/roomsSlice';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';

const rect = (x: number, y: number, w: number, h: number): Room['area'] => areaOf([[{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]]);

interface State {
  objects: { walls: Record<string, WallSegment>; rooms?: Record<string, Room> };
  levels?: SceneLevel[];
  viewedLevel?: string | null;
  activeRoomId: string | null;
  roomSplit: string | null;
  roomTool: typeof DEFAULT_ROOM_TOOL;
}

function roomStore(start: Partial<State> = {}): { slice: ReturnType<typeof createRoomsSlice>; get: () => State; view: (level: string) => void; wallCount: () => number; rooms: () => Room[] } {
  let state: State = { objects: { walls: {} }, activeRoomId: null, roomSplit: null, roomTool: DEFAULT_ROOM_TOOL, ...start };
  const slice = createRoomsSlice((fn) => { state = produce(state, fn as never); });
  return { slice, get: () => state, view: (level) => { state = produce(state, (draft) => { draft.viewedLevel = level; }); }, wallCount: () => Object.keys(blockingWalls(state.objects)).length, rooms: () => roomList(state.objects.rooms) };
}

describe('rooms', () => {
  it('carves, joins, fills, splits and hides rooms, with the open outline as walls', () => {
    const { slice, get, wallCount, rooms } = roomStore();
    expect(wallCount()).toBe(0);

    slice.carveRoom(rect(0, 0, 100, 100));
    // Every shape goes into the highlighted room
    slice.carveRoom(rect(300, 0, 50, 50));
    expect(rooms()).toHaveLength(1);
    // With none highlighted the next shape starts a room of its own
    slice.setActiveRoom(null);
    slice.carveRoom(rect(100, 0, 100, 100));
    expect(rooms()).toHaveLength(2);
    // Touching rooms are one open area: a 200×100 outline and a square, eight walls
    expect(wallCount()).toBe(8);

    slice.mergeRoomIntoPrevious(get().activeRoomId!);
    expect(rooms()).toHaveLength(1);

    // Filling a corridor across the middle leaves rock between two open areas
    slice.fillRooms(rect(90, -10, 20, 120));
    expect(wallCount()).toBe(12);

    const [whole] = rooms();
    slice.splitRoom(whole!.id, rect(250, -10, 200, 200));
    expect(rooms().map((room) => room.id)[0]).toBe(whole!.id);
    expect(rooms()).toHaveLength(2);

    slice.updateRoom(rooms()[1]!.id, { hidden: true });
    expect(wallCount()).toBe(8);

    slice.fillRooms(rect(-10, -10, 500, 200));
    expect(rooms()).toHaveLength(0);
    expect(wallCount()).toBe(0);
  });

  it('joins every room into the first, and deletes one', () => {
    const { slice, rooms, get } = roomStore();
    for (let i = 0; i < 3; i++) {
      slice.setActiveRoom(null);
      slice.carveRoom(rect(i * 200, 0, 100, 100));
    }
    slice.joinRooms();
    expect(rooms()).toHaveLength(1);
    expect(get().activeRoomId).toBe(rooms()[0]!.id);
    slice.deleteRoom(rooms()[0]!.id);
    expect(rooms()).toHaveLength(0);
    expect(get().activeRoomId).toBeNull();
  });

  it('carves into the highlighted room once a level holds the most rooms it may', () => {
    const { slice, rooms, get } = roomStore();
    for (let i = 0; i < MAX_ROOMS + 2; i++) {
      slice.setActiveRoom(null);
      slice.carveRoom(rect(i * 200, 0, 100, 100));
    }
    expect(rooms()).toHaveLength(MAX_ROOMS);
    // Nothing carved is lost: the last two went into the last room
    expect(rooms()[MAX_ROOMS - 1]!.area).toHaveLength(3);
    expect(get().activeRoomId).toBeNull();
  });

  it('works on the rooms of the level shown', () => {
    const levels = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] as unknown as SceneLevel[];
    const { slice, view, rooms } = roomStore({ levels, viewedLevel: 'b' });
    slice.carveRoom(rect(0, 0, 100, 100));
    expect(rooms()[0]!.level).toBe('b');
    view('a');
    slice.fillRooms(rect(-10, -10, 200, 200));
    expect(rooms()).toHaveLength(1);
  });

  it('passes over what is no room, and keeps a room with its map when the map is drawn another way', () => {
    const area = rect(0, 0, 100, 100);
    const rooms = { r: { id: 'r', kind: 'room', name: '', order: 0, area }, bad: { id: 'bad', area: [[1.5, 2]] } } as unknown as Record<string, Room>;
    expect(roomList(rooms).map((room) => room.id)).toEqual(['r']);
    const moved = movedArea(area, (p) => ({ x: p.x * 2, y: p.y + 10 }));
    expect(Object.keys(blockingWalls({ walls: {}, rooms: { r: { ...rooms.r!, area: moved } } }))).toHaveLength(4);
  });

  it('draws each outline with the holes in it, an island in a hole as an outline of its own', () => {
    const { slice, get } = roomStore();
    slice.carveRoom(rect(0, 0, 300, 300));
    slice.fillRooms(rect(100, 100, 100, 100));
    slice.carveRoom(rect(140, 140, 20, 20));
    const pieces = outlinesWithHoles(roomList(get().objects.rooms)[0]!.area);
    expect(pieces.map(({ holes }) => holes.length).sort()).toEqual([0, 1]);
    // The island is the smaller outline and holds no hole
    expect(pieces[0]!.holes).toHaveLength(0);
  });

  it('names a wall by its ends, so an edit keeps the walls it did not move', () => {
    const { slice, get } = roomStore();
    slice.carveRoom(rect(0, 0, 100, 100));
    const before = Object.keys(blockingWalls(get().objects));
    slice.carveRoom(rect(500, 0, 100, 100));
    const after = Object.keys(blockingWalls(get().objects));
    expect(after).toEqual(expect.arrayContaining(before));
  });
});

describe('a door drawn across a corridor', () => {
  // A corridor from y=0 to y=100
  const walls = [{ p1: { x: -500, y: 0 }, p2: { x: 500, y: 0 } }, { p1: { x: -500, y: 100 }, p2: { x: 500, y: 100 } }];

  it('reaches the walls when drawn a little short, and stays put when nothing is near', () => {
    expect(extended({ x: 0, y: 90 }, { x: 0, y: 10 }, walls, 70)).toEqual({ x: 0, y: 101 });
    expect(extended({ x: 0, y: 10 }, { x: 0, y: 90 }, walls, 70)).toEqual({ x: 0, y: -1 });
    expect(extended({ x: 0, y: 20 }, { x: 0, y: 30 }, walls, 5)).toEqual({ x: 0, y: 20 });
  });
});
