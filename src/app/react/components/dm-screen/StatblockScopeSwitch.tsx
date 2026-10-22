import React from 'react';
import { SegmentedControl } from '../../../packages/components/primitives/SegmentedControl';
import type { StatblockScope } from './fightStatblocks';
import { t } from '../../../i18n';

interface StatblockScopeSwitchProps {
  scope: StatblockScope;
  /** Statblocks of the fight's combatants, and of every creature on the map. */
  fightCount: number;
  allCount: number;
  onChange: (scope: StatblockScope) => void;
}

/** Above the DM screen's statblocks while a fight runs: the fight's creatures, or every creature on the map. */
export function StatblockScopeSwitch({ scope, fightCount, allCount, onChange }: StatblockScopeSwitchProps): React.ReactElement {
  return (
    <SegmentedControl
      className="atlas-dm-statblock-scope"
      value={scope}
      ariaLabel={t('dashboard.statblockScope')}
      roving
      options={[
        { value: 'fight', label: t('dashboard.inThisFight', { count: fightCount }) },
        { value: 'all', label: t('dashboard.allCreatures', { count: allCount }) },
      ]}
      onChange={onChange}
    />
  );
}
