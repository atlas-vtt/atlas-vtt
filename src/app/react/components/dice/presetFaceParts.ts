/**
 * How a saved roll shows on its place in the tray's row: the body of its first die, with what else it does as small
 * marks around it (`3d8kh1+3`: a d8, `3×`, `kh1`, `+3`). Read from the formula as written. Pure.
 */

export interface PresetFaceParts {
  /** The faces of the first die; null for Fate dice, which have no body. */
  sides: number | null;
  /** How many of it the roll throws. */
  count: number;
  /** What the roll does to those dice, as written after them: `kh1`, `!`, `r1`, `cs>=8`. */
  rule: string;
  /** The rest of the roll, without spaces or labels: `+3`, `+1d4+2`, `(+2)*2`. */
  rest: string;
}

// The first dice term: its count, its faces and what is written right after it. Not the `d1` of `4d6d1`.
const FIRST_DICE = /(?<![\w%])(\d*)[dD](\d+|%|[fF])([^\s+\-−*/()[\]]*)/;

/** `3+` (a number written before the dice) reads as `+3`; a lone operator left behind goes. */
function tidy(rest: string): string {
  const flipped = /^(\d+)\+$/.exec(rest);
  if (flipped) return `+${flipped[1]}`;
  return rest.replace(/^\+$/, '');
}

/** What a saved roll's place shows of it; null where its formula throws no dice (`+3`). */
export function presetFaceParts(formula: string): PresetFaceParts | null {
  const text = formula.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, '').replaceAll('−', '-');
  const first = FIRST_DICE.exec(text);
  if (!first) return null;
  const [whole, count, faces, rule = ''] = first;
  let rest = `${text.slice(0, first.index)}${text.slice(first.index + whole.length)}`;
  // Brackets that only held the roll together say nothing where nothing multiplies or divides.
  if (!/[*/]/.test(rest)) rest = rest.replace(/[()]/g, '');
  const sides = /^f$/i.test(faces!) ? null : faces === '%' ? 100 : Number(faces);
  return { sides, count: count === '' ? 1 : Number(count), rule, rest: tidy(rest) };
}
