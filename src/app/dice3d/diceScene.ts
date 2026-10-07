/**
 * Which rolled dice can be shown as a real *body*, and which cannot.
 *
 * There are five platonic solids and the pentagonal trapezohedron; the world
 * has no other real dice. A d13 still rolls, it just gets no stage: a die with
 * thirteen faces would be a lie.
 *
 * Justified exception: **d100** is two d10s, tens and units. Both read their
 * own digit with the 10 as 0, so the tens die shows the tens digit itself, and
 * the printed rule `00 + 0 = 100` holds.
 *
 * Second justified exception: **d2 and d3** have no body either, and the usual
 * table rule says how to roll them on a d6 whose faces are grouped: for a d2,
 * 1–3 is one and 4–6 is two; for a d3, 1–2 is one, 3–4 two, 5–6 three.
 */

import type { RolledDie } from '../tools/diceFormula';
import type { DieSides } from './dieGeometry';

export const DIE_BODIES: DieSides[] = [4, 6, 8, 10, 12, 20];

/**
 * More dice than this fit neither on the screen nor in the hand. Twenty is
 * also the limit of legibility; above it a roll still counts, just without the
 * flight.
 */
const MAX_DICE = 20;

export type DieRole = 'plain' | 'tens' | 'units';

export interface DiePlan {
  sides: DieSides;
  role: DieRole;
  /**
   * The body mimics a smaller die: the landed face is divided by this number
   * and rounded up. Without it the face counts as is.
   */
  fold?: number;
  /**
   * The die was rolled because the die at this place in the plan exploded: it
   * is thrown only once that die has landed.
   */
  follows?: number;
  /** The die of an explosion downwards: it subtracts. */
  subtracts?: true;
}

/**
 * Which body mimics which die, and how many of its faces fall on one pip.
 * Both divide the d6 evenly, which is why it is exactly these two: a d5 on a
 * d6 would not be uniform, and a skewed distribution is a different die.
 */
const MIMIC: Record<number, { body: DieSides; fold: number }> = {
  2: { body: 6, fold: 3 },
  3: { body: 6, fold: 2 },
};

export interface DiceScene {
  plan: DiePlan[];
  /** Face each die lands on, in plan order. */
  faces: number[];
}

function isBody(sides: number): sides is DieSides {
  return (DIE_BODIES as number[]).includes(sides);
}

/** Whether a rolled die shows a face it has: a whole number from 1 to its sides, which are a whole number above 0. */
export function landsOnAFace(die: Pick<RolledDie, 'max' | 'value'>): boolean {
  return Number.isInteger(die.max) && die.max >= 1 && Number.isInteger(die.value) && die.value >= 1 && die.value <= die.max;
}

/**
 * The stage for Atlas' rolled dice, or null when they cannot all be shown as
 * real bodies.
 *
 * Subtracted dice are rejected: on the stage they would be a die whose pips
 * have to be subtracted without that being visible. The die of an explosion
 * downwards is the exception: the die before it bursts as a failure and the
 * die is thrown for it alone, which says what it does. A percentile roll only
 * stands alone, because its tens and units are read by their place.
 *
 * A mimicked die lands on the highest face of its band (a d2's 2 shows the
 * d6's 6), so the face always reads back as the value everyone sees.
 */
