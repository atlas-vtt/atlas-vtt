/**
 * What taking a rest says: its changes with their rolls ("HP 4 → 18 (2d8+2) · Wand 0 → 3"), and
 * the rules it skipped with their reason.
 */

import { formatList, t } from '../i18n';
import { readableFormula } from './recoveryFormula';
import type { RestChange, RestSkip, SkippedRule } from './restTypes';

const SEPARATOR = ' · ';

/** One change: "HP 4 → 18 (2d8+2)", named after its character where that is not the one resting (`resting`): "Kestrel: HP 4 → 8". */
export function changeText(change: RestChange, resting?: string): string {
  const values = { label: change.label, from: change.from, to: change.to };
  const text = change.rolls.length === 0
    ? t('rest.change', values)
    : t('rest.changeRolled', { ...values, rolls: change.rolls.map((roll) => readableFormula(roll.formula)).join(', ') });
  return resting !== undefined && change.character.id !== resting ? t('rest.changeFor', { name: change.character.name, change: text }) : text;
}

/** A rest's name with the actions picked in it: "Short rest (Tend to Wounds, Clear Stress)". */
export function restName(buttonName: string, picks: readonly string[] = []): string {
  return picks.length > 0 ? t('rest.withPicks', { button: buttonName, picks: formatList(picks) }) : buttonName;
}

function skipText(label: string, reason: RestSkip): string {
  switch (reason.kind) {
    case 'unknown-resource': case 'unknown-field': case 'unknown-condition': return t('rest.skipUnknown', { label });
    case 'static-resource': return t('rest.skipStatic', { label });
    case 'no-value': return t('rest.skipNoValue', { label });
    case 'no-token': return t('rest.skipNoToken', { label });
    case 'unreadable-counters': return t('rest.skipCounters', { label });
    case 'roll': return t('rest.skipRoll', { label });
    case 'unknown-ally': return t('rest.skipAlly');
    case 'formula': {
      const { problem } = reason;
      switch (problem.kind) {
        case 'missing': return t('rest.skipMissingField', { label, field: problem.field });
        case 'not-whole': return t('rest.skipNotWhole', { label, field: problem.field });
        case 'limits': return problem.field === null ? t('rest.skipLimits', { label }) : t('rest.skipLimitsField', { label, field: problem.field });
        case 'syntax': return t('rest.skipSyntax', { label });
      }
    }
  }
}

/** The rules skipped, each with its reason. */
export function skippedText(skipped: readonly SkippedRule[]): string {
  return formatList(skipped.map((rule) => skipText(rule.label, rule.reason)));
}

/**
 * What a rest of `buttonName` did, in one or two lines: its changes, then what it skipped; the
 * actions picked (`picks`, by name) follow the button's name, and changes to another character
 * than the one resting (`resting`) name that character.
 */
export function restSummaryText(
  buttonName: string, changes: readonly RestChange[], skipped: readonly SkippedRule[], { resting, picks }: { resting?: string; picks?: readonly string[] } = {},
): string {
  const button = restName(buttonName, picks);
  const done = changes.length > 0
    ? t('rest.done', { button, changes: changes.map((change) => changeText(change, resting)).join(SEPARATOR) })
    : t('rest.nothing', { button });
  return skipped.length > 0 ? `${done}\n${t('rest.skipped', { list: skippedText(skipped) })}` : done;
}
