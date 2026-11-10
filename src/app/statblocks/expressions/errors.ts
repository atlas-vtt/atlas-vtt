/**
 * Why a pattern or formula gave no value, in plain words for the template
 * editor ("Speed isn't a number."). Kinds:
 * - `syntax`: the text cannot be read; `at` is the offset it went wrong at;
 * - `unbound`: a field it reads is empty, or names something that does not exist;
 * - `not-a-number`: a value is not a number, or the arithmetic has no result.
 */

export type ExpressionErrorKind = 'syntax' | 'unbound' | 'not-a-number';

export interface ExpressionError {
  kind: ExpressionErrorKind;
  message: string;
  /** syntax: the offset in the source text. */
  at?: number;
  /** unbound, not-a-number: the reference that caused it ("stats.1"). */
  ref?: string;
}

/** A field's name for messages ("Speed" for `speed`, "Dex" for `stats.1`); undefined falls back to the ref. */
export type LabelResolver = (ref: string) => string | undefined;

const ERROR_KINDS: ReadonlySet<string> = new Set<ExpressionErrorKind>(['syntax', 'unbound', 'not-a-number']);

/** Whether a result of parsing or reading is an error rather than the thing asked for. */
export function isExpressionError<T extends object>(value: T | ExpressionError): value is ExpressionError {
  return 'kind' in value && typeof value.kind === 'string' && ERROR_KINDS.has(value.kind);
}

export function syntaxError(message: string, at: number): ExpressionError {
  return { kind: 'syntax', message, at };
}

export function refError(kind: 'unbound' | 'not-a-number', ref: string, message: string): ExpressionError {
  return { kind, message, ref };
}

/** How a message names a reference. */
export function nameOf(ref: string, labelOf: LabelResolver | undefined): string {
  return labelOf?.(ref)?.trim() || ref;
}
