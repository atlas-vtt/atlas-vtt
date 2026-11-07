/**
 * Reads one term of a dice formula: a constant (`3`, `3[bonus]`) or dice with
 * their modifiers, written without spaces and in the order they apply:
 * reroll, explode, keep or drop, count, label (`4d6r1kh3`, `8d10x>=10cs>=8`,
 * `2d6[fire]`). Each kind appears at most once. Whether a modifier makes sense
 * for its dice is checked later (`formulaChecks.ts`).
 */

import type { Comparison, ComparisonOperator } from './diceComparison';
import { MAX_EXPLOSIONS, type Explosion } from './diceExplosion';
import type { ConstantTerm, DiceKeep, DiceReroll, DiceTally, DiceTerm } from './formulaTypes';

export type TermDraft = Omit<DiceTerm, 'negative'> | Omit<ConstantTerm, 'negative'>;

const DICE = /(\d{0,3})[dD](?:(\d{1,4})|(%)|([fF]))/y;
const CONSTANT = /\d{1,4}/y;
const REROLL = /r([or]?)(?:(<=|>=|<|>)?(\d{1,4}))?/y;
const BANG = /!{1,2}(i|\d{1,2})?/y;
const EXPLODE = /x(o?)(?:(>=|>)(\d{1,4}))?/y;
const KEEP = /([kd])([hl]?)(\d{1,3})?/y;
const TALLY = /(?:c([sf])(>=|<=|>|<|=)|(>=|<=))(\d{1,4})/y;
/** The characters a term's label may hold (`2d6[fire]`, `2[Proficiency]`), and how many at most. */
export const LABEL_CHARACTERS = String.raw`\p{L}\p{N} '-`;
export const LABEL_LENGTH = 24;
const LABEL = new RegExp(String.raw`\[([${LABEL_CHARACTERS}]{1,${LABEL_LENGTH}})\]`, 'uy');

/** Matches `pattern` at `at`; the match and where it ends, or null. */
function matchAt(pattern: RegExp, text: string, at: number): RegExpExecArray | null {
  pattern.lastIndex = at;
  return pattern.exec(text);
}

/** The term at `at` and where it ends, or null when none starts there. */
export function readTerm(text: string, at: number): { term: TermDraft; end: number } | null {
  const dice = matchAt(DICE, text, at);
  if (!dice) {
    const constant = matchAt(CONSTANT, text, at);
    if (!constant) return null;
    const label = matchAt(LABEL, text, CONSTANT.lastIndex);
    const term: TermDraft = { kind: 'constant', value: Number(constant[0]), ...(label && { label: label[1]! }) };
    return { term, end: label ? LABEL.lastIndex : CONSTANT.lastIndex };
  }

  const [, count, sides, percent, fate] = dice;
  const faces = fate ? 1 : percent ? 100 : Number(sides);
  let cursor = DICE.lastIndex;
  const next = (pattern: RegExp): RegExpExecArray | null => {
    const match = matchAt(pattern, text, cursor);
    if (match) cursor = pattern.lastIndex;
    return match;
  };

  const reroll = next(REROLL);
  const explosion = next(BANG) ?? next(EXPLODE);
  const keep = next(KEEP);
  const tally = next(TALLY);
  const label = next(LABEL);

  const term: TermDraft = {
    kind: 'dice',
    count: Number(count || '1'),
    faces,
    ...(fate && { fate: true as const }),
    ...(reroll && { reroll: readReroll(reroll) }),
    ...(explosion && { explode: readExplosion(explosion, faces) }),
    ...(keep && { keep: readKeep(keep) }),
    ...(tally && { tally: readTally(tally) }),
    ...(label && { label: label[1]! }),
  };
  return { term, end: cursor };
}

function readReroll([, kind, operator, target]: RegExpExecArray): DiceReroll {
  return {
    when: { operator: (operator ?? '=') as ComparisonOperator, value: target === undefined ? 1 : Number(target) },
    limit: kind === 'r' ? MAX_EXPLOSIONS : 1,
  };
}

/**
 * `!` is Obsidian Dice Roller's: once, `!3` up to three times, `!i` again and
 * again. `x` is Foundry's: again and again, `xo` once, `x>=9` from the 9 up.
 * `highFaces` is not clamped yet, so a check can see that every face explodes.
 */
function readExplosion(match: RegExpExecArray, faces: number): Explosion {
  if (match[0].startsWith('!')) {
    const times = match[1];
    return { highFaces: 1, lowFaces: 0, limit: times === 'i' ? MAX_EXPLOSIONS : Number(times ?? '1') };
  }
  const [, once, operator, target] = match;
  const lowest = target === undefined ? faces : Number(target) + (operator === '>' ? 1 : 0);
  return { highFaces: faces - lowest + 1, lowFaces: 0, limit: once ? 1 : MAX_EXPLOSIONS };
}

function readKeep([, letter, end, count]: RegExpExecArray): DiceKeep {
  const keeps = letter === 'k';
  const highest = end === 'h' || (end === '' && keeps);
  return { mode: keeps ? 'keep' : 'drop', end: highest ? 'highest' : 'lowest', count: Number(count ?? '1') };
}

function readTally([, letter, operator, bare, target]: RegExpExecArray): DiceTally {
  const when: Comparison = { operator: (operator ?? bare) as ComparisonOperator, value: Number(target) };
  const failures = letter === 'f' || bare === '<=';
  return { counts: failures ? 'failures' : 'successes', when };
}
