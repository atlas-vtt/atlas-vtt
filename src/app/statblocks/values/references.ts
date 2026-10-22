/**
 * The `@` references a statblock's values and rest formulas name its numbers by (`@level`,
 * `@str.mod`, `@hit-dice`): `@` and a dotted path whose parts hold letters, digits, `_` and `-`, as
 * field keys do, and never end in `-`. Where the statblock holds nothing at the whole path, the
 * longest part of it that it holds and that ends before a `-` or a dice term is read, so `@con-1`
 * is `con` minus 1 and `@leveld6` is `level` before `d6`. Pure.
 */

/** Reads the statblock's value at a reference's path; undefined where it holds none. */
export type FieldLookup = (path: string) => unknown;

const REFERENCE = /@([A-Za-z_](?:[\w-]*\w)?(?:\.\w(?:[\w-]*\w)?)*)/y;
/** What makes the text after a number a dice term: `d6`, `d%`, `dF`, after spaces or none. */
export const DICE_AFTER = /^[ \t]*[dD](?:\d|%|[fF](?![A-Za-z]))/;

/** A reference found, and what the statblock holds at it. */
export interface Reference {
  /** The path read, as written up to where its number stands. */
  readonly field: string;
  readonly value: unknown;
  /** Where the text goes on after the reference. */
  readonly end: number;
}

/** The path written after the `@` at `at`, or null where no reference starts there. */
export function referencePathAt(text: string, at: number): string | null {
  if (text[at] !== '@') return null;
  REFERENCE.lastIndex = at;
  return REFERENCE.exec(text)?.[1] ?? null;
}

/**
 * The reference whose `@` stands at `at`: the whole path where the statblock holds it, else the
 * longest part of it the statblock holds that ends before a `-` or before a `d` that starts a dice
 * term; `missing` names the whole path where neither holds. Null where no reference starts at `at`.
 */
export function readReference(text: string, at: number, lookup: FieldLookup): Reference | { readonly missing: string; readonly end: number } | null {
  const path = referencePathAt(text, at);
  if (path === null) return null;
  const start = at + 1;
  const end = start + path.length;
  const whole = lookup(path);
  if (whole !== undefined) return { field: path, value: whole, end };
  for (let split = path.length - 1; split > 0; split -= 1) {
    const field = path.slice(0, split);
    if (field.endsWith('.') || field.endsWith('-')) continue;
    const after = path[split];
    const boundary = after === '-' || ((after === 'd' || after === 'D') && DICE_AFTER.test(text.slice(start + split)));
    if (!boundary) continue;
    const value = lookup(field);
    if (value !== undefined) return { field, value, end: start + split };
  }
  return { missing: path, end };
}

/** A whole number a field holds: a whole number, or a text that writes one (`+2`, `-1`); undefined otherwise. */
export function wholeNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== 'string' || !/^\s*[+-]?\d{1,15}\s*$/.test(value)) return undefined;
  return Number(value.trim());
}

/** Whether `text` names a reference anywhere: the quick test before anything is read. */
export function namesReference(text: string): boolean {
  for (let at = text.indexOf('@'); at >= 0; at = text.indexOf('@', at + 1)) {
    if (referencePathAt(text, at) !== null) return true;
  }
  return false;
}
