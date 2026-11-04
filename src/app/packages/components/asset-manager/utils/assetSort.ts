import type { CreatureRating } from '../../../../creatures/creatureFacts';
import type { AnyAsset, EncounterAsset, SortOption, SortOrder, Tab } from '../types';
import { t } from '../../../../i18n';
import { isCharacterTab } from './tabKinds';

export const SORT_LABELS: Record<SortOption, string> = {
  name: t('sort.name'),
  date: t('sort.date'),
  type: t('sort.type'),
  rating: t('sort.rating'),
};

const ASSET_SORT_OPTIONS: readonly SortOption[] = ['name', 'date', 'type'];
// Characters also sort by the rating of their statblocks (challenge rating, level or tier).
const CHARACTER_SORT_OPTIONS: readonly SortOption[] = ['name', 'date', 'type', 'rating'];
// Every scene is of one kind: the scene index does not record which map a scene shows.
const SCENE_SORT_OPTIONS: readonly SortOption[] = ['name', 'date'];

/** The sort options that order the assets of a tab, in the order the sort button cycles through them. */
export function sortOptionsFor(tab: Tab): readonly SortOption[] {
  if (tab === 'scenes') return SCENE_SORT_OPTIONS;
  return isCharacterTab(tab) ? CHARACTER_SORT_OPTIONS : ASSET_SORT_OPTIONS;
}

/** The chosen sort option, or name where the option means nothing on the tab. */
export function resolveSortOption(requested: SortOption, tab: Tab): SortOption {
  return sortOptionsFor(tab).includes(requested) ? requested : 'name';
}

type AssetComparator = (a: AnyAsset, b: AnyAsset) => number;

// Numeric so "Goblin 2" sorts before "Goblin 10"; base sensitivity ignores case and accents.
const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const DIFFICULTY_RANK: Record<NonNullable<EncounterAsset['difficulty']>, number> = {
  easy: 0, medium: 1, hard: 2, deadly: 3,
};
const UNRANKED = Object.keys(DIFFICULTY_RANK).length;

function fileExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot + 1).toLowerCase();
}

/**
 * Characters by size, then those with a linked statblock first; maps by file
 * format; encounters by difficulty.
 */
const compareKinds: AssetComparator = (a, b) => {
  if (a.type === 'tokens' && b.type === 'tokens') {
    return (a.size ?? 1) - (b.size ?? 1) || Number(!a.statblockPath) - Number(!b.statblockPath);
  }
  if (a.type === 'maps' && b.type === 'maps') {
    return nameCollator.compare(fileExtension(a.mapFilePath), fileExtension(b.mapFilePath));
  }
  if (a.type === 'encounters' && b.type === 'encounters') {
    const rank = (asset: EncounterAsset): number => (asset.difficulty ? DIFFICULTY_RANK[asset.difficulty] : UNRANKED);
    return rank(a) - rank(b);
  }
  return 0;
};

// The id settles equal names, so the order never depends on the order assets were loaded in.
const compareNames: AssetComparator = (a, b) =>
  nameCollator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const PRIMARY_COMPARATORS: Record<Exclude<SortOption, 'rating'>, AssetComparator> = {
  name: () => 0,
  date: (a, b) => a.modifiedAt - b.modifiedAt,
  type: compareKinds,
};

/** The rating of an asset's statblock, or null for assets without one. */
export type RatingOf = (asset: AnyAsset) => CreatureRating | null;

/**
 * By rating, grouped by scale (challenge rating, then level, then tier), with
 * the order applying within each scale. Assets without a rating come last in
 * either order, by name.
 */
function sortByRating(assets: readonly AnyAsset[], order: SortOrder, ratingOf: RatingOf): AnyAsset[] {
  const direction = order === 'asc' ? 1 : -1;
  const rated = assets.flatMap((asset) => {
    const rating = ratingOf(asset);
    return rating ? [{ asset, rating }] : [];
  });
  rated.sort((a, b) => a.rating.scale - b.rating.scale
    || direction * (a.rating.value - b.rating.value)
    || compareNames(a.asset, b.asset));
  const unrated = assets.filter((asset) => !ratingOf(asset)).sort(compareNames);
  return [...rated.map(({ asset }) => asset), ...unrated];
}

/** A sorted copy of `assets`; ties fall back to the name. Descending reverses the whole order, except by rating. */
export function sortAssets(assets: readonly AnyAsset[], sortBy: SortOption, order: SortOrder, ratingOf: RatingOf = () => null): AnyAsset[] {
  if (sortBy === 'rating') return sortByRating(assets, order, ratingOf);
  const primary = PRIMARY_COMPARATORS[sortBy];
  const direction = order === 'asc' ? 1 : -1;
  return [...assets].sort((a, b) => direction * (primary(a, b) || compareNames(a, b)));
}
