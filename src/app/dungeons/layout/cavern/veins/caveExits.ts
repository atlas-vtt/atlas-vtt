/**
 * A cave chamber's exits, rolled as the book rolls them (Veins of the Earth): two d6, the largest
 * exit as many feet wide as they show together, and as many smaller exits as they lie apart, each
 * half the one before. A double makes the largest exit special and puts it opposite the way in.
 * Each exit leads through a wall, or up through the roof or down through the floor; its size against
 * a human body says how it is passed.
 */

import { type CaveWay, SPECIAL_WAYS } from '../../../caveModel';
import type { CaveVerticalExits } from '../../../model';
import { type Rng, chance, int, pick, weighted } from '../../../rng';

/** One exit of a chamber: its width (or height) in feet and how it is passed; a roof or floor exit leads up or down. */
export interface CaveExit {
  width: number;
  way: CaveWay;
  vertical?: 'up' | 'down';
  /** The largest exit of a double: a traverse, sump, letterbox or breakdown, opposite the way in. */
  special?: true;
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
  /** A double's special way is a breakdown twice as often as any other: a cave whose boulders lie balanced everywhere. */
  breakdowns: boolean;
}

export const PLAIN_EXITS: ExitRules = { shrink: 0, squeezes: false, noWalk: false, vertical: 'any', breakdowns: false };

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
  const up = chance(rng, 0.5);
  if (!vertical) return undefined;
  return rules.vertical === 'any' ? (up ? 'up' : 'down') : rules.vertical;
}

/** A double's special way: any of the four alike, or breakdown twice as often where the rules say; one draw either way. */
function specialWay(rng: Rng, rules: ExitRules): CaveWay {
  if (!rules.breakdowns) return pick(rng, SPECIAL_WAYS);
  return weighted(rng, SPECIAL_WAYS.map((way) => [way, way === 'breakdown' ? 2 : 1] as const));
}

/** A chamber's exits, largest first. A double's special exit leads on through the wall opposite the way in, never up or down. */
export function rollExits(rng: Rng, rules: ExitRules = PLAIN_EXITS): CaveExit[] {
  const d1 = int(rng, 1, 6);
  const d2 = int(rng, 1, 6);
  const special = d1 === d2 ? specialWay(rng, rules) : undefined;
  return exitWidths(d1, d2).map((rolled, k): CaveExit => {
    const width = bentWidth(rng, rolled, rules);
    const vertical = verticalOf(rng, rules);
    if (k === 0 && special) return { width, way: special, special: true };
    return { width, way: wayOfWidth(width), ...(vertical && { vertical }) };
  });
}

/** A loop's way through: one exit's size, 2d6 ft, bent by the cave's character. */
export function rollLoopWay(rng: Rng, rules: ExitRules = PLAIN_EXITS): WayRoll {
  const width = bentWidth(rng, int(rng, 1, 6) + int(rng, 1, 6), rules);
  return { width, way: wayOfWidth(width) };
}

/** The roof and floor exits of a roll, by their widths; undefined where it rolled none. */
export function verticalExits(exits: readonly CaveExit[]): CaveVerticalExits | undefined {
  const up = exits.filter((exit) => exit.vertical === 'up').map((exit) => exit.width);
  const down = exits.filter((exit) => exit.vertical === 'down').map((exit) => exit.width);
  return up.length || down.length ? { up, down } : undefined;
}
