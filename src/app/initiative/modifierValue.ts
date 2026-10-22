/**
 * A statblock value read as a number for initiative, whatever its template calls its type: a
 * number, a text as statblocks write it ("+3", "−1", "+3 (13)", "16 (+3)", "Perception +12;
 * low-light vision"), or a list of entries whose first text holds one (Fantasy Statblocks'
 * Pathfinder notes keep Perception so). Pure, and never a guess from prose: dice ("1d20+3"),
 * fractions ("2.5") and words without a number read as none.
 */

/** A text's leading number, with its sign, and a signed number in parentheses right after an unsigned one. */
interface TextNumber {
  value: number;
  signed: boolean;
  /** "16 (+3)": the score's modifier as the statblock writes it. */
  inParentheses?: number;
}

/** An optional name before the number ("Perception +12", "Initiative: 3"); the number stands right after it. */
const LEADING = /^\s*(?:(\p{L}[\p{L}'’. ]{0,39}?)(:?)\s+)?([+-]?)(\d{1,9})(?=$|[\s(;,)])(?:\s*\(\s*([+-]\d{1,9})\s*\))?/u;

/** How deep lists and entries are opened: a list of entries, each with its text. */
const DEPTH = 3;

/** The keys of an entry whose value is its text or number, in the order they are read. */
const ENTRY_KEYS = ['value', 'desc', 'text'] as const;

function readText(raw: string, strict: boolean): TextNumber | null {
  const text = raw.replace(/[−–]/g, '-');
  const match = LEADING.exec(text);
  if (!match) return null;
  const [, name, colon, sign, digits, parenthesised] = match;
  // A name counts only where it introduces the number: "Perception +12", "Initiative: 3", never "Dex 14"
  if (name !== undefined && !sign && !colon) return null;
  // Strictly, an unsigned number without a name must be all the text says: "10 ft." and "45 (6d10+12)" are a speed and hit points
  if (strict && !sign && name === undefined && text.slice(match[0].length).trim() !== '') return null;
  const value = Number(`${sign ?? ''}${digits}`);
  return {
    value,
    signed: Boolean(sign),
    ...(!sign && parenthesised !== undefined && { inParentheses: Number(parenthesised) }),
  };
}

function readNumber(value: unknown, depth: number, strict = false): TextNumber | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? { value, signed: false } : null;
  if (typeof value === 'string') return readText(value, strict);
  if (depth >= DEPTH || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const read = readNumber(item, depth + 1, strict);
      if (read) return read;
    }
    return null;
  }
  const entry = value as Record<string, unknown>;
  for (const key of ENTRY_KEYS) {
    if (!Object.hasOwn(entry, key)) continue;
    const read = readNumber(entry[key], depth + 1, strict);
    if (read) return read;
  }
  return null;
}

/** The modifier of an ability score by the d20 rule. */
export function abilityScoreModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * The modifier a statblock's value holds; null where it holds none. Read as an ability score
 * (`asScore`), an unsigned number is the score ("16", "16 (+3)" give +3) and a signed one is the
 * modifier already ("+3"); otherwise "16 (+3)" is a score with its modifier beside it, which counts.
 */
export function statblockModifierValue(value: unknown, asScore = false): number | null {
  const read = readNumber(value, 0);
  if (!read) return null;
  if (asScore) return read.signed ? read.value : abilityScoreModifier(read.value);
  return read.inParentheses ?? read.value;
}

/**
 * Whether a value plainly holds a modifier, for offering its field: a number, a signed text, a
 * number with nothing after it but its modifier ("16 (+3)"), or one a name introduces
 * ("Perception +12; …", "Initiative: 3"), also as an entry. Prose that starts with a number
 * ("10 ft.", "45 (6d10+12)") reads as one in a roll but is no field to offer.
 */
export function holdsModifier(value: unknown): boolean {
  return readNumber(value, 0, true) !== null;
}
