import type { TokenEntity } from '../../../types';
import type { InitiativeEntry } from '../../../types/initiativeTypes';

/** Which statblocks the DM screen shows while a fight runs: the fight's alone, or all with the fight's first. */
export type StatblockScope = 'fight' | 'all';

/** The statblock notes of a fight's combatants, in turn order, each once. */
export function fightStatblockPaths(entries: readonly InitiativeEntry[], tokens: Readonly<Record<string, TokenEntity>>): string[] {
  const paths = [...entries]
    .sort((a, b) => a.order - b.order)
    .flatMap((entry) => {
      const token = tokens[entry.tokenId];
      return token?.kind === 'character' && token.statblockPath ? [token.statblockPath] : [];
    });
  return [...new Set(paths)];
}

/**
 * The statblocks in the order the DM screen shows them: during a fight those of its combatants
 * first, in turn order, and with `scope` `fight` only those; without a fight all, as they came.
 */
export function statblocksForScreen<T>(statblocks: ReadonlyMap<string, T>, fightPaths: readonly string[], scope: StatblockScope): [string, T][] {
  const fight = fightPaths.flatMap((path): [string, T][] => {
    const statblock = statblocks.get(path);
    return statblock === undefined ? [] : [[path, statblock]];
  });
  if (fight.length === 0) return [...statblocks];
  if (scope === 'fight') return fight;
  const inFight = new Set(fightPaths);
  return [...fight, ...[...statblocks].filter(([path]) => !inFight.has(path))];
}
