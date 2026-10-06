/**
 * DiceTab — The collection's default roll, critical rule and exploding dice.
 */

import React from 'react';
import { ObsidianMenuDropdown } from '../ObsidianMenuDropdown';
import { t } from '../../../i18n';
import { isValidDefaultRoll } from '../../../gameSystems/diceRules';
import { DefaultDiceInfo } from './DefaultDiceInfo';
import { ExplodingDiceFields } from './ExplodingDiceFields';
import type { CritRule, DiceRules } from '../../../types/diceRulesTypes';

interface DiceTabProps {
  dice: DiceRules;
  onChange: (dice: DiceRules) => void;
}

const CRIT_OPTIONS: Record<CritRule, string> = {
  natural: t('diceSettings.crit.natural'),
  'roll-under': t('diceSettings.crit.rollUnder'),
  doubles: t('diceSettings.crit.doubles'),
  'high-total': t('diceSettings.crit.highTotal'),
  none: t('diceSettings.crit.none'),
};

const CRIT_DESCRIPTIONS: Record<CritRule, string> = {
  natural: t('diceSettings.crit.naturalHint'),
  'roll-under': t('diceSettings.crit.rollUnderHint'),
  doubles: t('diceSettings.crit.doublesHint'),
  'high-total': t('diceSettings.crit.highTotalHint'),
  none: t('diceSettings.crit.noneHint'),
};

export function DiceTab({ dice, onChange }: DiceTabProps): React.ReactElement {
  const rollValid = isValidDefaultRoll(dice.defaultRoll);

  return (
    <>
      <p className="atlas-csm-hint">{t('diceSettings.tabHint')}</p>

      <div className="atlas-csm-field">
        <div className="atlas-csm-label-row">
          <label className="atlas-csm-label" htmlFor="atlas-csm-default-roll">{t('diceSettings.defaultRoll')}</label>
          <DefaultDiceInfo defaultRoll={dice.defaultRoll} />
        </div>
        <input
          id="atlas-csm-default-roll"
          type="text"
          className="atlas-csm-input"
          placeholder="1d20"
          spellCheck={false}
          aria-invalid={!rollValid || undefined}
          value={dice.defaultRoll}
          onChange={(e) => onChange({ ...dice, defaultRoll: e.target.value })}
        />
        {!rollValid && (
          <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">
            {t('diceSettings.defaultRollError')}
          </p>
        )}
      </div>

      <div className="atlas-csm-field">
        <label className="atlas-csm-label">{t('diceSettings.critRule')}</label>
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown atlas-csm-dropdown"
          value={dice.crit}
          options={CRIT_OPTIONS}
          onChange={(value) => onChange({ ...dice, crit: value as CritRule })}
        />
        <p className="atlas-csm-hint">{CRIT_DESCRIPTIONS[dice.crit]}</p>
      </div>

      <ExplodingDiceFields dice={dice} onChange={onChange} />
    </>
  );
}
