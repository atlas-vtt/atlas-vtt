import React from 'react';
import type { ActiveCondition } from '../../utils/activeConditions';
import { ConditionBadge } from '../../packages/components/shared/ConditionBadge';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { formatList, t } from '../../i18n';
import { SHOWN_CARD_CONDITIONS } from '../../initiative/combatantConditions';

/** Diameter of a condition badge on a card, in CSS pixels. */
const CARD_CONDITION_SIZE = 18;

interface CardConditionsProps {
  conditions: readonly ActiveCondition[];
  /** The side of the card its tooltips open on, away from the edge the tracker stands at. */
  tooltipSide: 'left' | 'right';
}

/**
 * A combatant's conditions as its token shows them on the map, each named by its tooltip ("Frightened 2"), where the
 * card shows them (`cardConditions`). A tile fans them down its left edge, a compact line sets them beside the name;
 * past `SHOWN_CARD_CONDITIONS` the rest are a count.
 */
export function CardConditions({ conditions, tooltipSide }: CardConditionsProps): React.ReactElement | null {
  if (conditions.length === 0) return null;
  const shown = conditions.slice(0, SHOWN_CARD_CONDITIONS);
  const rest = conditions.slice(SHOWN_CARD_CONDITIONS);
  const restNames = formatList(rest.map((condition) => condition.name));
  return (
    <div className="atlas-initiative-card__conditions" role="list" aria-label={t('initiative.conditions')}>
      {shown.map((condition) => (
        <LabelTooltip key={condition.id} label={condition.name} side={tooltipSide}>
          <span className="atlas-initiative-card__condition" role="listitem" aria-label={condition.name}>
            <ConditionBadge condition={condition} size={CARD_CONDITION_SIZE} />
          </span>
        </LabelTooltip>
      ))}
      {rest.length > 0 && (
        <LabelTooltip label={restNames} side={tooltipSide}>
          <span className="atlas-initiative-card__condition-more" role="listitem" aria-label={restNames}>+{rest.length}</span>
        </LabelTooltip>
      )}
    </div>
  );
}
