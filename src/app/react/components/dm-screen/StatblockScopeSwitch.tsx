import React from 'react';
import { SegmentedControl, type SegmentedOption } from '../../../packages/components/primitives/SegmentedControl';
import type { StatblockScope } from './fightStatblocks';
import { t } from '../../../i18n';

interface StatblockScopeSwitchProps {
  scope: StatblockScope;
  /** Statblocks of the fight's combatants and of the player characters, each null where that choice is not offered. */
  fightCount: number | null;
  playerCount: number | null;
  /** Statblocks of every creature on the map. */
  allCount: number;
  onChange: (scope: StatblockScope) => void;
}

/** Above the DM screen's statblocks: the fight's creatures, the player characters, or every creature on the map. */
export function StatblockScopeSwitch({ scope, fightCount, playerCount, allCount, onChange }: StatblockScopeSwitchProps): React.ReactElement {
  const options: SegmentedOption<StatblockScope>[] = [
    ...(fightCount !== null ? [{ value: 'fight' as const, label: t('dashboard.thisFight', { count: fightCount }) }] : []),
    ...(playerCount !== null ? [{ value: 'players' as const, label: t('dashboard.playerCharacters', { count: playerCount }) }] : []),
    { value: 'all', label: t('dashboard.allCreatures', { count: allCount }) },
  ];
  return (
    <SegmentedControl
      className="atlas-dm-statblock-scope"
      value={scope}
      ariaLabel={t('dashboard.statblockScope')}
      roving
      options={options}
      onChange={onChange}
    />
  );
}
