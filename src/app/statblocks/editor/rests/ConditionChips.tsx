import React from 'react';
import { cn } from '../../../../utils/cn';
import { t } from '../../../i18n';
import type { ConditionMetric } from '../../../recovery/editor/recoveryMetrics';
import { metricKey } from '../../../recovery/editor/recoveryMetrics';
import { MetricSpot } from './MetricSpot';
import type { SpotShared } from './recoveryChrome';

interface ConditionChipsProps {
  chips: readonly ConditionMetric[];
  shared: SpotShared;
  badgeOf: (chip: ConditionMetric) => string | null;
  picked: string | null;
  tabStop: string | null;
  /** The place of the first chip among all metrics, which staggers its badge after the card's. */
  order: number;
  /** A button is selected: the chips can be picked. */
  pickable: boolean;
}

/** The spot id of a condition's chip. */
export const chipSpotId = (chip: ConditionMetric): string => metricKey(chip.target);

/** The collection's valued conditions, under the card: each a chip a rule can step down or clear. */
export function ConditionChips({ chips, shared, badgeOf, picked, tabStop, order, pickable }: ConditionChipsProps): React.ReactElement {
  return (
    <div className="atlas-rc-conditions" role="group" aria-label={t('recoveryEditor.conditions')}>
      <span className="atlas-rc-conditions__label">{t('recoveryEditor.conditions')}</span>
      <div className="atlas-rc-conditions__chips">
        {chips.map((chip, index) => {
          const spotId = chipSpotId(chip);
          return (
            <span key={spotId} className={cn('atlas-rc-chip', picked === spotId && 'atlas-rc-chip--picked')}>
              <span className="atlas-rc-chip__dot" style={{ backgroundColor: chip.color }} aria-hidden="true" />
              {chip.label}
              {pickable && (
                <MetricSpot {...shared} spotId={spotId} label={chip.label} badge={badgeOf(chip)} order={order + index}
                  picked={picked === spotId} source={false} tabbable={tabStop === spotId} />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
