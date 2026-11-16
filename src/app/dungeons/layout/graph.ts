/**
 * Walking costs through the dungeon. Each door costs 1 plus 1 for every normal room it joins, so
 * a way through halls weighs more than one along corridors.
 */

import type { DoorKind } from '../model';

export interface GraphDoor {
  kind: DoorKind;
  from: number | null;
  to: number | null;
}

export interface Edge {
  to: number;
  cost: number;
}

export function adjacency(roomCount: number, doors: readonly GraphDoor[], isNormal: (id: number) => boolean): Edge[][] {
  const edges: Edge[][] = Array.from({ length: roomCount }, () => []);
  for (const door of doors) {
    if (door.from === null || door.to === null) continue;
    const cost = 1 + (isNormal(door.from) ? 1 : 0) + (isNormal(door.to) ? 1 : 0);
    edges[door.from]?.push({ to: door.to, cost });
    edges[door.to]?.push({ to: door.from, cost });
  }
  return edges;
}

/** Cheapest cost from `start` to every room; Infinity where no way leads. Costs are small integers, so buckets beat a heap. */
export function pathCosts(edges: readonly Edge[][], start: number): number[] {
  const cost = edges.map(() => Infinity);
  const buckets: number[][] = [[start]];
  cost[start] = 0;
  for (let c = 0; c < buckets.length; c++) {
    for (const at of buckets[c] ?? []) {
      if (cost[at] !== c) continue;
      for (const edge of edges[at] ?? []) {
        const next = c + edge.cost;
        if (next >= (cost[edge.to] ?? Infinity)) continue;
        cost[edge.to] = next;
        while (buckets.length <= next) buckets.push([]);
        buckets[next]?.push(edge.to);
      }
    }
  }
  return cost;
}
