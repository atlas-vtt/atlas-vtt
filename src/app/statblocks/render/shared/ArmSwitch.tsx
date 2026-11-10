import React from 'react';
import { t } from '../../../i18n';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { useRollBonusTarget } from '../../rollBonuses/rollBonusContext';
import { useArmedBonus } from '../../rollBonuses/useArmedBonus';

interface ArmSwitchProps {
  /** The value's id (`bonusId`). */
  id: string;
  /** What the roll names it: the field's label, the pair's name. */
  label: string;
}

/** Keys the switch uses are its own: the editing around it and the map's shortcuts never see them. */
function keepKeys(event: React.KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
}

/**
 * "Add to next roll": a small switch after a value that arms it for the
 * statblock's next roll, which adds it as a term of its own and switches it
 * off again. Every view of the statblock shows the same state. A card that
 * only previews its template (the template editor) draws it as it will look,
 * inert: nothing is armed there.
 */
export function ArmSwitch({ id, label }: ArmSwitchProps): React.JSX.Element {
  const target = useRollBonusTarget();
  const { armed, toggle } = useArmedBonus(target, id);
  if (!target?.store) {
    return (
      <span className="atlas-sb-arm" inert>
        <ToggleSwitch size="xs" value={false} onChange={toggle} />
      </span>
    );
  }
  return (
    <span className="atlas-sb-arm" onKeyDown={keepKeys}>
      <LabelTooltip label={t('statblock.addToNextRoll', { name: label })}>
        <ToggleSwitch size="xs" value={armed} onChange={toggle} />
      </LabelTooltip>
    </span>
  );
}