export function sceneFromRolls(
  rolls: readonly Pick<RolledDie, 'max' | 'value' | 'negative' | 'exploded'>[],
): DiceScene | null {
  if (rolls.length === 0) return null;

  const plan: DiePlan[] = [];
  const faces: number[] = [];
  for (const roll of rolls) {
    // A value off the die (handed in from elsewhere) has no face to land on: the roll shows as a card.
    if (!landsOnAFace(roll)) return null;
    const follower = roll.exploded === true && plan.length > 0;
    if (roll.negative && !follower) return null;
    const chain = follower ? { follows: plan.length - 1, ...(roll.negative && { subtracts: true as const }) } : {};

    if (roll.max === 100) {
      if (rolls.length !== 1) return null;
      const tens = Math.floor((roll.value % 100) / 10);
      const units = roll.value % 10;
      plan.push({ sides: 10, role: 'tens' }, { sides: 10, role: 'units' });
      faces.push(tens === 0 ? 10 : tens, units === 0 ? 10 : units);
      continue;
    }

    const mimic = MIMIC[roll.max];
    if (mimic !== undefined) {
      plan.push({ sides: mimic.body, role: 'plain', fold: mimic.fold, ...chain });
      faces.push(roll.value * mimic.fold);
      continue;
    }

    if (!isBody(roll.max)) return null;
    plan.push({ sides: roll.max, role: 'plain', ...chain });
    faces.push(roll.value);
  }

  if (plan.length > MAX_DICE) return null;
  return { plan, faces };
}

/** How many dice the longest chain of explosions throws after its first die; 0 when nothing exploded. */
export function chainDepth(plan: readonly DiePlan[]): number {
  let longest = 0;
  let current = 0;
  for (const die of plan) {
    current = die.follows === undefined ? 0 : current + 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

/** How wide the stage is relative to its depth (`STAGE_X`, `STAGE_Z`). */
const STAGE_ASPECT = 3.25 / 2.1;

/**
 * Positions in world coordinates and the matching radius. The dice stand in a
 * grid whose aspect follows the stage's, each moving close enough that the
 * grid just fills the stage.
 *
 * **The row count is rounded, not rounded up.** Rounded up, two dice would get
 * two rows of one, and a handful of dice would become a column. Rounded, the
 * layouts are the ones people lay out at the table: two and three side by
 * side, four as a square, twenty as five by four.
 */
export function layoutDice(count: number): { offsets: [number, number][]; radius: number } {
  if (count === 1) return { offsets: [[0, 0]], radius: 0.92 };

  const rows = Math.max(1, Math.round(Math.sqrt(count / STAGE_ASPECT)));
  const columns = Math.ceil(count / rows);
  // Both bounds keep the outermost die, skin included, inside the stage for
  // any column count.
  const radius = Math.min(0.92, 1.7 / columns, 1.24 / rows);
  const gapX = radius * 2.35;
  const gapY = radius * 2.3;

  const offsets: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / columns);
    const inRow = Math.min(columns, count - row * columns);
    const col = i - row * columns;
    offsets.push([(col - (inRow - 1) / 2) * gapX, rows === 1 ? 0 : ((rows - 1) / 2 - row) * gapY]);
  }
  return { offsets, radius };
}

/** Room around the resting dice when the view frames only them. */
const RESTING_MARGIN = 1.15;
/** The widest field a shrunk roll gives its dice, as width over height; the label needs the rest. */
const MAX_FIELD_ASPECT = 3;

export interface RestingFrame {
  /** Half the width of table the view shows. */
  halfWidth: number;
  /** Width over height of the field that shows it. */
  aspect: number;
}

/**
 * The view that frames only the resting dice of a layout, for a shrunk roll:
 * its small field would show the dice as specks if it framed the whole stage.
 * The field takes the shape of the layout (square for one die, wide for a row
 * of dice, up to `MAX_FIELD_ASPECT`), and the view reaches just past the
 * furthest die edge in both directions.
 */
export function restingFrame(offsets: readonly (readonly [number, number])[], radius: number): RestingFrame {
  const edge = radius * 1.1;
  const extentX = Math.max(...offsets.map(([x]) => Math.abs(x))) + edge;
  const extentZ = Math.max(...offsets.map(([, z]) => Math.abs(z))) + edge;
  const aspect = Math.min(MAX_FIELD_ASPECT, Math.max(1, extentX / extentZ));
  return { halfWidth: Math.max(extentX, extentZ * aspect) * RESTING_MARGIN, aspect };
}
