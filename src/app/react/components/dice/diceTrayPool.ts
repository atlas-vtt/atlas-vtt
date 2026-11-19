import { FORMULA_LIMITS } from '../../../tools/parseFormula';

/** The standard bodies of the tray's row (`diceShelf.ts`), in the order they stand in it. */
export const TRAY_DICE = [4, 6, 8, 10, 12, 20, 100] as const;
/** A die of the tray by its faces: one of `TRAY_DICE`, or any other a collection put in its row. */
export type TrayDie = number;

/** How many dice of one kind a click puts in the tray. */
export const MAX_PER_DIE = 20;
/** How many dice clicks put in the tray in all: what a formula may roll (`FORMULA_LIMITS.dice`). */
export const MAX_DICE = 100;
/** How far the modifier's steppers and its typed value go either way. */
export const MAX_MODIFIER = 99;

/** The tray's surface: its tooltips open beside it, never over another of its controls (`LabelTooltip`'s `outside`). */
export const TRAY_SURFACE = '.atlas-dice-panel';
/** One gap between every tray tooltip and its control. */
export const TRAY_TOOLTIP_GAP = 8;

/** The true minus sign the tray writes; the formula parser reads the hyphen. */
export const MINUS = '−';

export type TrayPool = Partial<Record<number, number>>;

/** What lies in a tray that holds plain dice and a modifier, and nothing else. */
export interface TrayDice {
  pool: TrayPool;
  modifier: number;
}

/** Any die a formula may roll: the tray counts and writes all of them, whichever the row shows. */
const isTrayDie = (sides: number): boolean => Number.isInteger(sides) && sides >= 2 && sides <= FORMULA_LIMITS.faces;

/** The dice a pool holds, smallest first. */
const heldDice = (pool: TrayPool): number[] =>
  Object.keys(pool).map(Number).filter((sides) => (pool[sides] ?? 0) > 0).sort((a, b) => a - b);

/** `+3`, `−3` or `0`, as the modifier shows and the tray writes it. */
export function formatModifier(modifier: number): string {
  if (modifier === 0) return '0';
  return modifier > 0 ? `+${modifier}` : `${MINUS}${Math.abs(modifier)}`;
}

/** A modifier as it follows the dice in a formula (` + 3`, ` − 3`); nothing for 0. */
export function modifierSuffix(modifier: number): string {
  return modifier === 0 ? '' : ` ${modifier < 0 ? MINUS : '+'} ${Math.abs(modifier)}`;
}

/**
 * A pool as a formula: `2d6 + 1d20 − 3`. The dice stand in ascending order
 * whatever order they were picked in, so the same tray always reads the same;
 * a modifier of 0 is left out, and a modifier without dice stands alone (`+3`).
 */
export function writeTray({ pool, modifier }: TrayDice): string {
  const terms = heldDice(pool).map((sides) => `${pool[sides]}d${sides}`);
  if (terms.length === 0) return modifier === 0 ? '' : formatModifier(modifier);
  return `${terms.join(' + ')}${modifierSuffix(modifier)}`;
}

/** The faces a die term names: `20`, or `%` for 100. */
const facesOf = (faces: string | undefined): number => (faces === '%' ? 100 : Number(faces));
/** How many dice a term rolls: `2`, or 1 where no count is written. */
export const dieCountOf = (count: string | undefined): number => (count === '' ? 1 : Number(count));

// A plain term: a sign (or none at the start), then a die of the tray or a number.
const PLAIN_TERM = /\s*([+\-−]?)\s*(?:(\d*)d(\d+|%)|(\d+))\s*/y;

/**
 * The pool and modifier of a formula that holds nothing but dice of the tray
 * added up and numbers (`2d6+1d20-3`, `+4`), else null: a formula of its own
 * (`4d6kh3`, `(1d8+2)*2`, `2d7`) is left as it was written.
 */
export function readTray(text: string): TrayDice | null {
  if (text.trim() === '') return { pool: {}, modifier: 0 };
  const pool: TrayPool = {};
  let modifier = 0;
  let at = 0;
  let first = true;
  while (at < text.length) {
    PLAIN_TERM.lastIndex = at;
    const term = PLAIN_TERM.exec(text);
    if (!term || term[0] === '') return null;
    const [, sign, count, faces, number] = term;
    if (!first && sign === '') return null;
    const negative = sign === '-' || sign === MINUS;
    if (number !== undefined) {
      modifier += negative ? -Number(number) : Number(number);
    } else {
      const sides = facesOf(faces);
      if (negative || !isTrayDie(sides) || count === '0') return null;
      pool[sides] = (pool[sides] ?? 0) + dieCountOf(count);
    }
    at = PLAIN_TERM.lastIndex;
    first = false;
  }
  return { pool, modifier };
}

// A die term anywhere in a formula: `2d6`, `d20`, `d%`, not the `d1` of `4d6d1`.
const DIE_TERM = /(?<![\w%])(\d*)d(\d+|%)(?![\d%])/g;

/**
 * How many dice of each kind of the tray a formula rolls, as written: the
 * badges on the dice. A formula of its own counts too (`4d6kh3` holds 4 d6).
 */
export function diceCounts(text: string): TrayPool {
  const counts: TrayPool = {};
  for (const [, count, faces] of text.matchAll(DIE_TERM)) {
    const sides = facesOf(faces);
    if (isTrayDie(sides)) counts[sides] = (counts[sides] ?? 0) + dieCountOf(count);
  }
  return counts;
}

export function trayDiceCount(pool: TrayPool): number {
  return heldDice(pool).reduce((sum, sides) => sum + (pool[sides] ?? 0), 0);
}

export function clampModifier(modifier: number): number {
  return Math.max(-MAX_MODIFIER, Math.min(MAX_MODIFIER, modifier));
}
