import { useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { useCreatureIndex } from '../../../creatures/useCreatureIndex';
import { IGNORED_FIELDS } from '../../../creatures/ignoredFields';
import { AssetService } from '../../../services/AssetService';
import { isReservedKey } from '../../model/reservedKeys';

/** Keys the collection's statblocks use, with how many statblocks hold each. */
export type CollectionFieldKeys = ReadonlyMap<string, number>;

const NONE: CollectionFieldKeys = new Map();
const NO_PATHS: readonly string[] = [];

/** The statblock notes the collection's tokens link, each once. */
function useLinkedNotes(app: App | undefined, collectionId: string | null): readonly string[] {
  const [paths, setPaths] = useState<readonly string[]>(NO_PATHS);
  useEffect(() => {
    if (!app || collectionId === null) {
      setPaths(NO_PATHS);
      return undefined;
    }
    let current = true;
    AssetService.getInstance(app).getAssets(collectionId, 'token').then(
      (tokens) => {
        if (!current) return;
        const linked = [...new Set(tokens.map((token) => token.statblockPath).filter((path): path is string => Boolean(path)))].sort();
        setPaths((previous) => (previous.join('\n') === linked.join('\n') ? previous : linked));
      },
      (error: unknown) => console.error('[Atlas] Reading the collection\'s statblocks failed:', error),
    );
    return () => { current = false; };
  }, [app, collectionId]);
  return paths;
}

/**
 * The keys found in the collection context's statblocks (§7.4, §7.6): a label
 * that names one binds its new block to it, so imported statblocks keep their
 * data. Keys Atlas, Obsidian or Fantasy Statblocks keep for themselves are left out.
 */
export function useCollectionFieldKeys(app: App | undefined, collectionId: string | null): CollectionFieldKeys {
  const paths = useLinkedNotes(app, collectionId);
  const creatures = useCreatureIndex(app ?? null, paths);
  return useMemo(() => {
    if (paths.length === 0) return NONE;
    const counts = new Map<string, number>();
    for (const path of paths) {
      const fields = creatures.get(path)?.fields;
      if (!fields) continue;
      for (const key of Object.keys(fields)) {
        if (IGNORED_FIELDS.has(key) || isReservedKey(key)) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }, [paths, creatures]);
}
