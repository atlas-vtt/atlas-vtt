/**
 * Rooms that belong together, placed as units: each cluster's core next to or near its anchor (the
 * pivot or the entrance), off the branch of the cluster it keeps apart from, and its members next
 * to the core, else near it.
 */

import { type Rng, chance } from '../../rng';
import type { RoomTypeId } from '../roomTypes';
import type { ClusterId, ClusterSpec, FloorRule } from '../themeTypes';
import { entranceRoom } from './anchors';
import { type Assignment, breaksHardRule, heldCount, isFree, isNeeded, roomScore, specOf } from './score';

/** The chance an optional member is placed while free rooms remain for the required types. */
const OPTIONAL_MEMBER = 0.6;

function keepsClusterFloor(a: Assignment, i: number, rule: FloorRule | undefined): boolean {
  const floor = a.traits[i]?.floor ?? 0;
  if (!rule || a.floors === 1) return true;
  if (rule === 'entrance') return floor === 0;
  return rule === 'beyond' ? floor > 0 : floor === a.floors - 1;
}

/** The free room among `rooms` where `id` scores best, breaking no rule; null where none may take it. */
function bestRoom(a: Assignment, rooms: readonly number[], id: RoomTypeId): number | null {
  let best: number | null = null;
  let bestScore = -Infinity;
  for (const i of rooms) {
    if (!isFree(a, i) || breaksHardRule(a, i, id)) continue;
    const score = roomScore(a, i, id);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

/** How many required types are still unplaced: the rooms clusters must leave for them. */
function stillRequired(a: Assignment): number {
  return a.programme.rooms.filter((spec) => isNeeded(spec) && !a.types.includes(spec.id)).length;
}

/**
 * Where a cluster's core may stand: by its link to the anchor (next to it or near it) on the
 * anchor's floor, anywhere on the floors a cluster's floor rule sends it to off the anchor's floor,
 * never on the branch of the core it keeps apart from.
 */
function coreRooms(a: Assignment, cluster: ClusterSpec, anchor: number | null, cores: ReadonlyMap<ClusterId, number>): number[] {
  const apartCore = cluster.apartFrom === undefined ? undefined : cores.get(cluster.apartFrom);
  const apartBranch = apartCore === undefined || a.pivot === null ? null : a.graph.branchOf(a.pivot, apartCore);
  const linked = anchor === null ? null : new Set(cluster.link === 'next' ? a.graph.next(anchor) : a.graph.near(anchor));
  const anchorFloor = anchor === null ? null : a.traits[anchor]?.floor;
  return a.traits.flatMap((t) => {
    if (!keepsClusterFloor(a, t.index, cluster.floor)) return [];
    if (linked && t.floor === anchorFloor && !linked.has(t.index)) return [];
    if (apartBranch !== null && a.pivot !== null && a.graph.branchOf(a.pivot, t.index) === apartBranch) return [];
    return [t.index];
  });
}

function anchorOf(a: Assignment, cluster: ClusterSpec): number | null {
  if (cluster.anchor === 'pivot') return a.pivot;
  return cluster.anchor === 'entrance' ? entranceRoom(a) : null;
}

/** Each cluster's core and members; a cluster that finds no room for its core places nothing. */
export function placeClusters(rng: Rng, a: Assignment): void {
  const cores = new Map<ClusterId, number>();
  for (const cluster of a.programme.clusters) {
    const placed = a.types.indexOf(cluster.core);
    const core = placed >= 0 ? placed : bestRoom(a, coreRooms(a, cluster, anchorOf(a, cluster), cores), cluster.core);
    if (core === null) continue;
    a.types[core] = cluster.core;
    cores.set(cluster.id, core);
    for (const member of cluster.members) {
      const spec = specOf(a.programme, member);
      if (!spec || heldCount(a, member, -1) >= spec.count[1]) continue;
      const optional = !spec.required && spec.count[0] === 0;
      const freeRooms = a.types.filter((_, i) => isFree(a, i)).length;
      if (optional && (freeRooms <= stillRequired(a) || !chance(rng, OPTIONAL_MEMBER))) continue;
      const near = a.graph.near(core).filter((i) => keepsClusterFloor(a, i, cluster.floor));
      const room = bestRoom(a, a.graph.next(core), member) ?? bestRoom(a, near, member);
      if (room !== null) a.types[room] = member;
    }
  }
}
