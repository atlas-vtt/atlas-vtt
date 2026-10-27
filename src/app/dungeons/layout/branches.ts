/**
 * Where a placed room lets the dungeon grow on. Branches that share a seed grow the same subtree;
 * a mirrored pair also flips handedness, so the right twin's subtree is the left one's mirror image.
 */

import type { CellDir, CellPoint } from '../model';
import type { DungeonParams } from '../params';
import { dir, perpendicular } from '../geometry';
import { MAX_SEED, type Rng, chance, int, pick, shuffled } from '../rng';
import { type WorkRoom, isNormal, kindOf, localCell } from './workLayout';

export interface Branch {
  origin: CellPoint;
  axis: CellDir;
  /** Mirrors left and right for the whole subtree. */
  flip: boolean;
  seed: number;
  /** Tried in turn when this branch finds no room: a string must not end early. */
  fallbacks: Branch[];
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

function sideBranch(room: WorkRoom, side: 1 | -1, k: number, flip: boolean, seed: number): Branch {
  const sign = (flip ? -1 : 1) * side;
  const half = (room.width - 1) / 2;
  const p = perpendicular(room.axis);
  return { origin: localCell(room, k, sign * half), axis: sign > 0 ? p : negate(p), flip: side > 0 ? flip : !flip, seed, fallbacks: [] };
}

function forwardBranch(room: WorkRoom, offset: number, flip: boolean, seed: number): Branch {
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

function freeBranches(rng: Rng, room: WorkRoom, flip: boolean): Branch[][] {
  const exits: Exit[] = [];
  if (chance(rng, 0.5)) exits.push('left');
  if (chance(rng, 0.5)) exits.push('right');
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

/** The branches of a placed room, grouped: branches of one group share a seed and a mirror group. */
export function branchesOf(rng: Rng, room: WorkRoom, flip: boolean, params: DungeonParams): Branch[][] {
  if (params.string) return stringBranches(rng, room, flip, params.tags);
  return pick(rng, params.symmetry) ? mirroredBranches(rng, room, flip) : freeBranches(rng, room, flip);
}
