/**
 * The rooms of a floor as a graph, its doors the edges (a door to the outside is none): ways
 * through, loops, and how far rooms lie apart in doors walked. Shared by the generator's rules
 * and furnishing, for work layouts and finished floors alike.
 */

import type { DoorKind } from './model';

export interface GraphDoor {
  kind: DoorKind;
  from: number | null;
  to: number | null;
}

interface Edge {
  a: number;
  b: number;
}

/** One edge per pair of rooms a door joins: two doors between the same rooms are no loop. */
function edgesOf(doors: readonly GraphDoor[], include: (door: GraphDoor) => boolean): Edge[] {
  const seen = new Set<string>();
  return doors.flatMap((door) => {
    if (door.from === null || door.to === null || !include(door)) return [];
    const key = `${Math.min(door.from, door.to)}:${Math.max(door.from, door.to)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ a: door.from, b: door.to }];
  });
}

/** Every door between two rooms. */
export const anyDoor = (): boolean => true;
/** The doors a party finds without searching: all but secret doors. */
export const openDoor = (door: GraphDoor): boolean => door.kind !== 'secret';

/** Rooms each room's doors lead to. */
export function neighbours(roomCount: number, doors: readonly GraphDoor[], include: (door: GraphDoor) => boolean = anyDoor): number[][] {
  const out: number[][] = Array.from({ length: roomCount }, () => []);
  for (const { a, b } of edgesOf(doors, include)) {
    out[a]?.push(b);
    out[b]?.push(a);
  }
  return out;
}

/** Doors walked from `start` to every room; Infinity where no way leads. */
export function hops(adjacent: readonly number[][], start: number): number[] {
  const out = adjacent.map(() => Infinity);
  if (start < 0 || start >= adjacent.length) return out;
  out[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as number;
    for (const next of adjacent[at] ?? []) {
      if (out[next] !== Infinity) continue;
      out[next] = (out[at] ?? 0) + 1;
      queue.push(next);
    }
  }
  return out;
}

/** The room farthest from where `distances` were measured (the lowest id of equals); -1 if none is reached. */
export function farthestRoom(distances: readonly number[]): number {
  let best = -1;
  distances.forEach((d, id) => {
    if (Number.isFinite(d) && (best < 0 || d > (distances[best] ?? -1))) best = id;
  });
  return best;
}

/** A shortest way from `start` to `end`, both included, or [] where none leads. */
export function shortestPath(adjacent: readonly number[][], start: number, end: number): number[] {
  const fromEnd = hops(adjacent, end);
  if (!Number.isFinite(fromEnd[start])) return [];
  const path = [start];
  for (let at = start; at !== end; ) {
    const next = (adjacent[at] ?? []).filter((n) => (fromEnd[n] ?? Infinity) === (fromEnd[at] ?? 0) - 1).sort((x, y) => x - y)[0];
    if (next === undefined) return [];
    path.push(next);
    at = next;
  }
  return path;
}

/** Independent loops: doors minus rooms plus the parts the doors split the rooms into (E − V + C). */
export function loopCount(roomCount: number, doors: readonly GraphDoor[], include: (door: GraphDoor) => boolean = anyDoor): number {
  const edges = edgesOf(doors, include);
  const parent = Array.from({ length: roomCount }, (_, i) => i);
  const root = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] as number;
    return r;
  };
  let parts = roomCount;
  for (const { a, b } of edges) {
    const ra = root(a);
    const rb = root(b);
    if (ra !== rb) {
      parent[ra] = rb;
      parts--;
    }
  }
  return edges.length - roomCount + parts;
}

/** The rooms that lie on a loop: those with a door whose loss would still leave a way between its rooms. */
export function roomsOnLoops(roomCount: number, doors: readonly GraphDoor[], include: (door: GraphDoor) => boolean = anyDoor): Set<number> {
  const edges = edgesOf(doors, include);
  const incident: number[][] = Array.from({ length: roomCount }, () => []);
  edges.forEach(({ a, b }, k) => {
    incident[a]?.push(k);
    incident[b]?.push(k);
  });
  const order = new Array<number>(roomCount).fill(-1);
  const low = new Array<number>(roomCount).fill(0);
  const out = new Set<number>();
  let time = 0;
  for (let start = 0; start < roomCount; start++) {
    if (order[start] !== -1) continue;
    // Iterative depth-first search, remembering the edge each room was entered by
    const stack: { room: number; via: number; next: number }[] = [{ room: start, via: -1, next: 0 }];
    order[start] = low[start] = time++;
    while (stack.length > 0) {
      const top = stack[stack.length - 1] as (typeof stack)[number];
      const list = incident[top.room] ?? [];
      if (top.next < list.length) {
        const k = list[top.next++] as number;
        if (k === top.via) continue;
        const edge = edges[k] as Edge;
        const other = edge.a === top.room ? edge.b : edge.a;
        if (order[other] === -1) {
          order[other] = low[other] = time++;
          stack.push({ room: other, via: k, next: 0 });
        } else {
          low[top.room] = Math.min(low[top.room] as number, order[other] as number);
        }
        continue;
      }
      stack.pop();
      const parent = stack[stack.length - 1];
      if (!parent) continue;
      low[parent.room] = Math.min(low[parent.room] as number, low[top.room] as number);
      // The edge into `top` is no bridge: both its rooms lie on a loop
      if ((low[top.room] as number) <= (order[parent.room] as number)) {
        out.add(top.room);
        out.add(parent.room);
      }
    }
  }
  return out;
}
