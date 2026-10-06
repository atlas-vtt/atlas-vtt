/** Complete, bounded dice grammar. */
import { MAX_EXPLOSIONS } from './diceExplosion';

export type FormulaErrorCode = 'syntax' | 'length' | 'terms' | 'dice' | 'faces';
export interface FormulaError { readonly ok: false; readonly code: FormulaErrorCode }

export type FormulaTerm =
  | { readonly kind: 'constant'; readonly value: number }
  | { readonly kind: 'dice'; readonly count: number; readonly faces: number; readonly negative: boolean; readonly explosions?: number };

export interface ParsedFormula {
  readonly ok: true;
  readonly terms: readonly FormulaTerm[];
}

export const FORMULA_LIMITS = { characters: 64, terms: 10, dice: 100, faces: 1000 } as const;

// Sticky matching requires every character to belong to the grammar. In particular,
// whitespace is SP/HTAB only, and every term after the first needs a sign.
const TERM = /([+-]?)[ \t]*(?:(\d{0,3})[dD](\d{1,4})(!{1,2}(i|\d{1,2})?)?|(\d{1,4}))[ \t]*/y;

/** Validates the whole expression before the caller can consume any randomness. */
export function parseFormula(formula: string): ParsedFormula | FormulaError {
  if (formula.length > FORMULA_LIMITS.characters) return { ok: false, code: 'length' };
  const terms: FormulaTerm[] = [];
  let dice = 0;
  let cursor = /^[ \t]*/.exec(formula)?.[0].length ?? 0;
  while (cursor < formula.length) {
    TERM.lastIndex = cursor;
    const match = TERM.exec(formula);
    if (!match || (terms.length > 0 && !match[1])) return { ok: false, code: 'syntax' };
    cursor = TERM.lastIndex;
    const [, sign, count, sides, explosion, times, constant] = match;
    if (constant !== undefined) {
      terms.push({ kind: 'constant', value: (sign === '-' ? -1 : 1) * Number(constant) });
    } else {
      const faces = Number(sides);
      const amount = Number(count || '1');
      dice += amount;
      terms.push({ kind: 'dice', count: amount, faces, negative: sign === '-',
        ...(explosion !== undefined && { explosions: times === 'i' ? MAX_EXPLOSIONS : Number(times ?? '1') }),
      });
    }
    if (terms.length > FORMULA_LIMITS.terms) return { ok: false, code: 'terms' };
  }
  if (terms.some(term => term.kind === 'dice' && (term.faces < 2 || term.faces > FORMULA_LIMITS.faces))) return { ok: false, code: 'faces' };
  if (dice > FORMULA_LIMITS.dice) return { ok: false, code: 'dice' };
  return terms.length ? { ok: true, terms } : { ok: false, code: 'syntax' };
}
