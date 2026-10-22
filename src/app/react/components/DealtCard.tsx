import React from 'react';
import { t } from '../../i18n';

/** The card a combatant was dealt in a fight by cards, where a combatant's number stands otherwise; a dash before it has one. */
export function DealtCard({ card }: { card: number | undefined }): React.ReactElement {
  const label = card === undefined ? t('initRules.noCard') : t('initRules.cardLabel', { card });
  return (
    <span className={`atlas-initiative-card__dealt${card === undefined ? ' atlas-initiative-card__dealt--none' : ''}`}>
      <span aria-hidden="true">{card ?? '–'}</span>
      <span className="atlas-initiative-card__dealt-label">{label}</span>
    </span>
  );
}
