import type { Asset, TagMetadata } from './AssetService';

/**
 * Tags are kept apart by what they describe: `tokens` covers tokens and the
 * encounters built from them, `maps` covers maps and the scenes built on them.
 */
export const TAG_GROUPS = ['tokens', 'maps'] as const;
export type TagGroup = (typeof TAG_GROUPS)[number];

/** The tag group of a stored asset type; types the asset manager does not tag have none. */
export function tagGroupOf(type: Asset['type']): TagGroup | null {
  switch (type) {
    case 'token':
    case 'encounter':
    case 'player':
      return 'tokens';
    case 'map':
    case 'scene':
      return 'maps';
    default:
      return null;
  }
}

/** Key of a tag in `CollectionMetadata.tags`: an id is unique only within its group. */
export function tagKey(group: TagGroup, id: string): string {
  return `${group}:${id}`;
}

/** Creators store tag names; older asset-manager assignments can store IDs. */
export function hasAssetTag(assignedTags: readonly string[] | undefined, tag: Pick<TagMetadata, 'id' | 'name'>): boolean {
  return assignedTags?.some((value) => value === tag.id || value === tag.name) ?? false;
}

/**
 * Moves tags saved before tag groups existed into the groups whose assets carry
 * them. A tag no asset carries goes to both groups, so no tag is lost. Returns
 * null when every tag already sits under its group key.
 */
export function groupLegacyTags(
  tags: Readonly<Record<string, TagMetadata>>,
  collectionAssets: readonly Asset[],
): Record<string, TagMetadata> | null {
  let changed = false;
  const grouped: Record<string, TagMetadata> = {};
  for (const [key, tag] of Object.entries(tags)) {
    if (tag.group && key === tagKey(tag.group, tag.id)) {
      grouped[key] = tag;
      continue;
    }
    changed = true;
    for (const group of tag.group ? [tag.group] : groupsCarrying(tag, collectionAssets)) {
      grouped[tagKey(group, tag.id)] ??= { ...tag, group };
    }
  }
  return changed ? grouped : null;
}

function groupsCarrying(tag: TagMetadata, assets: readonly Asset[]): TagGroup[] {
  const groups = TAG_GROUPS.filter((group) =>
    assets.some((asset) => tagGroupOf(asset.type) === group && hasAssetTag(asset.tags, tag)));
  return groups.length > 0 ? groups : [...TAG_GROUPS];
}
