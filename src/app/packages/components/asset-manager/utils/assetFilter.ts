import { hasAssetTag } from '../../../../services/tagGroups';
import type { AnyAsset, Folder, Tab, Tag } from '../types';
import { assetTypeOfTab } from './tabKinds';

export interface AssetFilter {
  tab: Tab;
  /** The open folder; null at the tab's root. */
  folderId: string | null;
  /** Text the asset's name must contain. */
  search: string;
  /** Tags an asset must all carry. */
  tags: readonly Pick<Tag, 'id' | 'name'>[];
  /** Other filters narrow the list (creature filters), so it searches every folder of the tab as well. */
  narrowed?: boolean;
}

/**
 * The assets the content area shows. Unfiltered, those directly in the open
 * folder. While a search, tag or other filter narrows the list, the matches in
 * every folder of the tab, wherever the GM stands: a tag's count in the sidebar
 * is what picking it shows (`matchingAssets`), as in Finder or Eagle.
 */
export function filterAssets(assets: readonly AnyAsset[], filter: AssetFilter): AnyAsset[] {
  const filtering = isFiltering(filter);
  const searchLower = filter.search.trim().toLowerCase();
  return assets.filter((asset) =>
    asset.type === assetTypeOfTab(filter.tab)
    && (filtering || asset.folderId === filter.folderId)
    && (!searchLower || asset.name.toLowerCase().includes(searchLower))
    && filter.tags.every((tag) => hasAssetTag(asset.tags, tag)),
  );
}

/** The assets of the tab a search, tags or other filters would show, in every folder: what tag counts are taken from. */
export function matchingAssets(assets: readonly AnyAsset[], filter: AssetFilter): AnyAsset[] {
  return filterAssets(assets, { ...filter, narrowed: true });
}

/** The subfolders the content area shows: none while filtering, since their matching assets are listed directly. */
export function filterFolders(folders: readonly Folder[], filter: AssetFilter): Folder[] {
  if (isFiltering(filter)) return [];
  return folders.filter((folder) => folder.type === filter.tab && folder.parentId === filter.folderId);
}

/** Whether a search, tags or other filters narrow the list. */
export function isFiltering(filter: AssetFilter): boolean {
  return filter.search.trim() !== '' || filter.tags.length > 0 || filter.narrowed === true;
}
