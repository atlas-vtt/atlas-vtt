import type { DungeonFloor, DungeonModel, DungeonRoom } from '../../../src/app/dungeons/model';
import { distances, normals } from './dungeonInvariants';

/**
 * Where a themed dungeon's rooms stand, read from the model alone, written apart from the
 * generator: the rooms next to a room (a door, or only corridors and junctions between), how deep
 * a room lies, which branch of a hall it is on, and whether a way between two rooms avoids a third.
 */

export interface Place {
  floor: number;
  room: number;
}

const key = (p: Place): string => `${p.floor}:${p.room}`;

export function typeOf(model: DungeonModel, p: Place): string | undefined {
  return model.floors[p.floor]?.rooms[p.room]?.type;
}

/** Every normal room of every floor holding `type`. */
export function roomsOfType(model: DungeonModel, type: string): Place[] {
  return model.floors.flatMap((floor, f) => normals(floor).filter((room) => room.type === type).map((room) => ({ floor: f, room: room.id })));
}

/** The normal rooms reached from `room` on its floor through doors, corridors and junctions alone. */
export function nextRooms(floor: DungeonFloor, room: number): number[] {
  const out = new Set<number>();
  const seen = new Set([room]);
  const queue = [room];
  while (queue.length) {
    const at = queue.shift() as number;
    for (const door of floor.doors) {
      const other = door.from === at ? door.to : door.to === at ? door.from : null;
      if (other === null || seen.has(other)) continue;
      seen.add(other);
      if (floor.rooms[other]?.kind === 'room') out.add(other);
      else queue.push(other);
    }
  }
  return [...out];
}

/** Rooms within two normal rooms of `room`. */
export function nearRooms(floor: DungeonFloor, room: number): number[] {
  const next = nextRooms(floor, room);
  return [...new Set([...next, ...next.flatMap((r) => nextRooms(floor, r))])].filter((r) => r !== room);
}

/** The room a party enters the dungeon by: room 0 of the entry floor, else its normal room nearest it, the boss room only where it is the only one. */
export function entranceRoom(model: DungeonModel): Place {
  const floor = model.floors[0] as DungeonFloor;
  if (floor.rooms[0]?.kind === 'room') return { floor: 0, room: 0 };
  const depth = distances(floor, 0);
  // Never the boss room where the floor has another: the boss room is its climax.
  const others = normals(floor).filter((room) => !room.boss);
  const nearest = [...(others.length ? others : normals(floor))].sort((a, b) => (depth.get(a.id) ?? Infinity) - (depth.get(b.id) ?? Infinity) || a.id - b.id)[0] as DungeonRoom;
  return { floor: 0, room: nearest.id };
}

/** How far into its floor a room lies, 0 at its room 0 to under 1 at its farthest room. */
export function floorDepth(floor: DungeonFloor, room: number): number {
  const depth = distances(floor, 0);
  const max = Math.max(0, ...[...depth.values()].filter(Number.isFinite));
  return (depth.get(room) ?? max) / (max + 1);
}

/** Every room of every floor as one graph: doors, and stairwells between the rooms that hold their two ends. */
function wholeGraph(model: DungeonModel): Map<string, Place[]> {
  const out = new Map<string, Place[]>();
  const link = (a: Place, b: Place): void => {
    out.set(key(a), [...(out.get(key(a)) ?? []), b]);
    out.set(key(b), [...(out.get(key(b)) ?? []), a]);
  };
  const ends = new Map<number, Place[]>();
  model.floors.forEach((floor, f) => {
    for (const door of floor.doors) if (door.from !== null && door.to !== null) link({ floor: f, room: door.from }, { floor: f, room: door.to });
    for (const stair of floor.stairs) {
      const holder = floor.rooms.find((r) => r.kind === 'room' && stair.x >= r.x && stair.x < r.x + r.w && stair.y >= r.y && stair.y < r.y + r.h);
      if (holder) ends.set(stair.link, [...(ends.get(stair.link) ?? []), { floor: f, room: holder.id }]);
    }
  });
  for (const [a, b] of ends.values()) if (a && b) link(a, b);
  return out;
}

