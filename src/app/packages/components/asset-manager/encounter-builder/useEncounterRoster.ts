import { useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import { formatServiceAsset, partitionByTab } from '../utils/assetFormatters';
import { sortAssets } from '../utils/assetSort';
import type { AssetFilter } from '../utils/assetFilter';
import { useCollectionFilterDefinitions } from '../hooks/useCollectionFilterDefinitions';
import { useCreatureFilters } from '../hooks/useCreatureFilters';
import { useFilterSearch, useSearchKeywords, type FilterSearch } from '../hooks/useFilterSearch';
import type { Tag, TokenAsset } from '../types';

export interface EncounterRoster {
  /** The creatures that pass the search and filters, by rating, unrated last. */
  shown: TokenAsset[];
  /** Every creature of the collection, before searching. */
  all: readonly TokenAsset[];
  total: number;
  loading: boolean;
  /** Changes whenever the search or a filter does. */
  refinement: string;
  search: string;
  setSearch: (search: string) => void;
  query: FilterSearch;
}

const NO_TOKENS: TokenAsset[] = [];
const NO_TAGS: Tag[] = [];

function isCreature(asset: ReturnType<typeof formatServiceAsset>): asset is TokenAsset {
  return asset.type === 'tokens' && Boolean(asset.statblockPath);
}

/**
 * The creatures an encounter is built from: the collection's tokens that link a statblock (an
 * encounter is made of tokens, so a statblock without one could not be placed), searched and
 * filtered as the Characters tab does, with the same keywords, filter panel and chips.
 */
export function useEncounterRoster(app: App, assetService: AssetService | null, collectionId: string, isOpen: boolean): EncounterRoster {
  const [tokens, setTokens] = useState<TokenAsset[]>(NO_TOKENS);
  const [tags, setTags] = useState<Tag[]>(NO_TAGS);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen || !assetService) return undefined;
    let current = true;
    setLoading(true);
    void (async (): Promise<void> => {
      try {
        const [assets, collectionTags] = await Promise.all([
          assetService.getAssets(collectionId),
          assetService.getCollectionTags(collectionId, 'tokens'),
        ]);
        if (!current) return;
        setTokens(partitionByTab(assets).tokens.map((asset) => formatServiceAsset(asset, null, app)).filter(isCreature));
        setTags(collectionTags.map((tag) => ({ id: tag.id, name: tag.name })));
      } catch (error) {
        console.error('[EncounterBuilder] Could not load the collection\'s creatures:', error);
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => { current = false; };
  }, [app, assetService, collectionId, isOpen]);

  const definitions = useCollectionFilterDefinitions(app, assetService, collectionId);
  const keywords = useSearchKeywords('tokens', definitions, search);
  const filter = useMemo((): AssetFilter => ({
    tab: 'tokens',
    folderId: null,
    search: keywords.nameQuery,
    tags: tagIds.map((id) => tags.find((tag) => tag.id === id) ?? { id, name: id }),
  }), [keywords.nameQuery, tagIds, tags]);

  const creature = useCreatureFilters({ app, definitions, isOpen, assets: tokens, folders: [], filter });
  const query = useFilterSearch({ keywords, setSearch, panel: creature.panel, tags, tagIds, setTagIds });

  const shown = useMemo(
    () => sortAssets(creature.assets, 'rating', 'asc', creature.ratingOf).filter((asset): asset is TokenAsset => asset.type === 'tokens'),
    [creature.assets, creature.ratingOf],
  );

  const refinement = [keywords.nameQuery, ...tagIds, creature.refinementKey].join('\n');
  return { shown, all: tokens, total: tokens.length, loading, refinement, search, setSearch, query };
}
