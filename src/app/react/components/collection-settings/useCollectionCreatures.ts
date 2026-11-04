import { useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import type { IndexedCreature } from '../../../creatures/CreatureIndex';
import { linkedStatblockPaths } from '../../../creatures/creatureFacts';
import { useCreatureIndex } from '../../../creatures/useCreatureIndex';
import type { AssetService } from '../../../services/AssetService';

export interface CollectionCreatures {
  /** The readable statblocks linked to the collections' tokens, once per note. */
  creatures: IndexedCreature[];
  /** Whether tokens or statblocks are still being read. */
  pending: boolean;
}

const NO_PATHS: readonly string[] = [];

/**
 * The statblocks linked to the tokens of the collections `collectionIds`, read while `active`;
 * pending while the collections are not known yet (null).
 */
export function useCollectionCreatures(
  app: App | null,
  assetService: AssetService | null,
  collectionIds: readonly string[] | null,
  active: boolean,
): CollectionCreatures {
  const [paths, setPaths] = useState<string[] | null>(null);
  // The same collections in a new list read nothing again.
  const key = collectionIds?.join('\n') ?? null;

  useEffect(() => {
    if (!active || !assetService || key === null) return;
    let cancelled = false;
    setPaths(null);
    const ids = key === '' ? [] : key.split('\n');
    Promise.all(ids.map((id) => assetService.getAssets(id, 'token'))).then((tokens) => {
      if (!cancelled) setPaths(linkedStatblockPaths(tokens.flat()));
    }).catch((error: unknown) => {
      console.error('[useCollectionCreatures] Could not list the collections\' tokens:', error);
      if (!cancelled) setPaths([]);
    });
    return () => { cancelled = true; };
  }, [active, assetService, key]);

  const lookup = useCreatureIndex(active ? app : null, paths ?? NO_PATHS);
  const creatures = useMemo(
    () => (paths ?? NO_PATHS).map((path) => lookup.get(path)).filter((creature): creature is IndexedCreature => Boolean(creature)),
    [paths, lookup],
  );
  return { creatures, pending: paths === null || lookup.pending };
}
