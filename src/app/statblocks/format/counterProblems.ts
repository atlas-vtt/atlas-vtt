/**
 * Notes every row a template's Counters fields start with that regains a count which is no formula
 * Atlas rolls. Such a value is kept as written, and the row regains all of its uses.
 */

import type { StatblockTemplate } from '../model/templateTypes';
import { isRegainFormula } from '../values/counterRegain';
import { describeValue } from './jsonValues';

/** Sentences for the counter rows whose regained count Atlas cannot roll. */
export function counterProblems(template: StatblockTemplate): string[] {
  return template.fields.flatMap((field) => (field.counterRows ?? []).flatMap((row) => (
    row.regain !== undefined && !isRegainFormula(row.regain)
      ? [`Field ${describeValue(field.key)}: counter ${describeValue(row.name)} regains ${describeValue(row.regain)}, which is no dice formula Atlas rolls; it regains all of its uses.`]
      : []
  )));
}
