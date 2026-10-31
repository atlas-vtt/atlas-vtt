/**
 * Where a placed room lets the dungeon grow on. Branches that share a seed grow the same subtree;
 * a mirrored pair also flips handedness, so the right twin's subtree is the left one's mirror image.
 */

import type { CellDir, CellPoint } from '../model';
import type { DungeonParams } from '../params';
import { dir, perpendicular } from '../geometry';
import { MAX_SEED, type Rng, chance, int, pick, shuffled } from '../rng';
import { type CaveExit, type WayRoll, wayRollOf } from './cavern/veins/caveExits';
import { type WorkRoom, isNormal, kindOf, localCell } from './workLayout';

export interface Branch {
  origin: CellPoint;
  axis: CellDir;
  /** Mirrors left and right for the whole subtree. */
  flip: boolean;
  seed: number;
  /** Tried in turn when this branch finds no room: a string must not end early. */
  fallbacks: Branch[];
  /** In a cave, the exit this branch leads out by: the door it opens is passed this way. */
  exit?: WayRoll;
  /** In a cave, the passages of a long way still to lay, this branch's first: the cells of floor of each. */
  route?: readonly number[];
}

type Exit = 'left' | 'right' | 'forward';

function newSeed(rng: Rng): number {
  return int(rng, 1, MAX_SEED);
}

function negate(d: CellDir): CellDir {
  return dir(-d.x, -d.y);
}

/** A square normal room keeps its doors at the walls' middles, so it can still turn round. */
function mayTurnRound(room: WorkRoom): boolean {
  return isNormal(room) && room.width === room.depth;
}

function sideDepth(rng: Rng, room: WorkRoom): number {
  const k = int(rng, 1, room.depth - 2);
  return mayTurnRound(room) ? (room.depth - 1) / 2 : k;
}

export function sideBranch(room: WorkRoom, side: 1 | -1, k: number, flip: boolean, seed: number): Branch {
  const sign = (flip ? -1 : 1) * side;
  const half = (room.width - 1) / 2;
  const p = perpendicular(room.axis);
  return { origin: localCell(room, k, sign * half), axis: sign > 0 ? p : negate(p), flip: side > 0 ? flip : !flip, seed, fallbacks: [] };
}

export function forwardBranch(room: WorkRoom, offset: number, flip: boolean, seed: number): Branch {
  const sign = flip ? -1 : 1;
  return { origin: localCell(room, room.depth - 1, sign * offset), axis: room.axis, flip, seed, fallbacks: [] };
}

/** Corridors always lead on; junctions half the time; rooms rarely. */
function forwardChance(room: WorkRoom): number {
  if (isNormal(room)) return 0.1;
  return kindOf(room) === 'junction' ? 0.5 : 1;
}

function randomOffset(rng: Rng, room: WorkRoom): number {
  const half = (room.width - 3) / 2;
  const offset = int(rng, -half, half);
  return mayTurnRound(room) ? 0 : offset;
}

function mirroredBranches(rng: Rng, room: WorkRoom, flip: boolean): Branch[][] {
  let sides = kindOf(room) === 'junction' ? true : chance(rng, 0.5);
  let forward = chance(rng, forwardChance(room));
  if (!sides && !forward) {
    if (chance(rng, 0.5)) sides = true;
    else forward = true;
  }
  const groups: Branch[][] = [];
  if (sides) {
    const k = sideDepth(rng, room);
    const seed = newSeed(rng);
    groups.push([sideBranch(room, 1, k, flip, seed), sideBranch(room, -1, k, flip, seed)]);
  }
  if (forward) groups.push([forwardBranch(room, 0, flip, newSeed(rng))]);
  return groups;
}

function exitBranch(rng: Rng, room: WorkRoom, exit: Exit, flip: boolean): Branch {
  if (exit === 'forward') {
    const offset = randomOffset(rng, room);
    return forwardBranch(room, offset, flip, newSeed(rng));
  }
  const k = sideDepth(rng, room);
  return sideBranch(room, exit === 'left' ? 1 : -1, k, flip, newSeed(rng));
}

function freeBranches(rng: Rng, room: WorkRoom, flip: boolean, sides = 0.5): Branch[][] {
  const exits: Exit[] = [];
  if (chance(rng, sides)) exits.push('left');
  if (chance(rng, sides)) exits.push('right');
  if (chance(rng, forwardChance(room))) exits.push('forward');
  if (exits.length === 0) exits.push(pick(rng, ['left', 'right', 'forward']));
  return exits.map((exit) => [exitBranch(rng, room, exit, flip)]);
}

/** A string has one way on from every room, the others held back in case it is blocked; corridors prefer to run straight. */
function stringBranches(rng: Rng, room: WorkRoom, flip: boolean, tags: ReadonlySet<string>): Branch[][] {
  // Ordered strings run mostly straight on, chaotic ones turn at almost every room.
  const exits: Exit[] = tags.has('ordered') ? ['forward', 'forward', 'forward', 'left', 'right'] : tags.has('chaotic') ? ['left', 'right', 'left', 'right', 'forward'] : isNormal(room) ? ['left', 'right', 'forward'] : ['left', 'right', 'forward', 'forward'];
  const first = pick<Exit>(rng, exits);
  const rest = shuffled(rng, (['left', 'right', 'forward'] as Exit[]).filter((exit) => exit !== first));
  const fallbacks = rest.map((exit) => exitBranch(rng, room, exit, flip));
  return [[{ ...exitBranch(rng, room, first, flip), fallbacks }]];
}

