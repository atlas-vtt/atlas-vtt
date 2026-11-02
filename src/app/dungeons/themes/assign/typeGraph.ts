/**
 * The normal rooms of every floor as room-type assignment sees them: which rooms are next to each
 * other (a door, or only corridors and junctions between), which lie within two rooms, which branch
 * of the pivot hall a room lies on (through its stairwells on other floors), and whether a way
 * between two rooms avoids a third. Rooms are named by their index in `roomTraits`.
 */

import type { PlannedFloor } from '../../floors/planFloors';
import { holdsStairs } from '../../geometry';
import { neighbours } from '../../roomGraph';
import type { RoomTraits } from './roomTraits';

export interface TypeGraph {
  next(i: number): readonly number[];
  near(i: number): readonly number[];
  /** The first normal room after `pivot` on the way to `i`; null on the pivot, on the way back to the entrance, and where no way leads. */
  branchOf(pivot: number, i: number): number | null;
  /** Whether a way leads from `from` to `to` without passing through `avoid`. */
  pathAvoids(from: number, to: number, avoid: number): boolean;
}

/** Every room of every floor in one graph, its doors and stairwells the edges; node = offset of its floor + room id. */
interface WholeGraph {
  adjacent: number[][];
  offsets: number[];
  /** The traits index of each node that is a normal room; -1 for corridors and junctions. */
  normal: number[];
}

function wholeGraph(floors: readonly PlannedFloor[], traits: readonly RoomTraits[]): WholeGraph {
  const offsets: number[] = [];
  let total = 0;
  for (const floor of floors) {
    offsets.push(total);
    total += floor.rooms.length;
  }
  const adjacent: number[][] = [];
  floors.forEach((floor, f) => {
    for (const list of neighbours(floor.rooms.length, floor.doors)) adjacent.push(list.map((room) => room + (offsets[f] ?? 0)));
  });
  const holders = new Map<number, number[]>();
  floors.forEach((floor, f) => {
    for (const stair of floor.stairs) {
      const room = floor.rooms.find((r) => r.kind === 'room' && holdsStairs(r, [stair]));
      if (room) holders.set(stair.link, [...(holders.get(stair.link) ?? []), room.id + (offsets[f] ?? 0)]);
    }
  });
  for (const [a, b] of holders.values()) {
    if (a === undefined || b === undefined) continue;
    adjacent[a]?.push(b);
    adjacent[b]?.push(a);
  }
  for (const list of adjacent) list.sort((x, y) => x - y);
  const normal = new Array<number>(total).fill(-1);
  for (const t of traits) normal[t.room + (offsets[t.floor] ?? 0)] = t.index;
  return { adjacent, offsets, normal };
}

/** The normal rooms reached from `start` on its own floor through corridors and junctions alone. */
function nextOf(graph: WholeGraph, start: number, floorOf: (node: number) => number): number[] {
  const out: number[] = [];
  const seen = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    for (const node of graph.adjacent[queue[head] as number] ?? []) {
      if (seen.has(node) || floorOf(node) !== floorOf(start)) continue;
      seen.add(node);
      if ((graph.normal[node] ?? -1) >= 0) out.push(graph.normal[node] as number);
      else queue.push(node);
    }
  }
  return out.sort((a, b) => a - b);
}

/** For every node, the first normal room after `pivot` on the breadth-first way to it (-1 for none). */
function firstSteps(graph: WholeGraph, pivot: number): number[] {
  const first = new Array<number>(graph.adjacent.length).fill(-1);
  const seen = new Set([pivot]);
  const queue = [pivot];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as number;
    for (const node of graph.adjacent[at] ?? []) {
      if (seen.has(node)) continue;
      seen.add(node);
      first[node] = at === pivot || (first[at] ?? -1) < 0 ? ((graph.normal[node] ?? -1) >= 0 ? node : -1) : (first[at] as number);
      queue.push(node);
    }
  }
  return first;
}

export function typeGraph(floors: readonly PlannedFloor[], traits: readonly RoomTraits[]): TypeGraph {
  const graph = wholeGraph(floors, traits);
  const node = (i: number): number => (traits[i]?.room ?? 0) + (graph.offsets[traits[i]?.floor ?? 0] ?? 0);
  const floorOf = (n: number): number => graph.offsets.findLastIndex((offset) => offset <= n);
  const nexts = traits.map((t) => nextOf(graph, node(t.index), floorOf));
  const nears = nexts.map((list, i) => [...new Set([...list, ...list.flatMap((j) => nexts[j] ?? [])])].filter((j) => j !== i).sort((a, b) => a - b));
  const branches = new Map<number, number[]>();
  const entrance = graph.offsets[0] ?? 0;
  return {
    next: (i) => nexts[i] ?? [],
    near: (i) => nears[i] ?? [],
    branchOf(pivot, i) {
      if (pivot === i) return null;
      let first = branches.get(pivot);
      if (!first) {
        first = firstSteps(graph, node(pivot));
        branches.set(pivot, first);
      }
      const step = first[node(i)] ?? -1;
      if (step < 0 || (node(pivot) !== entrance && step === first[entrance])) return null;
      return graph.normal[step] ?? null;
    },
    pathAvoids(from, to, avoid) {
      const [start, end, barred] = [node(from), node(to), node(avoid)];
      if (start === barred || end === barred) return false;
      const seen = new Set([start, barred]);
      const queue = [start];
      for (let head = 0; head < queue.length; head++) {
        const at = queue[head] as number;
        if (at === end) return true;
        for (const n of graph.adjacent[at] ?? []) {
          if (seen.has(n)) continue;
          seen.add(n);
          queue.push(n);
        }
      }
      return false;
    },
  };
}
