/**
 * How well a room type fits a room, and the rules a type must never break there. Every step of
 * assignment (anchors, clusters, fills and swaps) compares rooms by `roomScore` and keeps to
 * `breaksHardRule`.
 */

import type { PlannedFloor } from '../../floors/planFloors';
import type { RoomTypeId } from '../roomTypes';
import type { ClimaxSpec, DepthBand, FloorRule, RoomProgramme, RoomTypeSpec, SizeClass, ThemeFacts } from '../themeTypes';
import { type RoomTraits, roomTraits } from './roomTraits';
import { type TypeGraph, typeGraph } from './typeGraph';

export interface Assignment {
  readonly traits: readonly RoomTraits[];
  readonly graph: TypeGraph;
  readonly programme: RoomProgramme;
  readonly facts: ThemeFacts;
  /** How many floors the dungeon has. */
  readonly floors: number;
  readonly ruined: boolean;
  /** Each normal room's type by its traits index; null while untyped. */
  types: (RoomTypeId | null)[];
  /** Rooms whose type the anchors set, which swaps leave alone. */
  fixed: boolean[];
  pivot: number | null;
  climax: ClimaxSpec | null;
}

/** An assignment of the floors' normal rooms with no room typed yet. */
export function newAssignment(floors: readonly PlannedFloor[], programme: RoomProgramme, facts: ThemeFacts, ruined: boolean): Assignment {
  const traits = roomTraits(floors);
  return {
    traits,
    graph: typeGraph(floors, traits),
    programme,
    facts,
    floors: floors.length,
    ruined,
    types: traits.map(() => null),
    fixed: traits.map(() => false),
    pivot: null,
    climax: null,
  };
}

const SIZES: readonly SizeClass[] = ['tiny', 'small', 'medium', 'large', 'largest'];
const BANDS: readonly DepthBand[] = ['front', 'middle', 'deep', 'deepest'];

const listOf = <T>(value: T | readonly T[] | undefined): readonly T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value as T]);

/** Whether room `i` is still untyped and not anchored. */
export function isFree(a: Assignment, i: number): boolean {
  return a.types[i] === null && !a.fixed[i];
}

/** Whether a programme needs at least one room of the type. */
export function isNeeded(spec: RoomTypeSpec): boolean {
  return spec.required === true || spec.count[0] > 0;
}

/** A type's spec in a programme. */
export function specOf(programme: RoomProgramme, id: RoomTypeId): RoomTypeSpec | undefined {
  return programme.rooms.find((spec) => spec.id === id);
}

/** How many bands lie between a room's depth and the band a type wants; the deepest room lies in the deep band too. */
function bandDistance(wanted: DepthBand, band: DepthBand): number {
  if (wanted !== 'deepest' && band === 'deepest') return Math.abs(BANDS.indexOf(wanted) - BANDS.indexOf('deep'));
  return Math.abs(BANDS.indexOf(wanted) - BANDS.indexOf(band));
}

/** Whether a room keeps a type's floor rule; on one floor, beyond and last read as the deep third. */
function keepsFloor(rule: FloorRule, t: RoomTraits, floors: number): boolean {
  if (rule === 'entrance') return t.floor === 0;
  if (floors === 1) return t.band === 'deep' || t.band === 'deepest';
  return rule === 'beyond' ? t.floor > 0 : t.floor === floors - 1;
}

const plusOrMinus = (match: boolean, plus: number, minus: number): number => (match ? plus : -minus);

/** How well a room's own traits fit a type: depth, size, doors, floor, shape, outer wall and columns. */
export function fitScore(spec: RoomTypeSpec, t: RoomTraits, floors: number): number {
  let score = 0;
  const bands = listOf(spec.depth);
  if (bands.length) {
    // A type of the entrance floor is placed by its depth in that floor.
    const band = spec.floor === 'entrance' ? t.floorBand : t.band;
    const off = Math.min(...bands.map((wanted) => bandDistance(wanted, band)));
    score += off === 0 ? 2 : -3 * off;
  }
  const sizes = listOf(spec.size);
  if (sizes.length) {
    const off = Math.min(...sizes.map((size) => Math.abs(SIZES.indexOf(size) - SIZES.indexOf(t.size))));
    score += off === 0 ? 2 : -off;
  }
  const degrees = listOf(spec.degree);
  if (degrees.length) score += plusOrMinus(degrees.includes(t.degree), 1.5, 1.5);
  if (spec.floor) score += plusOrMinus(keepsFloor(spec.floor, t, floors), 3, 6);
  if (spec.shape) score += plusOrMinus(spec.shape === 'long' ? t.long : t.square, 1, 3);
  if (spec.outerWall) score += plusOrMinus(t.outerWall, 1, 3);
  if (t.colonnade) score += spec.terrain.columns ? 1 : -1;
  return score;
}

function typesAround(a: Assignment, rooms: readonly number[]): Set<RoomTypeId> {
  return new Set(rooms.flatMap((j) => a.types[j] ?? []));
}

/** How well a room's type sits among its neighbours' types: wanted ones next or near, never an `apart` one next. */
export function adjacencyScore(a: Assignment, i: number): number {
  const id = a.types[i];
  const spec = id ? specOf(a.programme, id) : undefined;
  if (!id || !spec) return 0;
  const next = typesAround(a, a.graph.next(i));
  let score = 0;
  if (spec.next?.length) score += spec.next.some((type) => next.has(type)) ? 2 : -2;
  if (spec.near?.length && spec.near.some((type) => typesAround(a, a.graph.near(i)).has(type))) score += 1;
  for (const type of next) if (apart(a.programme, id, type)) score -= 10;
  return score;
}