/**
 * A cave chamber's ways on through its walls, from its exit roll: a double's special exit straight
 * on, opposite the way in; the others to the left, the right and on, in a seeded order, three at
 * most. Exits in the roof and floor lead to no room of this floor.
 */
function caveBranches(rng: Rng, room: WorkRoom, flip: boolean, exits: readonly CaveExit[]): Branch[][] {
  const wall = exits.filter((exit) => !exit.vertical);
  const special = wall.find((exit) => exit.special);
  const sides = shuffled<Exit>(rng, special ? ['left', 'right'] : ['left', 'right', 'forward']);
  const placed = wall.filter((exit) => exit !== special).slice(0, sides.length).map((exit, k) => ({ exit, branch: exitBranch(rng, room, sides[k]!, flip) }));
  const ahead = special ? [{ exit: special, branch: forwardBranch(room, 0, flip, newSeed(rng)) }] : [];
  return [...ahead, ...placed].map(({ exit, branch }) => [{ ...branch, exit: wayRollOf(exit) }]);
}

/** What a cave lends a room's branches: a chamber's exit roll, else the way a passage was entered by, which its far door keeps. */
export interface CaveBranching {
  exits: readonly CaveExit[] | null;
  through?: WayRoll;
  /** The chance of each side way off a passage. */
  passageSides: number;
  /** One way on from every room (a burrow), by a chamber's widest wall exit. */
  oneWayOn?: boolean;
}

function withExit(groups: Branch[][], exit: WayRoll): Branch[][] {
  return groups.map((group) => group.map((branch) => ({ ...branch, exit, fallbacks: branch.fallbacks.map((fallback) => ({ ...fallback, exit })) })));
}

/**
 * A passage's ways on, where it was entered by a way: the way runs on through its far door, the
 * route it is part of, while a side way off it is a way of its own, walked.
 */
function onThrough(groups: Branch[][], room: WorkRoom, exit: WayRoll | undefined): Branch[][] {
  if (!exit) return groups;
  const onward = (branch: Branch): Branch => (branch.axis.x === room.axis.x && branch.axis.y === room.axis.y ? { ...branch, exit } : branch);
  return groups.map((group) => group.map((branch) => ({ ...onward(branch), fallbacks: branch.fallbacks.map(onward) })));
}

/**
 * A burrow's one way on: a chamber leaves by its special exit straight on, else by its widest wall
 * exit through any wall, a passage runs straight on; the other walls are tried in turn where the
 * way is blocked, so the tube runs on to its end (a string must not end early, and neither may a
 * burrow, whose end is its maker's den). A blocked special way is no longer opposite the way in,
 * so the walls tried instead take the chamber's next exit. A chamber whose exits all lead up or
 * down still leads on by a plain way, as a string's does.
 */
function oneWayOn(rng: Rng, room: WorkRoom, flip: boolean, cave: CaveBranching): Branch[][] {
  const wall = cave.exits?.filter((exit) => !exit.vertical) ?? [];
  const special = wall.find((exit) => exit.special);
  const plain = wall.find((exit) => !exit.special);
  const turns = shuffled<Exit>(rng, ['left', 'right']);
  const order: Exit[] = isNormal(room) && !special ? shuffled<Exit>(rng, ['forward', ...turns]) : ['forward', ...turns];
  const [first, ...rest] = order.map((exit, k) => (k === 0 && special ? forwardBranch(room, 0, flip, newSeed(rng)) : exitBranch(rng, room, exit, flip)));
  if (!cave.exits) return onThrough([[{ ...first!, fallbacks: rest }]], room, cave.through);
  const by = (exit: CaveExit | undefined, branch: Branch): Branch => (exit ? { ...branch, exit: wayRollOf(exit) } : branch);
  return [[{ ...by(special ?? plain, first!), fallbacks: rest.map((branch) => by(plain, branch)) }]];
}

/** The branches of a placed room, grouped: branches of one group share a seed and a mirror group. */
export function branchesOf(rng: Rng, room: WorkRoom, flip: boolean, params: DungeonParams, cave?: CaveBranching): Branch[][] {
  if (params.string) {
    const lead = cave?.exits?.find((exit) => !exit.vertical);
    const groups = stringBranches(rng, room, flip, params.tags);
    // A chamber's one way on is its exit, whichever wall it leaves by.
    return lead ? withExit(groups, wayRollOf(lead)) : onThrough(groups, room, cave?.through);
  }
  if (cave?.oneWayOn) return oneWayOn(rng, room, flip, cave);
  if (cave?.exits) return caveBranches(rng, room, flip, cave.exits);
  if (cave) return onThrough(pick(rng, params.symmetry) ? mirroredBranches(rng, room, flip) : freeBranches(rng, room, flip, cave.passageSides), room, cave.through);
  return pick(rng, params.symmetry) ? mirroredBranches(rng, room, flip) : freeBranches(rng, room, flip);
}
