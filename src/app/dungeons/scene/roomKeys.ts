import { t } from '../../i18n';
import { type FloorStack, levelOf } from '../floors/floorStack';
import type { DungeonRoom } from '../model';
import { hops, neighbours } from '../roomGraph';
import type { VisibleFloor } from '../render/visibleDungeon';

/** A room of a floor as its note and its pin name it. */
export interface KeyedRoom {
  room: DungeonRoom;
  /** "A1" on a dungeon of several floors, "1" on one of one. */
  key: string;
  /** The note's heading for the room: its key, and what it is where it is something (a five-room stage, the boss room). */
  heading: string;
}

/** The letter of a floor: A for the entry floor, B the next one from it, and so on. */
export function floorLetter(floor: number): string {
  return String.fromCharCode(65 + floor);
}

/** A floor as the scene's level, its map and the floor switcher name it: "Floor A", or "Cellar" for a floor under a building's entrance floor. */
export function floorName(stack: FloorStack, floor: number): string {
  return stack.rise === 'up' && levelOf(stack, floor) < 0 ? t('dungeonScene.cellar') : t('dungeonScene.floor', { letter: floorLetter(floor) });
}

/** What a room is in the dungeon's shape, for its heading: its five-room stage, else the boss room; null for any other room. */
function roleOf(room: DungeonRoom): string | null {
  if (room.stage) return t(`dungeonScene.stage.${room.stage}`);
  return room.boss ? t('dungeonScene.bossRoom') : null;
}

/** A room's heading: its key, and what it is in the dungeon's shape where it is something; never what it was built for. */
function headingOf(room: DungeonRoom, key: string): string {
  const role = roleOf(room);
  return role ? t('dungeonScene.heading', { key, role }) : key;
}

/**
 * The normal rooms of a floor as shown (corridors and junctions get no key), in key order: by
 * doors walked from the floor's first room (the entrance on the entry floor, the stairs' landing
 * below it), then in reading order. Keys carry the floor's letter where the dungeon has several floors.
 */
export function keyedRooms(visible: VisibleFloor, floors: number): KeyedRoom[] {
  const { floor, rooms, doors } = visible;
  const walked = hops(neighbours(floor.rooms.length, doors), 0);
  const prefix = floors > 1 ? floorLetter(visible.index) : '';
  return rooms
    .filter(room => room.kind === 'room')
    .sort((a, b) => (walked[a.id] ?? Infinity) - (walked[b.id] ?? Infinity) || a.y - b.y || a.x - b.x || a.id - b.id)
    .map((room, index) => {
      const key = `${prefix}${index + 1}`;
      return { room, key, heading: headingOf(room, key) };
    });
}
