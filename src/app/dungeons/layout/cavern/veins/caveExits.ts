/**
 * A cave chamber's exits, rolled as the book rolls them (Veins of the Earth): two d6, the largest
 * exit as many feet wide as they show together, and as many smaller exits as they lie apart, each
 * half the one before. A double makes the largest exit special and puts it opposite the way in.
 * Each exit leads through a wall, or up through the roof or down through the floor; its size against
 * a human body says how it is passed, and one up or down also how far it rises or drops.
 */

import { type CaveWay, SPECIAL_WAYS } from '../../../caveModel';
import type { CaveVerticalExits, VerticalKind, VerticalWay } from '../../../model';
import { type Rng, chance, int, pick, weighted } from '../../../rng';
import { verticalDepth } from './routeLength';

/** One exit of a chamber: its width (or height) in feet and how it is passed; a roof or floor exit leads up or down. */
export interface CaveExit {
  width: number;
  way: CaveWay;
  vertical?: 'up' | 'down';
  /** How far a roof or floor exit rises or drops, in feet; set on every one a roll makes. */
  depth?: number;
  /** The largest exit of a double: a traverse, sump, letterbox or breakdown, opposite the way in. */
  special?: true;
  /** The width the dice gave, in feet, before the cave's character bent it. */
  rolled?: number;
}

/** What a way through the rock carries from the exit it was rolled as, and whether a double made it special. */
export type WayRoll = Pick<CaveExit, 'way' | 'width' | 'special'>;

/** The way an exit is passed, as a way through the rock carries it on. */
export function wayRollOf(exit: CaveExit): WayRoll {
  return { way: exit.way, width: exit.width, ...(exit.special && { special: true }) };
}

/** How a cave's character bends its exits. */
export interface ExitRules {
  /** Feet every exit rolls smaller, never below one: a cave that keeps its roofs low. */
  shrink: number;
  /** Most crawls narrow to squeezes, so squeezes come twice as often: a cave that narrows to a squeeze before it opens. */
  squeezes: boolean;
  /** No exit stands high enough to walk: a walk is a crawl. */
  noWalk: boolean;
  /** Where roof and floor exits go: either, or all down (exits hidden in the floor), or all up. */
  vertical: 'any' | 'up' | 'down';
  /** Where either may be, the share that leads up: a half, less in a fault that falls away, more where gas rots the rock upward. */
  upShare: number;
  /** A double's special way is a breakdown twice as often as any other: a cave whose boulders lie balanced everywhere. */
  breakdowns: boolean;
}

export const PLAIN_EXITS: ExitRules = { shrink: 0, squeezes: false, noWalk: false, vertical: 'any', upShare: 0.5, breakdowns: false };

/** A face of the die in six is the roof, one the floor: a third of exits lead up or down. */
export const VERTICAL_CHANCE = 1 / 3;
/** The widest a crawl is, in feet: one wider stands as a walk. */
export const CRAWL_WIDTH = 4;
const SQUEEZE_WIDTH = 2;
/** The share of crawls that narrow to squeezes where the cave narrows before it opens: about as many as a plain roll's squeezes, so they come twice as often. */
const NARROWING = 0.75;

/** How a way of this many feet is passed: upright from 5 ft, on all fours at 3 to 4, on the belly at 2, flat with an arm forward at 1. */
export function wayOfWidth(ft: number): CaveWay {
  if (ft >= 5) return 'walk';
  if (ft >= 3) return 'crawl';
  return ft >= 2 ? 'squeeze' : 'letterbox';
}

/** How a way up or down of this many feet is passed, as `wayOfWidth` says of one across: a walk's width is a shaft, a crawl's a chimney, narrower a vertical squeeze. */
export function verticalKindOf(ft: number): VerticalKind {
  const way = wayOfWidth(ft);
  if (way === 'walk') return 'shaft';
  return way === 'crawl' ? 'chimney' : 'squeeze';
}

