import { useCallback, useEffect, useState } from 'react';
import type { AssetService } from '../../../../services/AssetService';
import type { TagGroup } from '../../../../services/tagGroups';

interface AssetTags {
  tags: string[];
  createTag: (name: string) => Promise<string>;
  isCreatingTag: boolean;
}

/**
 * The tags of one group that `collection` registers, as its tag manager lists them, and
 * creation of new ones, for asset importers and scene creation. Tags of other collections,
 * or left on assets after their tag was deleted, are not offered.
 */
export function useAssetTags(assetService: AssetService | null, isOpen: boolean, collection: string, group: TagGroup): AssetTags {
  const [tags, setTags] = useState<string[]>([]);
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  useEffect(() => {
    if (!assetService || !isOpen) return;
    let cancelled = false;
    assetService.getCollectionTags(collection, group)
      .then((registered) => { if (!cancelled) setTags(registered.map((tag) => tag.name).sort()); })
      .catch((error) => console.error('[AssetTags] Error loading tags:', error));
    return () => { cancelled = true; };
  }, [assetService, isOpen, collection, group]);

  const createTag = useCallback(async (name: string): Promise<string> => {
    if (!assetService) throw new Error('Asset service is not ready');
    setIsCreatingTag(true);
    try {
      const tag = await assetService.createTag(collection, group, name.trim());
      setTags((previous) => Array.from(new Set([...previous, tag.name])).sort());
      return tag.name;
    } finally {
      setIsCreatingTag(false);
    }
  }, [assetService, collection, group]);

  return { tags, createTag, isCreatingTag };
}
