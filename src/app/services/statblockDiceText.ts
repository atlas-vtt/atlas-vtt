/**
 * Where statblock text holds dice notation and bare bonuses, and the formula
 * each rolls. Pure: the card's roll links (`statblockDiceLinks.ts`) and what a
 * player's sheet says a value rolls read the same rule.
 */

/**
 * One dice term: `2d8`, `d20`, with the exploding notation (`1d6!i`, `1d6!3`,
 * `1d6!!`) and keep marks (`4d6kh3`). A single `!` is left out: in running
 * text it ends a sentence far more often than it means a die that explodes once.
 */
const DIE = String.raw`\d*d\d+(?:!!?(?:\d+|i(?![a-z]))|!!)?(?:k[hl]\d*(?![a-z]))?`;

/** A further signed term: a die or a constant after `+`, `-`, a minus sign or an en dash, or after "+ -" (the 5e SRD's "3d6 + -1"). */
const NEXT_TERM = String.raw`\s*(?:\+\s*-|[+\-−–])\s*(?:${DIE}|\d+)`;

/**
 * Dice expressions (`2d8+3`, `2d6 - 1d4`) plus bare bonuses (`+4`, `−1`,
 * `ATK: +4`). Neither starts inside a word or a number ("x2d6" is no die);
 * brackets are punctuation, so "(2d6 + 3)" links "2d6 + 3". A bare sign must
 * sit directly on its digits and must not open a dice term, so the dash in
 * "Very Close - 1d12+2" is punctuation rather than a -1 roll.
 */
export const DICE_PATTERN = new RegExp(
  String.raw`((?<!\w)${DIE}(?:${NEXT_TERM})*|(?:ATK|Attack)\s*:\s*[+-]\d+|(?<!\w)[+\-−]\d+(?!\s*d\d))`,
  'gi',
);

/**
 * Turns matched display text into a formula the dice tool understands. A bare
 * bonus stays bare: the dice tool adds it to the collection's default roll.
 */
export function toRollFormula(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/^(?:ATK|Attack):/i, '')
    .replace(/[−–]/g, '-')
    .replace(/\+-/g, '-');
}

/** Splits text into plain and dice segments, for renderers that build their own nodes. */
export function splitDiceSegments(text: string): Array<{ text: string; dice: boolean }> {
  const segments: Array<{ text: string; dice: boolean }> = [];
  DICE_PATTERN.lastIndex = 0;

  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = DICE_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), dice: false });
    }
    segments.push({ text: match[0], dice: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), dice: false });
  }
  return segments;
}