/** Whether two types must never stand next to each other (either names the other). */
function apart(programme: RoomProgramme, a: RoomTypeId, b: RoomTypeId): boolean {
  return Boolean(specOf(programme, a)?.apart?.includes(b) || specOf(programme, b)?.apart?.includes(a));
}

/** Hazard types want rooms of this much floor: what terrain needs to lay a hazard. */
const HAZARD_AREA = 9;

/** The one score fills and swaps compare: the room's fit, its neighbours and what the theme knows of it. */
export function roomScore(a: Assignment, i: number, id: RoomTypeId): number {
  const t = a.traits[i];
  const spec = specOf(a.programme, id);
  if (!t || !spec) return -Infinity;
  const held = a.types[i] ?? null;
  a.types[i] = id;
  const hazardRoom = spec.terrain.hazards?.length && t.area >= HAZARD_AREA ? 2 : 0;
  const score = fitScore(spec, t, a.floors) + adjacencyScore(a, i) + hazardRoom + a.facts.score(id, { floor: t.floor, room: t.room });
  a.types[i] = held;
  return score;
}

/** How many rooms other than `i` hold `id`, on `i`'s floor where the type counts per floor. */
export function heldCount(a: Assignment, id: RoomTypeId, i: number, perFloor = false): number {
  const floor = a.traits[i]?.floor;
  return a.types.filter((type, j) => j !== i && type === id && (!perFloor || a.traits[j]?.floor === floor)).length;
}

/** Whether the room's neighbours hold the types its type needs next to it. */
function lacksNeighbours(a: Assignment, i: number, spec: RoomTypeSpec): boolean {
  if (!spec.nextRule || !spec.next?.length) return false;
  const next = typesAround(a, a.graph.next(i));
  return spec.nextRule === 'all' ? !spec.next.every((type) => next.has(type)) : !spec.next.some((type) => next.has(type));
}

/**
 * Whether a room lies on the branch of the pivot that holds the core of the cluster `id`'s cluster
 * keeps apart from (the private rooms off the service wing's branch).
 */
function onApartBranch(a: Assignment, i: number, id: RoomTypeId): boolean {
  if (a.pivot === null) return false;
  const cluster = a.programme.clusters.find((c) => c.apartFrom && (c.core === id || c.members.includes(id)));
  const other = cluster && a.programme.clusters.find((c) => c.id === cluster.apartFrom);
  const core = other ? a.types.indexOf(other.core) : -1;
  if (core < 0) return false;
  const branch = a.graph.branchOf(a.pivot, core);
  return branch !== null && a.graph.branchOf(a.pivot, i) === branch;
}

/** Whether a room is larger than the smallest normal room of its floor. */
function largerThanSmallest(a: Assignment, t: RoomTraits): boolean {
  return a.traits.some((other) => other.floor === t.floor && other.area < t.area);
}

/** Rules a filler may leave aside: how many of it there are, and the branch its cluster keeps off. */
export interface Relaxed {
  counts?: boolean;
  branches?: boolean;
}

/** What a filler may leave aside where nothing else fits. */
export const FILLER_RELAXED: Relaxed = { counts: false, branches: false };

/** Whether a spec names a trait the room lacks, for a type whose traits are rules (`strict`). */
function missesTrait(spec: RoomTypeSpec, t: RoomTraits): boolean {
  const band = spec.floor === 'entrance' ? t.floorBand : t.band;
  const bands = listOf(spec.depth);
  if (bands.length && !bands.some((wanted) => bandDistance(wanted, band) === 0)) return true;
  if (spec.size && !listOf(spec.size).includes(t.size)) return true;
  if (spec.degree && !listOf(spec.degree).includes(t.degree)) return true;
  return (spec.shape === 'long' && !t.long) || (spec.shape === 'square' && !t.square);
}

/**
 * Whether a type of the theme's programme may not stand in room `i` at all. A filler may leave
 * its count and its cluster's branch aside (`relaxed`): fillers fill every room left over.
 */
export function breaksHardRule(a: Assignment, i: number, id: RoomTypeId, relaxed: Relaxed = {}): boolean {
  const t = a.traits[i];
  const spec = specOf(a.programme, id);
  if (!t || !spec) return true;
  if (spec.floor === 'entrance' && t.floor !== 0) return true;
  if (spec.floor === 'beyond' && a.floors > 1 && t.floor === 0) return true;
  if (spec.floor === 'last' && a.floors > 1 && t.floor !== a.floors - 1) return true;
  if (spec.ruinedOnly && !a.ruined) return true;
  if (spec.climaxOnly && !t.boss) return true;
  if (spec.holdsStairs && !t.stairs) return true;
  if (spec.outerWall && !t.outerWall) return true;
  if (spec.size === 'largest' && t.size !== 'largest') return true;
  if (spec.smallest && largerThanSmallest(a, t)) return true;
  if (spec.strict && missesTrait(spec, t)) return true;
  if (relaxed.counts !== false && heldCount(a, id, i, spec.perFloor) >= spec.count[1]) return true;
  if (lacksNeighbours(a, i, spec)) return true;
  if (spec.nearRule && spec.near?.length && !spec.near.some((type) => typesAround(a, a.graph.near(i)).has(type))) return true;
  if (relaxed.branches !== false && onApartBranch(a, i, id)) return true;
  if (a.graph.next(i).some((j) => a.types[j] && apart(a.programme, id, a.types[j]))) return true;
  return !a.facts.allows(id, { floor: t.floor, room: t.room });
}
