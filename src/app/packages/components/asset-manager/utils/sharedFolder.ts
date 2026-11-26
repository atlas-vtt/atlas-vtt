import type { AnyAsset } from '../types';

/**
 * The folder every asset of `ids` lies in (null: the tab's top level), or undefined where they lie in different
 * folders or none of them is listed: the Move dialog marks that folder as the current one.
 */
export function sharedFolderOf(assets: readonly AnyAsset[], ids: readonly string[]): string | null | undefined {
  const wanted = new Set(ids);
  const folders = new Set(assets.filter((asset) => wanted.has(asset.id)).map((asset) => asset.folderId ?? null));
  return folders.size === 1 ? folders.values().next().value : undefined;
}
