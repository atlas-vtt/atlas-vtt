import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { useAtlasStore } from '../../ViewStoreContext';
import type { TokenEntity } from '../../../types';
import { playerTokensRevision, subscribePlayerTokens } from '../../../characters/playerTokens';
import { fightStatblockPaths, playerStatblockPaths, statblocksForScreen, type StatblockScope } from './fightStatblocks';
import { StatblockScopeSwitch } from './StatblockScopeSwitch';

/** Whether a choice of `count` statblocks out of `total` narrows the list at all. */
const narrows = (count: number, total: number): boolean => count > 0 && count < total;

/**
 * The DM screen's statblocks in the order it shows them: while a fight runs, the fight's
 * combatants' alone (in turn order), with a switch to the player characters' and to every creature
 * on the map, the fight's first. A scene may hold ten kinds of creature where a fight uses two or
 * three. A choice that would show no statblock, or all of them, is not offered; the switch shows
 * only while it offers more than All.
 */
export function useFightStatblocks<T>(statblocks: ReadonlyMap<string, T>, tokens: Readonly<Record<string, TokenEntity>>): { shown: [string, T][]; scopeSwitch: React.ReactNode } {
  const initiative = useAtlasStore((state) => state.initiative);
  const [chosen, setChosen] = useState<StatblockScope>('fight');
  // Every fight starts with its own statblocks: the screen stays mounted, so another choice would carry over
  const [fightRan, setFightRan] = useState(initiative.isActive);
  if (fightRan !== initiative.isActive) {
    setFightRan(initiative.isActive);
    if (initiative.isActive) setChosen('fight');
  }
  const playerTokens = useSyncExternalStore(subscribePlayerTokens, playerTokensRevision, playerTokensRevision);
  const fightPaths = useMemo(
    () => (initiative.isActive ? fightStatblockPaths(initiative.entries, tokens).filter((path) => statblocks.has(path)) : []),
    [initiative.isActive, initiative.entries, tokens, statblocks],
  );
  const playerPaths = useMemo(
    () => new Set([...playerStatblockPaths(tokens)].filter((path) => statblocks.has(path))),
    [tokens, statblocks, playerTokens],
  );
  const fightCount = narrows(fightPaths.length, statblocks.size) ? fightPaths.length : null;
  const playerCount = narrows(playerPaths.size, statblocks.size) ? playerPaths.size : null;
  const offered = (scope: StatblockScope): boolean =>
    scope === 'all' || (scope === 'fight' ? fightCount !== null : playerCount !== null);
  const scope: StatblockScope = offered(chosen) ? chosen : fightCount !== null ? 'fight' : 'all';
  const shown = useMemo(() => statblocksForScreen(statblocks, fightPaths, scope, playerPaths), [statblocks, fightPaths, scope, playerPaths]);
  const scopeSwitch = fightCount !== null || playerCount !== null
    ? <StatblockScopeSwitch scope={scope} fightCount={fightCount} playerCount={playerCount} allCount={statblocks.size} onChange={setChosen} />
    : null;
  return { shown, scopeSwitch };
}
