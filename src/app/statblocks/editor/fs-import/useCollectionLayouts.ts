import { useEffect, useState } from 'react';
import type { App, EventRef } from 'obsidian';
import { linkedStatblockPaths } from '../../../creatures/creatureFacts';
import { AssetService } from '../../../services/AssetService';
import { layoutGroupsOfNotes, type LayoutGroup } from '../../fs/fsLayoutStatblocks';

/** Notes change often while typing, and a batch changes hundreds: the list follows once the metadata settles. */
const SETTLE_MS = 500;

function samePaths(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((path, at) => path === b[at]);
}

function sameGroups(a: readonly LayoutGroup[], b: readonly LayoutGroup[]): boolean {
  return a.length === b.length && a.every((group, index) => {
    const other = b[index];
    return other !== undefined && other.layout.id === group.layout.id && other.layout.name === group.layout.name
      && samePaths(other.statblocks.frontmatter, group.statblocks.frontmatter) && samePaths(other.statblocks.fences, group.statblocks.fences);
  });
}

/**
 * The Fantasy Statblocks layouts that draw the statblocks the collection's
 * tokens link (in properties and in code blocks), each with its statblocks;
 * null while they are read. Follows the metadata cache, so moved statblocks
 * leave the list.
 */
export function useCollectionLayouts(app: App, collectionId: string): readonly LayoutGroup[] | null {
  const [groups, setGroups] = useState<readonly LayoutGroup[] | null>(null);
  useEffect(() => {
    let paths: string[] | null = null;
    let current = true;
    let timer = 0;
    const abort = new AbortController();
    const read = (): void => {
      if (!current || paths === null) return;
      layoutGroupsOfNotes(app, paths, abort.signal).then(
        (next) => { if (current) setGroups((previous) => (previous && sameGroups(previous, next) ? previous : next)); },
        (error: unknown) => { console.error('[Atlas] Reading the layouts of the collection\'s statblocks failed:', error); },
      );
    };
    setGroups(null);
    AssetService.getInstance(app).getAssets(collectionId, 'token').then(
      (tokens) => {
        paths = linkedStatblockPaths(tokens.flatMap((asset) => (asset.type === 'token' ? [asset] : [])));
        read();
      },
      (error: unknown) => {
        console.error('[Atlas] Listing the collection\'s statblocks failed:', error);
        paths = [];
        read();
      },
    );
    const later = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, SETTLE_MS);
    };
    const refs: EventRef[] = [app.metadataCache.on('changed', later), app.metadataCache.on('deleted', later)];
    return () => {
      current = false;
      abort.abort();
      window.clearTimeout(timer);
      refs.forEach((ref) => app.metadataCache.offref(ref));
    };
  }, [app, collectionId]);
  return groups;
}
