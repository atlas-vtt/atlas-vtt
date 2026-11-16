import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { factsOf, linkedStatblockPaths, type CreatureRating } from '../../../../creatures/creatureFacts';
import { evaluateCreatureFilters, type CreatureFacets, type CreatureFilterResult } from '../../../../creatures/creatureFilterEngine';
import { activeFilterCount, pruneSelection } from '../../../../creatures/creatureSelection';
import { useCreatureIndex } from '../../../../creatures/useCreatureIndex';
import {
  emptyCreatureSelection,
  type CreatureFilterDefinition,
  type CreatureFilterSelection,
} from '../../../../types/creatureFilterTypes';
import type { AnyAsset, TokenAsset } from '../types';
import { isCharacterTab } from '../utils/tabKinds';
import { filterAssets, matchingAssets, type AssetFilter } from '../utils/assetFilter';

/** The creature filters of the Characters tab, as the filter panel and the search show and edit them. */
export interface CreatureFilterPanel {
  definitions: readonly CreatureFilterDefinition[];
  selection: CreatureFilterSelection;
  setSelection: (update: (selection: CreatureFilterSelection) => CreatureFilterSelection) => void;
  result: CreatureFilterResult;
  /**
   * The options and counts of the characters the filters search without the plain words of the search: what a word
   * typed there finds as a filter value ("beast" as `type:beast`), which the name search it also is may hide.
   */
  wordFacets: CreatureFacets;
  /** Filters that narrow the list. */
  activeCount: number;
  /** Whether linked statblocks are still being read, so counts may still change. */
  pending: boolean;
}

export interface CreatureFiltering {
  /** The assets the content area shows, before sorting. */
  assets: AnyAsset[];
  /**
   * The assets of the tab, in every folder, that the search, tags and creature filters leave: what the list shows
   * while any of them narrows it, and what the sidebar counts tags in, so a tag's count is what picking it shows.
   */
  matching: AnyAsset[];
  /** The asset filter with creature filters taken into account (they widen the folder scope like a search). */
  filter: AssetFilter;
  /** Set on the Characters tab only. */
  panel: CreatureFilterPanel | null;
  /** The rating of a character's statblock, for the Rating sort. */
  ratingOf: (asset: AnyAsset) => CreatureRating | null;
  /** Whether any creature filter narrows the list. */
  isActive: boolean;
  /** Changes whenever the creature filters change what is listed. */
  refinementKey: string;
  clear: () => void;
}

interface CreatureFilteringOptions {
  app: App;
  /** The filters of the collection in view (`useCollectionFilterDefinitions`). */
  definitions: readonly CreatureFilterDefinition[];
  isOpen: boolean;
  assets: readonly AnyAsset[];
  filter: AssetFilter;
}

const NO_PATHS: string[] = [];

/**
 * Applies the collection's creature filters on top of the asset filter. The
 * options and counts come from every folder of the tab, which is what an active
 * filter searches. Picks reset when the manager opens or the tab changes, like
 * tags; picks for filters the collection does not define are dropped.
 */
export function useCreatureFilters({ app, definitions, isOpen, assets, filter }: CreatureFilteringOptions): CreatureFiltering {
  const enabled = isCharacterTab(filter.tab);
  const [storedSelection, setStoredSelection] = useState<CreatureFilterSelection>(emptyCreatureSelection);
  const selection = useMemo(() => pruneSelection(storedSelection, definitions), [storedSelection, definitions]);
  // The panel shows a pick at once; the cards it leaves follow in a render of their own, which React does in slices
  // between frames (a pick re-rendered the grid in one task of 40 to 50 ms).
  const listed = useDeferredValue(selection);

  useEffect(() => {
    if (isOpen) setStoredSelection(emptyCreatureSelection());
  }, [isOpen, filter.tab]);

  const totalCount = enabled ? activeFilterCount(listed, definitions) : 0;
  const scopeFilter = useMemo((): AssetFilter => ({ ...filter, narrowed: totalCount > 0 }), [filter, totalCount]);
  const scoped = useMemo(() => filterAssets(assets, scopeFilter), [assets, scopeFilter]);
  const tagged = useMemo(() => matchingAssets(assets, filter), [assets, filter]);
  // The filters offer what they would search: every folder of the tab, so a folder that only
  // holds folders (often the root) offers the statblocks of its subfolders.
  // Without the name search too, for the words of the search that name a filter value (`wordFacets`).
  const unsearched = useMemo((): TokenAsset[] => {
    if (!enabled) return [];
    const inScope = matchingAssets(assets, { ...filter, search: '' });
    return inScope.filter((asset): asset is TokenAsset => asset.type === 'tokens');
  }, [enabled, assets, filter]);
  const tokens = useMemo(() => {
    const words = filter.search.toLowerCase();
    return words ? unsearched.filter((token) => token.name.toLowerCase().includes(words)) : unsearched;
  }, [unsearched, filter.search]);

  const pathsKey = linkedStatblockPaths(unsearched).join('\n');
  const paths = useMemo(() => (pathsKey ? pathsKey.split('\n') : NO_PATHS), [pathsKey]);
  const lookup = useCreatureIndex(enabled ? app : null, paths);

  const unsearchedFacts = useMemo(() => unsearched.map((token) => factsOf(token, lookup.get, definitions)), [unsearched, lookup, definitions]);
  const facts = useMemo(() => {
    if (tokens === unsearched) return unsearchedFacts;
    const byId = new Map(unsearched.map((token, index) => [token.id, unsearchedFacts[index]!]));
    return tokens.map((token) => byId.get(token.id)!);
  }, [tokens, unsearched, unsearchedFacts]);
  const result = useMemo(() => evaluateCreatureFilters(facts, definitions, listed), [facts, definitions, listed]);
  const unsearchedResult = useMemo(
    () => (facts === unsearchedFacts ? result : evaluateCreatureFilters(unsearchedFacts, definitions, listed)),
    [facts, unsearchedFacts, result, definitions, listed],
  );

  const passes = useMemo((): ((asset: AnyAsset) => boolean) | null => {
    if (totalCount === 0) return null;
    const passing = new Set(tokens.filter((_, index) => result.passes[index]).map((token) => token.id));
    return (asset) => passing.has(asset.id);
  }, [totalCount, tokens, result]);
  const shown = useMemo(() => (passes ? scoped.filter(passes) : scoped), [passes, scoped]);
  const matching = useMemo(() => (passes ? tagged.filter(passes) : tagged), [passes, tagged]);

  const ratingOf = useMemo(() => {
    const ratings = new Map(tokens.map((token, index) => [token.id, facts[index]?.rating ?? null]));
    return (asset: AnyAsset): CreatureRating | null => ratings.get(asset.id) ?? null;
  }, [tokens, facts]);

  const panel = useMemo((): CreatureFilterPanel | null => (enabled ? {
    definitions,
    selection,
    setSelection: (update) => setStoredSelection((current) => update(pruneSelection(current, definitions))),
    result,
    wordFacets: unsearchedResult.facets,
    activeCount: totalCount,
    pending: lookup.pending,
  } : null), [enabled, definitions, selection, result, unsearchedResult, totalCount, lookup.pending]);

  return {
    assets: shown,
    matching,
    filter: scopeFilter,
    panel,
    ratingOf,
    isActive: totalCount > 0,
    refinementKey: totalCount > 0 ? JSON.stringify(listed) : '',
    clear: () => setStoredSelection(emptyCreatureSelection()),
  };
}
