/**
 * A fight by cards: how many cards the deck holds, whether it is dealt every round, and whether
 * look-alikes share a card.
 */

import React from 'react';
import { DEFAULT_DECK, MAX_DECK, MIN_DECK, isDeckSize } from '../../../gameSystems/initiativeCardRules';
import type { InitiativeRules } from '../../../types/initiativeRulesTypes';
import { t } from '../../../i18n';
import { SwitchRow } from './SwitchRow';

interface InitiativeCardFieldsProps {
  initiative: InitiativeRules;
  onChange: (initiative: InitiativeRules) => void;
}

/** `rules` with the switch `key` on, or without it. */
function switched(rules: InitiativeRules, key: 'dealEachRound' | 'lookAlikesShare', on: boolean): InitiativeRules {
  const { [key]: _old, ...rest } = rules;
  return on ? { ...rest, [key]: true } : rest;
}

export function InitiativeCardFields({ initiative, onChange }: InitiativeCardFieldsProps): React.ReactElement {
  const deck = initiative.deck ?? DEFAULT_DECK;
  const deckValid = isDeckSize(deck);

  return (
    <div className="atlas-csm-field">
      <label className="atlas-csm-label" htmlFor="atlas-csm-initiative-deck">{t('initRules.deck')}</label>
      <input
        id="atlas-csm-initiative-deck"
        type="number"
        className="atlas-csm-input"
        min={MIN_DECK}
        max={MAX_DECK}
        step={1}
        aria-invalid={!deckValid || undefined}
        aria-describedby="atlas-csm-initiative-deck-hint"
        value={Number.isFinite(deck) ? deck : ''}
        onChange={(e) => onChange({ ...initiative, deck: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
      />
      <p id="atlas-csm-initiative-deck-hint" className="atlas-csm-hint">{t('initRules.deckHint')}</p>
      {!deckValid && (
        <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{t('initRules.deckError', { min: MIN_DECK, max: MAX_DECK })}</p>
      )}
      <SwitchRow
        label={t('initRules.dealEachRound')}
        hint={t('initRules.dealEachRoundHint')}
        checked={initiative.dealEachRound === true}
        disabled={false}
        onChange={(on) => onChange(switched(initiative, 'dealEachRound', on))}
      />
      <SwitchRow
        label={t('initRules.share')}
        hint={t('initRules.shareHint')}
        checked={initiative.lookAlikesShare === true}
        disabled={false}
        onChange={(on) => onChange(switched(initiative, 'lookAlikesShare', on))}
      />
    </div>
  );
}