/** The exit widths of a roll, largest first: each half the one before, rounded up; an exit of 1 ft is left out, but once kept as a letterbox after one of 2 ft. */
export function exitWidths(d1: number, d2: number): number[] {
  const widths = [d1 + d2];
  for (let k = 0; k < Math.abs(d1 - d2); k++) {
    const before = widths[widths.length - 1]!;
    const next = Math.ceil(before / 2);
    if (next <= 1 && (before !== SQUEEZE_WIDTH || widths.includes(1))) break;
    widths.push(next);
  }
  return widths;
}

/** One exit's width once the cave's character has bent it; its draws are made whatever the rules say. */
function bentWidth(rng: Rng, width: number, rules: ExitRules): number {
  const narrows = chance(rng, NARROWING);
  const low = Math.max(1, width - rules.shrink);
  const squeezed = rules.squeezes && narrows && wayOfWidth(low) === 'crawl' ? SQUEEZE_WIDTH : low;
  return rules.noWalk ? Math.min(CRAWL_WIDTH, squeezed) : squeezed;
}

/** Up or down for a roof or floor exit, a third of the time; its draws are made whatever the rules say. */
function verticalOf(rng: Rng, rules: ExitRules): 'up' | 'down' | undefined {
  const vertical = chance(rng, VERTICAL_CHANCE);
  const up = chance(rng, rules.upShare);
  if (!vertical) return undefined;
  return rules.vertical === 'any' ? (up ? 'up' : 'down') : rules.vertical;
}

/** A double's special way: any of the four alike, or breakdown twice as often where the rules say; one draw either way. */
function specialWay(rng: Rng, rules: ExitRules): CaveWay {
  if (!rules.breakdowns) return pick(rng, SPECIAL_WAYS);
  return weighted(rng, SPECIAL_WAYS.map((way) => [way, way === 'breakdown' ? 2 : 1] as const));
}

/**
 * A chamber's exits, largest first. A double's special exit leads on through the wall opposite the
 * way in, never up or down. The depths of roof and floor exits come from `depths`, after every exit
 * is rolled: the planner hands a stream of their own, so a chamber's widths and directions, and all
 * it draws after its exits, are what they were before ways up and down had a depth.
 */
export function rollExits(rng: Rng, rules: ExitRules = PLAIN_EXITS, depths: Rng = rng): CaveExit[] {
  const d1 = int(rng, 1, 6);
  const d2 = int(rng, 1, 6);
  const special = d1 === d2 ? specialWay(rng, rules) : undefined;
  const exits = exitWidths(d1, d2).map((rolled, k): CaveExit => {
    const width = bentWidth(rng, rolled, rules);
    const vertical = verticalOf(rng, rules);
    if (k === 0 && special) return { width, way: special, special: true, rolled };
    return { width, way: wayOfWidth(width), ...(vertical && { vertical }), rolled };
  });
  return exits.map((exit) => (exit.vertical ? { ...exit, depth: verticalDepth(depths) } : exit));
}

/** A loop's way through: one exit's size, 2d6 ft, bent by the cave's character. */
export function rollLoopWay(rng: Rng, rules: ExitRules = PLAIN_EXITS): WayRoll {
  const width = bentWidth(rng, int(rng, 1, 6) + int(rng, 1, 6), rules);
  return { width, way: wayOfWidth(width) };
}

/**
 * Whether a chamber's exit roll gave it no way on a body can walk: its largest exit, as the dice
 * gave it, four feet or less (two d6 that show 2 to 4, one chamber in six). A cave's character that
 * lowers its roofs never makes one: the main path keeps standing room wherever the book gives it.
 */
export function onlyCrawlsOn(exits: readonly CaveExit[]): boolean {
  return (exits[0]?.rolled ?? Infinity) <= CRAWL_WIDTH;
}

/** The ways a roll's exits in one direction make, each with its width and depth. */
function waysOf(exits: readonly CaveExit[], direction: 'up' | 'down'): VerticalWay[] {
  return exits.flatMap((exit) => (exit.vertical === direction && exit.depth !== undefined ? [{ width: exit.width, depth: exit.depth }] : []));
}

/** The roof and floor exits of a roll, by their widths and depths; undefined where it rolled none. */
export function verticalExits(exits: readonly CaveExit[]): CaveVerticalExits | undefined {
  const up = waysOf(exits, 'up');
  const down = waysOf(exits, 'down');
  return up.length || down.length ? { up, down } : undefined;
}
