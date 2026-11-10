import { useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { factsOf, linkedStatblockPaths, type CreatureRating } from '../../../../creatures/creatureFacts';
import { evaluateCreatureFilters, type CreatureFilterResult } from '../../../../creatures/creatureFilterEngine';
import { activeFilterCount, pruneSelection } from '../../../../creatures/creatureSelection';
import { useCreatureIndex } from '../../../../creatures/useCreatureIndex';
import {
  emptyCreatureSelection,
  type CreatureFilterDefinition,
  type CreatureFilterSelection,
} from '../../../../types/creatureFilterTypes';
import type { AnyAsset, Folder, TokenAsset } from '../types';
import { isCharacterTab } from '../utils/tabKinds';
import { filterAssets, type AssetFilter } from '../utils/assetFilter';

/** The creature filters of the Characters tab, as the filter panel and the search show and edit them. */
export interface CreatureFilterPanel {
  definitions: readonly CreatureFilterDefinition[];
  selection: CreatureFilterSelection;
  setSelection: (update: (selection: CreatureFilterSelection) => CreatureFilterSelection) => void;
  result: CreatureFilterResult;
  /** Filters that narrow the list. */
  activeCount: number;
  /** Whether linked statblocks are still being read, so counts may still change. */
  pending: boolean;
}

export interface CreatureFiltering {
  /** The assets the content area shows, before sorting. */
  assets: AnyAsset[];
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
  folders: readonly Folder[];
  filter: AssetFilter;
}

const NO_PATHS: string[] = [];

/**
 * Applies the collection's creature filters on top of the asset filter. The
 * options and counts come from the open folder and all folders below it, which
 * is what an active filter searches. Picks reset when the manager opens or the
 * tab changes, like tags; picks for filters the collection does not define are
 * dropped.
 */
export function useCreatureFilters({ app, definitions, isOpen, assets, folders, filter }: CreatureFilteringOptions): CreatureFiltering {
  const enabled = isCharacterTab(filter.tab);
  const [storedSelection, setStoredSelection] = useState<CreatureFilterSelection>(emptyCreatureSelection);
  const selection = useMemo(() => pruneSelection(storedSelection, definitions), [storedSelection, definitions]);

  useEffect(() => {
    if (isOpen) setStoredSelection(emptyCreatureSelection());
  }, [isOpen, filter.tab]);

  const totalCount = enabled ? activeFilterCount(selection, definitions) : 0;
  const scopeFilter = useMemo((): AssetFilter => ({ ...filter, narrowed: totalCount > 0 }), [filter, totalCount]);
  const scoped = useMemo(() => filterAssets(assets, folders, scopeFilter), [assets, folders, scopeFilter]);
  // The filters offer what they would search: the open folder with every folder below it, so a
  // folder that only holds folders (often the root) offers the statblocks of its subfolders.
  const tokens = useMemo(() => {
    if (!enabled) return [];
    const searched = filterAssets(assets, folders, { ...filter, narrowed: true });
    return searched.filter((asset): asset is TokenAsset => asset.type === 'tokens');
  }, [enabled, assets, folders, filter]);

  const pathsKey = linkedStatblockPaths(tokens).join('\n');
  const paths = useMemo(() => (pathsKey ? pathsKey.split('\n') : NO_PATHS), [pathsKey]);
  const lookup = useCreatureIndex(enabled ? app : null, paths);

  const facts = useMemo(() => tokens.map((token) => factsOf(token, lookup.get, definitions)), [tokens, lookup, definitions]);
  const result = useMemo(() => evaluateCreatureFilters(facts, definitions, selection), [facts, definitions, selection]);

  const shown = useMemo(() => {
    if (totalCount === 0) return scoped;
    const passing = new Set(tokens.filter((_, index) => result.passes[index]).map((token) => token.id));
    return scoped.filter((asset) => passing.has(asset.id));
  }, [totalCount, scoped, tokens, result]);

  const ratingOf = useMemo(() => {
    const ratings = new Map(tokens.map((token, index) => [token.id, facts[index]?.rating ?? null]));
    return (asset: AnyAsset): CreatureRating | null => ratings.get(asset.id) ?? null;
  }, [tokens, facts]);

  const panel = useMemo((): CreatureFilterPanel | null => (enabled ? {
    definitions,
    selection,
    setSelection: (update) => setStoredSelection((current) => update(pruneSelection(current, definitions))),
    result,
    activeCount: totalCount,
    pending: lookup.pending,
  } : null), [enabled, definitions, selection, result, totalCount, lookup.pending]);

  return {
    assets: shown,
    filter: scopeFilter,
    panel,
    ratingOf,
    isActive: totalCount > 0,
    refinementKey: totalCount > 0 ? JSON.stringify(selection) : '',
    clear: () => setStoredSelection(emptyCreatureSelection()),
  };
}
