import type { ExpressionError } from '../../expressions/errors';
import type { FormulaContext } from '../../expressions/evaluate';
import { isExpressionError } from '../../expressions/errors';
import { escapePatternText, parsePatternCached, singleFieldPattern } from '../../expressions/patternParse';
import { renderPattern } from '../../expressions/pattern';
import type { PatternAst } from '../../expressions/patternTypes';
import type { FieldKey } from '../../model/templateTypes';
import type { SheetState } from '../sheetState';

/** A value as a block writes it, with what went wrong writing it. */
export interface ShownText {
  text: string;
  /**
   * Only the problems a reader should see: a pattern that cannot be read and
   * a value that is not a number. An empty field is never one: it just hides.
   */
  problems: readonly ExpressionError[];
}

export const NO_TEXT: ShownText = { text: '', problems: [] };

export function hasText(shown: ShownText): boolean {
  return shown.text.trim() !== '';
}

function visible(problems: readonly ExpressionError[]): ExpressionError[] {
  return problems.filter((problem) => problem.kind === 'syntax' || problem.kind === 'not-a-number');
}

function rendered(ast: PatternAst, sheet: SheetState, extra: FormulaContext | undefined, problems: ExpressionError[]): ShownText {
  const result = renderPattern(ast, sheet.reader, extra ? { ...sheet.context, ...extra } : sheet.context);
  return { text: result.text, problems: visible([...problems, ...result.problems]) };
}

/**
 * A pattern's text for the statblock. A pattern that cannot be read shows
 * `fallbackKey`'s value instead, with the syntax problem, so a broken
 * template still shows its creature.
 */
export function shownPattern(
  pattern: string,
  sheet: SheetState,
  fallbackKey?: FieldKey,
  extra?: FormulaContext,
): ShownText {
  const ast = parsePatternCached(pattern);
  if (!isExpressionError(ast)) return rendered(ast, sheet, extra, []);
  if (!fallbackKey) return { text: '', problems: visible([ast]) };
  return rendered(singleFieldPattern(fallbackKey), sheet, extra, [ast]);
}

/** A field's value as text: a list's items or a record's pairs joined by commas. */
export function shownField(key: FieldKey, sheet: SheetState): ShownText {
  return rendered(singleFieldPattern(key), sheet, undefined, []);
}

/** The pattern that writes one field, optionally signed: `{key|signed}`. */
export function fieldPattern(key: FieldKey, signed: boolean): string {
  return `{${escapePatternText(key)}${signed ? '|signed' : ''}}`;
}

/** The problems of several texts, each once. */
export function problemsOf(texts: readonly ShownText[]): ExpressionError[] {
  return [...new Set(texts.flatMap((shown) => shown.problems))];
}