/** Whether some way leads from `from` to `to` without passing through `avoid`. */
export function wayAvoids(model: DungeonModel, from: Place, to: Place, avoid: Place): boolean {
  const graph = wholeGraph(model);
  const seen = new Set([key(from), key(avoid)]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift() as Place;
    if (key(at) === key(to)) return true;
    for (const next of graph.get(key(at)) ?? []) {
      if (seen.has(key(next))) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return false;
}

/** The first normal room after `hub` on a shortest way to `p` (by breadth first, lowest ids first); null for the hub itself. */
export function branchOf(model: DungeonModel, hub: Place, p: Place): string | null {
  if (key(hub) === key(p)) return null;
  const graph = wholeGraph(model);
  const first = new Map<string, string | null>([[key(hub), null]]);
  const queue = [hub];
  while (queue.length) {
    const at = queue.shift() as Place;
    const nexts = [...(graph.get(key(at)) ?? [])].sort((a, b) => a.floor - b.floor || a.room - b.room);
    for (const next of nexts) {
      if (first.has(key(next))) continue;
      const normal = model.floors[next.floor]?.rooms[next.room]?.kind === 'room';
      const inherited = first.get(key(at)) ?? null;
      first.set(key(next), inherited ?? (normal ? key(next) : null));
      queue.push(next);
    }
  }
  return first.get(key(p)) ?? null;
}

/** Whether a room has a wall no other room's walls lie on or within a cell beyond. */
export function onOuterWall(floor: DungeonFloor, room: DungeonRoom): boolean {
  const walls = (r: DungeonRoom) => ({ x0: r.x - 1, y0: r.y - 1, x1: r.x + r.w, y1: r.y + r.h });
  const w = walls(room);
  const others = floor.rooms.filter((r) => r.id !== room.id).map(walls);
  const sides = [
    { x0: w.x0 + 1, x1: w.x1 - 1, y0: w.y0 - 1, y1: w.y0 },
    { x0: w.x0 + 1, x1: w.x1 - 1, y0: w.y1, y1: w.y1 + 1 },
    { x0: w.x0 - 1, x1: w.x0, y0: w.y0 + 1, y1: w.y1 - 1 },
    { x0: w.x1, x1: w.x1 + 1, y0: w.y0 + 1, y1: w.y1 - 1 },
  ];
  return sides.some((s) => others.every((o) => o.x1 < s.x0 || s.x1 < o.x0 || o.y1 < s.y0 || s.y1 < o.y0));
}

/** Pairs of types that must never stand next to each other, wherever both stand. */
export function apartProblems(model: DungeonModel, pairs: readonly (readonly [string, string])[]): string[] {
  return model.floors.flatMap((floor, f) =>
    normals(floor).flatMap((room) =>
      nextRooms(floor, room.id).flatMap((other) => {
        const pair = pairs.find(([a, b]) => a === room.type && b === floor.rooms[other]?.type);
        return pair ? [`floor ${f}: ${pair[0]} ${room.id} next to ${pair[1]} ${other}`] : [];
      }),
    ),
  );
}

/** Normal rooms without a type, or of a type the theme's own ids do not hold. */
export function typingProblems(model: DungeonModel, ids: ReadonlySet<string>): string[] {
  return model.floors.flatMap((floor, f) =>
    floor.rooms.flatMap((room) => {
      if (room.kind !== 'room') return room.type ? [`floor ${f}: ${room.kind} ${room.id} has a type`] : [];
      if (!room.type) return [`floor ${f}: room ${room.id} has no type`];
      return ids.has(room.type) ? [] : [`floor ${f}: room ${room.id} is a ${room.type}`];
    }),
  );
}
