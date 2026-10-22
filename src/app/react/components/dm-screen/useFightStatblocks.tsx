import React, { useMemo, useState } from 'react';
import { useAtlasStore } from '../../ViewStoreContext';
import type { TokenEntity } from '../../../types';
import { fightStatblockPaths, statblocksForScreen, type StatblockScope } from './fightStatblocks';
import { StatblockScopeSwitch } from './StatblockScopeSwitch';

/**
 * The DM screen's statblocks in the order it shows them: while a fight runs, the fight's
 * combatants' alone (in turn order), with a switch to every creature on the map, the fight's first.
 * A scene may hold ten kinds of creature where a fight uses two or three. Without a fight, or
 * where none of the combatants has a statblock, all of them and no switch.
 */
export function useFightStatblocks<T>(statblocks: ReadonlyMap<string, T>, tokens: Readonly<Record<string, TokenEntity>>): { shown: [string, T][]; scopeSwitch: React.ReactNode } {
  const initiative = useAtlasStore((state) => state.initiative);
  const [scope, setScope] = useState<StatblockScope>('fight');
  // Every fight starts with its own statblocks: the screen stays mounted, so All would carry over
  const [fightRan, setFightRan] = useState(initiative.isActive);
  if (fightRan !== initiative.isActive) {
    setFightRan(initiative.isActive);
    if (initiative.isActive) setScope('fight');
  }
  const fightPaths = useMemo(
    () => (initiative.isActive ? fightStatblockPaths(initiative.entries, tokens).filter((path) => statblocks.has(path)) : []),
    [initiative.isActive, initiative.entries, tokens, statblocks],
  );
  const shown = useMemo(() => statblocksForScreen(statblocks, fightPaths, scope), [statblocks, fightPaths, scope]);
  const scopeSwitch = fightPaths.length > 0 && fightPaths.length < statblocks.size
    ? <StatblockScopeSwitch scope={scope} fightCount={fightPaths.length} allCount={statblocks.size} onChange={setScope} />
    : null;
  return { shown, scopeSwitch };
}
