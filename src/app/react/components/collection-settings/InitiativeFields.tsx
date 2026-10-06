/**
 * InitiativeFields — How the collection's initiative tracker runs a fight.
 */

import React from 'react';
import { t } from '../../../i18n';
import { ObsidianMenuDropdown } from '../ObsidianMenuDropdown';
import { isValidDefaultRoll } from '../../../gameSystems/diceRules';
import { SIDE_LABELS } from '../../../initiative/sides';
import type { InitiativeMode, InitiativeRules, InitiativeSide } from '../../../types/initiativeRulesTypes';

interface InitiativeFieldsProps {
  initiative: InitiativeRules;
  onChange: (initiative: InitiativeRules) => void;
}

const MODE_OPTIONS: Record<InitiativeMode, string> = {
  'turn-order': t('initiative.rules.turnOrder'),
  sides: t('initiative.rules.sides'),
};

const MODE_DESCRIPTIONS: Record<InitiativeMode, string> = {
  'turn-order': t('initiative.rules.turnOrderHint'),
  sides: t('initiative.rules.sidesHint'),
};

export function InitiativeFields({ initiative, onChange }: InitiativeFieldsProps): React.ReactElement {
  const rollValid = isValidDefaultRoll(initiative.roll);

  return (
    <>
      <div className="atlas-csm-field">
        <label className="atlas-csm-label">{t('initiative.rules.title')}</label>
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown atlas-csm-dropdown"
          value={initiative.mode}
          options={MODE_OPTIONS}
          onChange={(value) => onChange({ ...initiative, mode: value as InitiativeMode })}
        />
        <p className="atlas-csm-hint">
          {MODE_DESCRIPTIONS[initiative.mode]} {t('initiative.rules.appliesHint')}
        </p>
      </div>

      {initiative.mode === 'turn-order' ? (
        <div className="atlas-csm-field">
          <label className="atlas-csm-label" htmlFor="atlas-csm-initiative-roll">{t('initiative.rules.roll')}</label>
          <input
            id="atlas-csm-initiative-roll"
            type="text"
            className="atlas-csm-input"
            placeholder="1d20"
            spellCheck={false}
            aria-invalid={!rollValid || undefined}
            value={initiative.roll}
            onChange={(e) => onChange({ ...initiative, roll: e.target.value })}
          />
          {!rollValid && (
            <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">
              {t('initiative.rules.rollError')}
            </p>
          )}
        </div>
      ) : (
        <div className="atlas-csm-field">
          <label className="atlas-csm-label">{t('initiative.rules.actsFirst')}</label>
          <ObsidianMenuDropdown
            className="atlas-setting-dropdown atlas-csm-dropdown"
            value={initiative.firstSide}
            options={SIDE_LABELS}
            onChange={(value) => onChange({ ...initiative, firstSide: value as InitiativeSide })}
          />
          <p className="atlas-csm-hint">
            {t('initiative.rules.sidesOfTokens')}
          </p>
        </div>
      )}
    </>
  );
}
