/**
 * InitiativeFields — How the collection's initiative tracker runs a fight.
 */

import React from 'react';
import { t } from '../../../i18n';
import { ObsidianMenuDropdown } from '../ObsidianMenuDropdown';
import { isValidDefaultRoll } from '../../../gameSystems/diceRules';
import type { FieldSuggestion } from '../../../resources/resourceFieldSuggestions';
import type { NamedModifierStatblock } from '../../../initiative/modifierPreview';
import type { InitiativeMode, InitiativeRules } from '../../../types/initiativeRulesTypes';
import { InitiativeModifierFields } from './InitiativeModifierFields';
import { InitiativeSideFields } from './InitiativeSideFields';
import { InitiativeCardFields } from './InitiativeCardFields';

interface InitiativeFieldsProps {
  initiative: InitiativeRules;
  onChange: (initiative: InitiativeRules) => void;
  /** The statblock fields offered for the modifier (`initiativeFieldSuggestions`). */
  fieldSuggestions: readonly FieldSuggestion[];
  /** The collection's statblocks, for what the chosen field reads in them (`modifierPreview`). */
  modifierStatblocks?: readonly NamedModifierStatblock[] | undefined;
}

const MODE_OPTIONS: Record<InitiativeMode, string> = {
  'turn-order': t('initiative.rules.turnOrder'),
  sides: t('initiative.rules.sides'),
  cards: t('initRules.mode.cards'),
};

const MODE_DESCRIPTIONS: Record<InitiativeMode, string> = {
  'turn-order': t('initiative.rules.turnOrderHint'),
  sides: t('initRules.mode.sidesHint'),
  cards: t('initRules.mode.cardsHint'),
};

export function InitiativeFields({ initiative, onChange, fieldSuggestions, modifierStatblocks }: InitiativeFieldsProps): React.ReactElement {
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

      {initiative.mode === 'turn-order' && (
        <>
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
              <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{t('initiative.rules.rollError')}</p>
            )}
          </div>
          <InitiativeModifierFields initiative={initiative} onChange={onChange} fieldSuggestions={fieldSuggestions} statblocks={modifierStatblocks} />
        </>
      )}
      {initiative.mode === 'sides' && <InitiativeSideFields initiative={initiative} onChange={onChange} />}
      {initiative.mode === 'cards' && <InitiativeCardFields initiative={initiative} onChange={onChange} />}

      <div className="atlas-csm-toggle-row">
        <div>
          <div className="atlas-csm-toggle-label">{t('initiative.rollHitPoints')}</div>
          <div className="atlas-csm-hint">{t('initiative.rollHitPointsHint')}</div>
        </div>
        <label className="atlas-csm-switch">
          <input
            type="checkbox"
            aria-label={t('initiative.rollHitPoints')}
            checked={initiative.rollHitPoints === true}
            onChange={(e) => onChange(withHitPointRolls(initiative, e.target.checked))}
          />
          <span className="atlas-csm-switch-track" />
        </label>
      </div>
    </>
  );
}

/** The rules with hit points rolled as creatures join, or taken as their statblocks give them. */
function withHitPointRolls(initiative: InitiativeRules, on: boolean): InitiativeRules {
  const { rollHitPoints: _off, ...rest } = initiative;
  return on ? { ...rest, rollHitPoints: true } : rest;
}
