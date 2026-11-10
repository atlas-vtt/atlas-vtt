/**
 * InitiativeFields — How the collection's initiative tracker runs a fight.
 */

import React from 'react';
import { t } from '../../../i18n';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { isValidDefaultRoll } from '../../../gameSystems/diceRules';
import type { FieldSuggestion } from '../../../resources/resourceFieldSuggestions';
import type { NamedModifierStatblock } from '../../../initiative/modifierPreview';
import type { InitiativeMode, InitiativeRules } from '../../../types/initiativeRulesTypes';
import { InitiativeModifierFields } from './InitiativeModifierFields';
import { InitiativeSideFields } from './InitiativeSideFields';
import { InitiativeCardFields } from './InitiativeCardFields';
import { SettingRow } from './SettingRow';

interface InitiativeFieldsProps {
  initiative: InitiativeRules;
  onChange: (initiative: InitiativeRules) => void;
  /** The statblock fields offered for the modifier (`initiativeFieldSuggestions`). */
  fieldSuggestions: readonly FieldSuggestion[];
  /** The collection's statblocks, for what the chosen field reads in them (`modifierPreview`). */
  modifierStatblocks?: readonly NamedModifierStatblock[] | undefined;
}

const MODE_OPTIONS: SelectOption<InitiativeMode>[] = [
  { value: 'turn-order', label: t('initiative.rules.turnOrder') },
  { value: 'sides', label: t('initiative.rules.sides') },
  { value: 'cards', label: t('initRules.mode.cards') },
];

const MODE_DESCRIPTIONS: Record<InitiativeMode, string> = {
  'turn-order': t('initiative.rules.turnOrderHint'),
  sides: t('initRules.mode.sidesHint'),
  cards: t('initRules.mode.cardsHint'),
};

export function InitiativeFields({ initiative, onChange, fieldSuggestions, modifierStatblocks }: InitiativeFieldsProps): React.ReactElement {
  const rollValid = isValidDefaultRoll(initiative.roll);

  return (
    <section className="atlas-csm-section" aria-labelledby="atlas-csm-initiative-title">
      <h4 id="atlas-csm-initiative-title" className="atlas-csm-section-title">{t('initiative.rules.title')}</h4>
      <SettingRow
        label={t('initiative.rules.order')}
        info={`${MODE_DESCRIPTIONS[initiative.mode]} ${t('initiative.rules.appliesHint')}`}
        control={(labelId) => (
          <Select value={initiative.mode} options={MODE_OPTIONS} labelledBy={labelId} onChange={(mode) => onChange({ ...initiative, mode })} />
        )}
      />

      {initiative.mode === 'turn-order' && (
        <>
          <SettingRow
            label={t('initiative.rules.rollShort')}
            info={t('initiative.rules.rollInfo')}
            control={(labelId) => (
              <input
                type="text"
                className="atlas-csm-input"
                placeholder="1d20"
                spellCheck={false}
                aria-labelledby={labelId}
                aria-invalid={!rollValid || undefined}
                value={initiative.roll}
                onChange={(e) => onChange({ ...initiative, roll: e.target.value })}
              />
            )}
          >
            {!rollValid && <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{t('initiative.rules.rollError')}</p>}
          </SettingRow>
          <InitiativeModifierFields initiative={initiative} onChange={onChange} fieldSuggestions={fieldSuggestions} statblocks={modifierStatblocks} />
        </>
      )}
      {initiative.mode === 'sides' && <InitiativeSideFields initiative={initiative} onChange={onChange} />}
      {initiative.mode === 'cards' && <InitiativeCardFields initiative={initiative} onChange={onChange} />}

      <SettingRow
        label={t('initiative.rollHitPoints')}
        info={t('initiative.rollHitPointsHint')}
        control={(labelId) => (
          <ToggleSwitch labelledBy={labelId} value={initiative.rollHitPoints === true} onChange={() => onChange(withHitPointRolls(initiative, initiative.rollHitPoints !== true))} />
        )}
      />
    </section>
  );
}

/** The rules with hit points rolled as creatures join, or taken as their statblocks give them. */
function withHitPointRolls(initiative: InitiativeRules, on: boolean): InitiativeRules {
  const { rollHitPoints: _off, ...rest } = initiative;
  return on ? { ...rest, rollHitPoints: true } : rest;
}
