import React from 'react';
import { turnsLabel, type CombatantCondition } from '../../initiative/combatantConditions';
import { ConditionBadge } from '../../packages/components/shared/ConditionBadge';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { formatList, t } from '../../i18n';

/** Diameter of a condition badge on a card, in CSS pixels. */
export const CARD_CONDITION_SIZE = 18;
/** The most badges a card shows; the rest are a count after them, named by its tooltip. */
const SHOWN_CONDITIONS = 3;

interface CardConditionsProps {
  conditions: readonly CombatantCondition[];
  /** The side of the card its tooltips open on, away from the edge the tracker stands at. */
  tooltipSide: 'left' | 'right';
}

/**
 * A combatant's conditions as its token shows them on the map, each named by its tooltip ("Frightened 2"); one that
 * lasts a number of turns carries what is left of them. Past `SHOWN_CONDITIONS` the rest are a count.
 */
export function CardConditions({ conditions, tooltipSide }: CardConditionsProps): React.ReactElement | null {
  if (conditions.length === 0) return null;
  const shown = conditions.slice(0, SHOWN_CONDITIONS);
  const rest = conditions.slice(SHOWN_CONDITIONS);
  return (
    <div className={`atlas-initiative-card__conditions${rest.length > 0 ? ' atlas-initiative-card__conditions--stacked' : ''}`} role="list" aria-label={t('initiative.conditions')}>
      {shown.map((condition) => (
        <LabelTooltip key={condition.id} label={turnsLabel(condition)} side={tooltipSide}>
          <span className="atlas-initiative-card__condition" role="listitem" aria-label={turnsLabel(condition)}>
            <ConditionBadge condition={condition} size={CARD_CONDITION_SIZE} />
            {condition.turns !== undefined && <span className="atlas-initiative-card__condition-turns" aria-hidden="true">{condition.turns}</span>}
          </span>
        </LabelTooltip>
      ))}
      {rest.length > 0 && (
        <LabelTooltip label={formatList(rest.map(turnsLabel))} side={tooltipSide}>
          <span className="atlas-initiative-card__condition-more" role="listitem" aria-label={formatList(rest.map(turnsLabel))}>+{rest.length}</span>
        </LabelTooltip>
      )}
    </div>
  );
}
