import React from 'react';
import type { ActiveCondition } from '../../utils/activeConditions';
import { ConditionBadge } from '../../packages/components/shared/ConditionBadge';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { t } from '../../i18n';

/** Diameter of a condition badge on a card, in CSS pixels. */
export const CARD_CONDITION_SIZE = 18;

interface CardConditionsProps {
  conditions: readonly ActiveCondition[];
  /** The side of the card its tooltips open on, away from the edge the tracker stands at. */
  tooltipSide: 'left' | 'right';
}

/** A combatant's conditions as its token shows them on the map, each named by its tooltip ("Frightened 2"). */
export function CardConditions({ conditions, tooltipSide }: CardConditionsProps): React.ReactElement | null {
  if (conditions.length === 0) return null;
  return (
    <div className="atlas-initiative-card__conditions" role="list" aria-label={t('initiative.conditions')}>
      {conditions.map((condition) => (
        <LabelTooltip key={condition.id} label={condition.name} side={tooltipSide}>
          <span className="atlas-initiative-card__condition" role="listitem">
            <ConditionBadge condition={condition} size={CARD_CONDITION_SIZE} />
          </span>
        </LabelTooltip>
      ))}
    </div>
  );
}
