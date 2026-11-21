import type { TokenEntity } from '../../../types';
import type { InitiativeEntry } from '../../../types/initiativeTypes';
import { entryToken } from '../../../initiative/party';
import { isPlayersToken } from '../../../characters/playerTokens';

/** Which statblocks the DM screen shows: the fight's alone, the players' characters' alone, or all with the fight's first. */
export type StatblockScope = 'fight' | 'players' | 'all';

/** The statblock notes of a fight's combatants, in turn order, each once. */
export function fightStatblockPaths(entries: readonly InitiativeEntry[], tokens: Readonly<Record<string, TokenEntity>>): string[] {
  const paths = [...entries]
    .sort((a, b) => a.order - b.order)
    .flatMap((entry) => {
      const token = entryToken(tokens, entry);
      return token?.kind === 'character' && token.statblockPath ? [token.statblockPath] : [];
    });
  return [...new Set(paths)];
}

/** The statblock notes linked by the map's player character tokens (`isPlayersToken`). */
export function playerStatblockPaths(tokens: Readonly<Record<string, TokenEntity>>): Set<string> {
  return new Set(Object.values(tokens).flatMap((token) =>
    token.kind === 'character' && token.statblockPath && isPlayersToken(token) ? [token.statblockPath] : []));
}

/**
 * The statblocks in the order the DM screen shows them: during a fight those of its combatants
 * first, in turn order, and with `scope` `fight` only those; with `players` only the player
 * characters' (in the same order); otherwise all.
 */
export function statblocksForScreen<T>(
  statblocks: ReadonlyMap<string, T>,
  fightPaths: readonly string[],
  scope: StatblockScope,
  playerPaths: ReadonlySet<string>,
): [string, T][] {
  const fight = fightPaths.flatMap((path): [string, T][] => {
    const statblock = statblocks.get(path);
    return statblock === undefined ? [] : [[path, statblock]];
  });
  if (scope === 'fight' && fight.length > 0) return fight;
  const inFight = new Set(fightPaths);
  const ordered = [...fight, ...[...statblocks].filter(([path]) => !inFight.has(path))];
  return scope === 'players' ? ordered.filter(([path]) => playerPaths.has(path)) : ordered;
}
