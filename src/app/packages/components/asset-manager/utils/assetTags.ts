import { hasAssetTag, type TagGroup } from '../../../../services/tagGroups';
import type { AnyAsset, Tab, Tag } from '../types';
import { isCharacterTab } from './tabKinds';

/** A collection's tags, one list per tag group. */
export type TagsByGroup = Record<TagGroup, Tag[]>;

/** Characters share tags with encounters, maps with scenes. */
export function tagGroupOfTab(tab: Tab): TagGroup {
  return isCharacterTab(tab) || tab === 'encounters' ? 'tokens' : 'maps';
}

/** An asset's tags with `tag` added (by name, as creators store it) or removed (by id or name). */
export function toggleAssetTag(assigned: readonly string[] | undefined, tag: Tag): string[] {
  const current = assigned ?? [];
  return hasAssetTag(current, tag)
    ? current.filter((value) => !hasAssetTag([value], tag))
    : [...current, tag.name];
}

/** The tags one asset is to hold after an edit. */
export interface AssetTagChange {
  asset: AnyAsset;
  tags: string[];
}

/**
 * What pressing `tag` does for a selection: it goes to the assets that lack it,
 * and only once all hold it, from all of them. Assets it does not change are left out.
 */
export function tagChangesForAssets(assets: readonly AnyAsset[], tag: Tag): AssetTagChange[] {
  const allHold = assets.every((asset) => hasAssetTag(asset.tags, tag));
  return assets
    .filter((asset) => hasAssetTag(asset.tags, tag) === allHold)
    .map((asset) => ({ asset, tags: toggleAssetTag(asset.tags, tag) }));
}

/** Tags whose name contains `query`, the `pinned` ones first, each part by name. */
export function tagPickerOptions(tags: readonly Tag[], pinned: ReadonlySet<string>, query: string): Tag[] {
  const needle = query.trim().toLowerCase();
  return tags
    .filter((tag) => tag.name.toLowerCase().includes(needle))
    .sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)) || a.name.localeCompare(b.name));
}
