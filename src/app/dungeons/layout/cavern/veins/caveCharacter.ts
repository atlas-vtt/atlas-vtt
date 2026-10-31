/**
 * A cave's character, the book's "always … but never …": one thing the whole cave always does and
 * one it never does, each a few numbers the layout reads (more loops, lower roofs, exits hidden in
 * the floor, no dead ends). Tags rule some traits out: a flat cave has no endless up and down, a
 * dry one no still pools. The roll is made whatever the tags, and a trait they rule out passes to
 * the next one in the list, so a seed keeps its character as far as its tags allow.
 */

import { CAVE_ALWAYS_TRAITS, CAVE_NEVER_TRAITS, type CaveAlwaysTrait, type CaveCharacter, type CaveNeverTrait } from '../../../caveModel';
import { type Rng, pick } from '../../../rng';
import type { DungeonTag } from '../../../tags';
import type { ExitRules } from './caveExits';

/** The traits a tag rules out: what a flat, dry, single-file or molten cave cannot do. */
const RULED_OUT: readonly { tag: DungeonTag; traits: readonly (CaveAlwaysTrait | CaveNeverTrait)[] }[] = [
  { tag: 'flat', traits: ['up-and-down'] },
  { tag: 'dry', traits: ['still-pools', 'endless-drips', 'calm-water'] },
  { tag: 'string', traits: ['curves-back', 'dead-passages'] },
  { tag: 'lava', traits: ['endless-drips', 'still-pools', 'flowstone-crust', 'calm-water'] },
];

/** The trait at or after `drawn` in `list` that the tags allow; the drawn one where they allow none. */
function allowed<T extends string>(list: readonly T[], drawn: T, out: ReadonlySet<string>): T {
  const at = list.indexOf(drawn);
  for (let k = 0; k < list.length; k++) {
    const trait = list[(at + k) % list.length]!;
    if (!out.has(trait)) return trait;
  }
  return drawn;
}

/** A cave's character: one always and one never trait, each passed on to the next the tags allow. */
export function drawCharacter(rng: Rng, tags: ReadonlySet<DungeonTag>): CaveCharacter {
  const always = pick(rng, CAVE_ALWAYS_TRAITS);
  const never = pick(rng, CAVE_NEVER_TRAITS);
  const out = new Set(RULED_OUT.filter(({ tag }) => tags.has(tag)).flatMap(({ traits }) => traits));
  return { always: allowed(CAVE_ALWAYS_TRAITS, always, out), never: allowed(CAVE_NEVER_TRAITS, never, out) };
}

/** What a character does to the layout, in numbers: every rule reads the one it needs. */
export interface CharacterModifiers {
  /** Times as many loops: a cave that curves back on itself, or one that never leaves a passage dead. */
  loops: number;
  /** The chance of each side way off a passage: more where the cave curves back and winds. */
  passageSides: number;
  exits: ExitRules;
  /** Tiers every chamber grows: a cave built to the largest size. */
  tierStep: number;
  /** Every size as likely as any, the tiniest and gargantuan caves twice as often: a cave that changes scale unpredictably. */
  shiftingScale: boolean;
  /** A chamber's size leans to the other side of its parent's: a cave whose caves never flow regularly. */
  leanAway: boolean;
  /** A chamber entered by a squeeze or letterbox is a tier larger: a cave that narrows and then opens. */
  opensPastSqueeze: boolean;
  /** Times as many scree steps between chambers; 0 for none. */
  steps: number;
  /** The least water level, unless the GM gave one: a cave that holds still pools wherever it can. */
  leastWater: number;
  /** Times as many basins. */
  basins: number;
  /** Times as many fault lines across a floor. */
  faultLines: number;
  /** The chance a chamber's widest exit off the main path is choked by breakdown. */
  blockedWays: number;
  /** Every door on a stream is a fall: a cave whose water never runs calm. */
  streamFalls: boolean;
  /** Floors are joined by pitches alone, never scree: a cave whose walls are never sloped. */
  pitchesOnly: boolean;
  /** One way on from every room and one loop, on the main way: a burrow's tube (set by its formation, never by a character). */
  oneWayOn: boolean;
}

export function characterModifiers(character: CaveCharacter): CharacterModifiers {
  const { always, never } = character;
  const noWalk = never === 'standing-room' || never === 'plain-walk';
  const vertical = always === 'floor-exits' ? 'down' : always === 'roof-exits' ? 'up' : 'any';
  return {
    loops: (always === 'curves-back' ? 2 : 1) * (never === 'dead-passages' ? 2 : 1),
    passageSides: always === 'curves-back' ? 0.75 : 0.5,
    exits: { shrink: always === 'low-roofs' ? 2 : 0, squeezes: always === 'narrows-then-opens', noWalk, vertical, upShare: 0.5, breakdowns: always === 'balanced-boulders' },
    tierStep: always === 'maximum-size' ? 1 : 0,
    shiftingScale: always === 'shifting-scale',
    leanAway: never === 'regular-caves',
    opensPastSqueeze: always === 'narrows-then-opens',
    steps: never === 'sloped-walls' ? 0 : (always === 'up-and-down' ? 3 : 1) * (never === 'plain-walk' ? 2 : 1),
    leastWater: always === 'still-pools' ? 0.3 : 0,
    basins: always === 'still-pools' ? 1.5 : 1,
    faultLines: always === 'cracks-everywhere' ? 2 : 1,
    blockedWays: always === 'blocked-ways' ? 1 / 3 : 0,
    streamFalls: never === 'calm-water',
    pitchesOnly: never === 'sloped-walls',
    oneWayOn: false,
  };
}
