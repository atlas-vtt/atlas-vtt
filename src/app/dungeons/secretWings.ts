import type { DungeonRoom } from './model';

/**
 * The secret wing a room lies in, named by the id of the wing's first room (the one behind its
 * secret door), or null for a room outside every secret wing. Wings never nest, so the first room
 * is the last secret one up the room's line of parents.
 */
export function secretWingOf(rooms: readonly DungeonRoom[], id: number): number | null {
  const byId = new Map(rooms.map((room) => [room.id, room] as const));
  let room = byId.get(id);
  if (!room || room.wing !== 'secret') return null;
  for (let parent = room.parent; parent !== null; parent = room.parent) {
    const above = byId.get(parent);
    if (!above || above.wing !== 'secret') break;
    room = above;
  }
  return room.id;
}
