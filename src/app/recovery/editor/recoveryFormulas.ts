/**
 * Whether a formula a rule names can be rolled: `@field` stands for a statblock's whole number,
 * which the rest puts in before the formula is read. The editor puts 1 in every field's place
 * through the engine's own substitution (`fillFormula`), so the GM sees a typo before the rest is
 * taken, and a formula the rest reads (`@level d6`) is never refused. Pure.
 */

import { fillFormula } from '../recoveryFormula';

/** Whether `formula` reads as dice and numbers once its fields hold numbers, as the rest reads it. */
export function formulaReads(formula: string): boolean {
  const text = formula.trim();
  return text !== '' && fillFormula(text, () => 1).ok;
}

/** A reference being typed at the caret: its `@` and what follows it before the caret, and its rest after. */
const TYPED_BEFORE = /@[\w.-]*$/;
const TYPED_AFTER = /^[\w.-]*/;

/**
 * The formula with `@key` put in at `caret` (or at its end), with the `+` a sum needs around it. A
 * reference being typed where the caret stands (`1+@ar`) is the one picked: it is replaced, never
 * added to.
 */
export function withFieldReference(formula: string, key: string, caret: number = formula.length): { text: string; caret: number } {
  let head = formula.slice(0, caret);
  let tail = formula.slice(caret);
  const typed = TYPED_BEFORE.exec(head);
  if (typed) {
    head = head.slice(0, typed.index);
    tail = tail.slice(TYPED_AFTER.exec(tail)![0].length);
  }
  const before = head.trimEnd();
  const after = tail.trimStart();
  const joint = before === '' || /[+\-*/(]$/.test(before) ? '' : '+';
  const inserted = `${before}${joint}@${key}`;
  return { text: `${inserted}${after === '' || /^[+\-*/)]/.test(after) ? '' : '+'}${after}`, caret: inserted.length };
}
