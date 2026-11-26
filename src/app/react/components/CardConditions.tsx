import React from 'react';
import type { ActiveCondition } from '../../utils/activeConditions';
import { ConditionBadge } from '../../packages/components/shared/ConditionBadge';
import { formatList, t } from '../../i18n';
import { SHOWN_CARD_CONDITIONS } from '../../initiative/combatantConditions';

/** Diameter of a condition badge on a card, in CSS pixels. */
const CARD_CONDITION_SIZE = 18;

interface CardConditionsProps {
  conditions: readonly ActiveCondition[];
}

/**
 * A combatant's conditions as its token shows them on the map, where the card shows them (`cardConditions`), each named
 * for assistive tech ("Frightened 2"); hovering the card names them all in one tooltip (`CardConditionsTooltip`). A tile
 * fans them down its left edge, a compact line sets them beside the name; past `SHOWN_CARD_CONDITIONS` the rest are a count.
 */
export function CardConditions({ conditions }: CardConditionsProps): React.ReactElement | null {
  if (conditions.length === 0) return null;
  const shown = conditions.slice(0, SHOWN_CARD_CONDITIONS);
  const rest = conditions.slice(SHOWN_CARD_CONDITIONS);
  return (
    <div className="atlas-initiative-card__conditions" role="list" aria-label={t('initiative.conditions')}>
      {shown.map((condition) => (
        <span key={condition.id} className="atlas-initiative-card__condition" role="listitem" aria-label={condition.name}>
          <ConditionBadge condition={condition} size={CARD_CONDITION_SIZE} />
        </span>
      ))}
      {rest.length > 0 && (
        <span className="atlas-initiative-card__condition-more" role="listitem" aria-label={formatList(rest.map(({ name }) => name))}>+{rest.length}</span>
      )}
    </div>
  );
}
