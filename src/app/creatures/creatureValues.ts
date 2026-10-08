/**
 * Reads statblock values the way people write them in any game system: ratings
 * as numbers ("1/4", "½", "Creature 3", "3+1*", "−1") and categories as clean
 * labels ("[[Monster Manual]] p.114" is the option "Monster Manual").
 */

import { statblockLinksAsText } from '../services/statblockLinks';

const VULGAR_FRACTIONS: Readonly<Record<string, number>> = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
};

/** A signed number, optionally a fraction, or a vulgar fraction character. */
const RATING_TOKEN = /([-−]?)(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?|([½⅓⅔¼¾⅛⅜⅝⅞])/;

/**
 * The first number a value holds, or null. A minus sign counts only at the
 * start of a word, so "1-1" (hit dice) is 1 while "Creature −1" is −1.
 */
export function parseRating(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.length > 0 ? parseRating(value[0]) : null;
  if (typeof value !== 'string') return null;

  const match = RATING_TOKEN.exec(value);
  if (!match) return null;
  const [, sign, whole, denominator, vulgar] = match;
  if (vulgar) return VULGAR_FRACTIONS[vulgar] ?? null;

  const numerator = Number(whole);
  const magnitude = denominator === undefined ? numerator : numerator / Number(denominator);
  if (!Number.isFinite(magnitude)) return null;
  const before = value[match.index - 1];
  const negative = Boolean(sign) && (before === undefined || !/[\p{L}\p{N}]/u.test(before));
  return negative ? -magnitude : magnitude;
}

const FRACTION_DENOMINATORS = [2, 3, 4, 8];

/** A rating as statblocks write it: 0.25 is "1/4", 1.5 is "1 1/2". */
export function formatRating(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const whole = Math.trunc(value);
  const part = Math.abs(value - whole);
  if (part < 1e-9) return String(whole);
  for (const denominator of FRACTION_DENOMINATORS) {
    const numerator = part * denominator;
    if (Math.abs(numerator - Math.round(numerator)) < 1e-9) {
      const fraction = `${Math.round(numerator)}/${denominator}`;
      if (whole === 0) return value < 0 ? `-${fraction}` : fraction;
      return `${whole} ${fraction}`;
    }
  }
  return String(Math.round(value * 100) / 100);
}

/** Longer text is a description, not a category. */
const MAX_OPTION_LENGTH = 80;
/** As a note writes it an option may be longer (a link with its path, a page reference); far longer text is read as none. */
const MAX_WRITTEN_OPTION_LENGTH = 1000;

const PAGE_REFERENCE = /[\s,;]*\b(?:pp?|pg|page)\.?\s*\d+(?:\s*[-–]\s*\d+)?\s*$/i;
/** Private-use characters: glyphs of a PDF's own font that no other font draws (text copied from rulebooks). */
const PRIVATE_USE = /[\uE000-\uF8FF]/g;
/** A detail in brackets at the end: "humanoid (goblinoid)", "Horde (10/HP)". */
const TRAILING_DETAIL = /\s*\([^()]*\)\s*$/;

/** Statblock text as it reads: links as what they show, rulebook-font glyphs dropped, spaces single. */
export function plainText(text: string): string {
  return statblockLinksAsText(text.replace(PRIVATE_USE, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanOption(text: string): string | null {
  if (text.length > MAX_WRITTEN_OPTION_LENGTH) return null;
  const cleaned = plainText(text).replace(PAGE_REFERENCE, '').trim();
  return cleaned && cleaned.length <= MAX_OPTION_LENGTH ? cleaned : null;
}

/** The categories a value names: one per string, number or yes/no, flattened out of lists. */
export function parseOptions(value: unknown): string[] {
  if (typeof value === 'string') {
    const option = cleanOption(value);
    return option ? [option] : [];
  }
  if (typeof value === 'number') return Number.isFinite(value) ? [String(value)] : [];
  if (typeof value === 'boolean') return [value ? 'Yes' : 'No'];
  if (Array.isArray(value)) return value.flatMap(parseOptions);
  return [];
}

/**
 * The categories a value names without the detail in brackets at their end, so
 * "humanoid (goblinoid)" is humanoid and "Horde (10/HP)" is Horde.
 */
export function parseCategories(value: unknown): string[] {
  return parseOptions(value).map((option) => option.replace(TRAILING_DETAIL, '') || option);
}

/** Options that differ only in case are the same option. */
export function optionKey(option: string): string {
  return option.toLowerCase();
}

/** Bounds as the filters show them: "3", "1/4 – 3", "≥ 5" or "≤ 2" when one side is open. */
export function formatRange(range: { min: number; max: number }): string {
  if (range.min === -Infinity) return `≤ ${formatRating(range.max)}`;
  if (range.max === Infinity) return `≥ ${formatRating(range.min)}`;
  return range.min === range.max ? formatRating(range.min) : `${formatRating(range.min)} – ${formatRating(range.max)}`;
}

/** The parts an alignment is made of, in the order the alignment filter lists them. */
export const ALIGNMENT_PARTS = ['Lawful', 'Neutral', 'Chaotic', 'Good', 'Evil', 'Unaligned', 'Any'] as const;

const ALIGNMENT_WORDS: Readonly<Record<string, (typeof ALIGNMENT_PARTS)[number]>> = {
  lawful: 'Lawful', neutral: 'Neutral', chaotic: 'Chaotic', good: 'Good', evil: 'Evil', unaligned: 'Unaligned',
};
const ALIGNMENT_LETTERS: Readonly<Record<string, (typeof ALIGNMENT_PARTS)[number]>> = {
  l: 'Lawful', n: 'Neutral', c: 'Chaotic', g: 'Good', e: 'Evil',
};

/**
 * The parts of an alignment as statblocks write it: "chaotic evil" is Chaotic
 * and Evil, "neutral good (50%) or neutral evil (50%)" Neutral, Good and Evil,
 * the abbreviations "CE" or "L" (Pathfinder, Shadowdark) the same. "Any
 * alignment" and "any non-good alignment" are Any; "any evil alignment" is Evil.
 */
export function alignmentParts(value: unknown): string[] {
  const parts = new Set<string>();
  for (const text of parseOptions(value)) {
    const abbreviation = /^[lnc]?[nge]?$/i.test(text.trim()) ? text.trim().toLowerCase() : null;
    if (abbreviation) {
      for (const letter of abbreviation) parts.add(ALIGNMENT_LETTERS[letter]!);
      continue;
    }
    const words = text.toLowerCase().split(/[^a-z-]+/);
    const named = words.flatMap((word) => (ALIGNMENT_WORDS[word] ? [ALIGNMENT_WORDS[word]] : []));
    if (named.length > 0) named.forEach((part) => parts.add(part));
    else if (words.includes('any') || words.some((word) => word.startsWith('non-'))) parts.add('Any');
  }
  return ALIGNMENT_PARTS.filter((part) => parts.has(part));
}
