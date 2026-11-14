import React from 'react';
import { LabelTooltip } from '../../primitives/tooltip';
import { t } from '../../../../i18n';

export interface SpawnCountBadgeProps {
  count: number;
  onChange: (count: number) => void;
  onSpawn: () => void;
}

const stop = (event: React.SyntheticEvent): void => event.stopPropagation();

/**
 * − ×N + Go over a token card's art, once a count above one is typed. For the pointer only:
 * it lies in the card's hidden art well and takes no focus, since the card is the grid's one
 * control; the keyboard types the count as digits and spawns with Enter. Its words are drawn
 * from `data-label`, so the card's name holds no text of the hidden well; the count is in the
 * card's description.
 */
export function SpawnCountBadge({ count, onChange, onSpawn }: SpawnCountBadgeProps): React.JSX.Element {
  const step = (action: () => void) => (event: React.MouseEvent): void => {
    event.stopPropagation();
    action();
  };
  return (
    <div className="atlas-asset-spawn-badge" onDoubleClick={stop}>
      <LabelTooltip label={t('am.card.decrease')}>
        <span className="atlas-spawn-btn" data-label="−" onClick={step(() => onChange(count - 1))} />
      </LabelTooltip>
      <span className="atlas-spawn-count" data-label={`×${count}`} />
      <LabelTooltip label={t('am.card.increase')}>
        <span className="atlas-spawn-btn" data-label="+" onClick={step(() => onChange(count + 1))} />
      </LabelTooltip>
      <LabelTooltip label={t('am.card.spawn', { count })}>
        <span className="atlas-spawn-btn atlas-spawn-go" data-label={t('am.card.go')} onClick={step(onSpawn)} />
      </LabelTooltip>
    </div>
  );
}
