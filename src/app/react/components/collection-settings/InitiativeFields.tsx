/**
 * InitiativeFields — How the collection's initiative tracker runs a fight.
 */

import React from 'react';
import { ObsidianMenuDropdown } from '../ObsidianMenuDropdown';
import { isValidDefaultRoll } from '../../../gameSystems/diceRules';
import { SIDE_LABELS } from '../../../initiative/sides';
import type { InitiativeMode, InitiativeRules, InitiativeSide } from '../../../types/initiativeRulesTypes';
import { t } from '../../../i18n';

interface InitiativeFieldsProps {
  initiative: InitiativeRules;
  onChange: (initiative: InitiativeRules) => void;
}

const MODE_OPTIONS: Record<InitiativeMode, string> = {
  'turn-order': 'Turn order',
  sides: 'Sides',
};

const MODE_DESCRIPTIONS: Record<InitiativeMode, string> = {
  'turn-order': 'Every combatant has a number, rolled or typed, and they act from the highest down.',
  sides: 'The players and their opponents take turns as two sides, in any order within a side. Nothing is rolled.',
};

export function InitiativeFields({ initiative, onChange }: InitiativeFieldsProps): React.ReactElement {
  const rollValid = isValidDefaultRoll(initiative.roll);

  return (
    <>
      <div className="atlas-csm-field">
        <label className="atlas-csm-label">Initiative</label>
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown atlas-csm-dropdown"
          value={initiative.mode}
          options={MODE_OPTIONS}
          onChange={(value) => onChange({ ...initiative, mode: value as InitiativeMode })}
        />
        <p className="atlas-csm-hint">
          {MODE_DESCRIPTIONS[initiative.mode]} It applies to every scene of the collection; a fight that is running keeps the way it was started.
        </p>
      </div>

      {initiative.mode === 'turn-order' ? (
        <>
          <div className="atlas-csm-field">
            <label className="atlas-csm-label" htmlFor="atlas-csm-initiative-roll">Initiative Roll</label>
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
                Enter one group of dice, such as 1d20 or 1d10.
              </p>
            )}
          </div>
          <div className="atlas-csm-field">
            <label className="atlas-csm-label" htmlFor="atlas-csm-initiative-modifier">{t('initiative.modifierField')}</label>
            <input
              id="atlas-csm-initiative-modifier"
              type="text"
              className="atlas-csm-input"
              placeholder={t('initiative.modifierPlaceholder')}
              spellCheck={false}
              value={initiative.modifierField ?? ''}
              onChange={(e) => onChange({ ...initiative, modifierField: e.target.value })}
              aria-describedby="atlas-csm-initiative-modifier-hint"
            />
            <p id="atlas-csm-initiative-modifier-hint" className="atlas-csm-hint">{t('initiative.modifierHint')}</p>
          </div>
        </>
      ) : (
        <div className="atlas-csm-field">
          <label className="atlas-csm-label">Acts First</label>
          <ObsidianMenuDropdown
            className="atlas-setting-dropdown atlas-csm-dropdown"
            value={initiative.firstSide}
            options={SIDE_LABELS}
            onChange={(value) => onChange({ ...initiative, firstSide: value as InitiativeSide })}
          />
          <p className="atlas-csm-hint">
            A token with vision switched on is on the players' side; move any other from its card in the tracker.
          </p>
        </div>
      )}
    </>
  );
}
