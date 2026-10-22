/**
 * The short text a metric carries in the recovery editor for the selected button's rule on it:
 * "Full", "+1d4+@tier", "→ 0", "½", "−1".
 */

import { t } from '../../i18n';
import type { RecoveryRule, ResourceOrCounters } from '../recoveryTypes';

const MINUS = '−';

/** A signed whole number with a true minus sign. */
function signed(value: number): string {
  return value < 0 ? `${MINUS}${Math.abs(value)}` : `+${value}`;
}

/** The badge of `rule`; `nameOf` names the metric a Spend rule spends. */
export function ruleBadge(rule: RecoveryRule, nameOf: (target: ResourceOrCounters) => string): string {
  switch (rule.does) {
    case 'full': return t('recoveryEditor.badge.full');
    case 'amount': return `+${rule.formula.replace(/\s+/g, '')}`;
    case 'share': return rule.share === 0.5 ? '½' : '¼';
    case 'set': return `→ ${typeof rule.to === 'number' ? rule.to : `@${rule.to.field}`}`;
    case 'spend': return t('recoveryEditor.badge.spend', { from: nameOf(rule.from) });
    case 'step': return signed(rule.by);
    case 'clear': return t('recoveryEditor.badge.clear');
  }
}
