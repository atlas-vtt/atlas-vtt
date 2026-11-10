/**
 * CritRuleField — How a set's default dice are critical: one row, the rule's
 * meaning in the info mark beside its name.
 */

import React, { useId } from 'react';
import { ObsidianMenuDropdown } from '../ObsidianMenuDropdown';
import type { CritRule } from '../../../types/diceRulesTypes';
import { t } from '../../../i18n';
import { InfoMark } from './InfoMark';

const CRIT_OPTIONS: Record<CritRule, string> = {
  natural: t('diceLab.critNatural'),
  'roll-under': t('diceLab.critRollUnder'),
  doubles: t('diceLab.critDoubles'),
  'high-total': t('diceLab.critHighTotal'),
  none: t('diceLab.critNone'),
};

const CRIT_DESCRIPTIONS: Record<CritRule, string> = {
  natural: t('diceLab.critNaturalHint'),
  'roll-under': t('diceLab.critRollUnderHint'),
  doubles: t('diceLab.critDoublesHint'),
  'high-total': t('diceLab.critHighTotalHint'),
  none: t('diceLab.critNoneHint'),
};

interface CritRuleFieldProps {
  crit: CritRule;
  disabled?: boolean;
  onChange: (crit: CritRule) => void;
}

export function CritRuleField({ crit, disabled = false, onChange }: CritRuleFieldProps): React.ReactElement {
  const labelId = useId();
  return (
    <div className="atlas-dice-lab__option">
      <span className="atlas-dice-lab__option-label">
        <span id={labelId}>{t('diceLab.critical')}</span>
        <InfoMark label={CRIT_DESCRIPTIONS[crit]} />
      </span>
      <ObsidianMenuDropdown
        className="atlas-setting-dropdown atlas-dice-lab__select"
        labelledBy={labelId}
        value={crit}
        options={CRIT_OPTIONS}
        descriptions={CRIT_DESCRIPTIONS}
        disabled={disabled}
        onChange={(value) => onChange(value as CritRule)}
      />
    </div>
  );
}
