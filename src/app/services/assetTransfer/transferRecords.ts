import type { Asset, TagMetadata } from '../AssetService';
import { remapPaths } from '../collectionBundle/pathRemap';
import { hasAssetTag, tagGroupOf, tagKey, type TagGroup } from '../tagGroups';
import { baseName } from '../../utils/pathUtils';
import type { TransferPlan } from './transferPlan';

export interface RecordContext {
  targetCollectionId: string;
  /** The id each copied asset gets; a moved asset keeps its own. */
  newIds: ReadonlyMap<string, string>;
  plan: TransferPlan;
  now: number;
}

const sceneName = (mapPath: string): string => baseName(mapPath).replace(/\.atlasmap$/, '');

/**
 * The record of `asset` as it is stored in the target collection: pointing at
 * its files there, with the new id and creation time of a copy. A scene named
 * after its map file takes the new file name when the map needed a free one.
 */
export function transferredRecord(asset: Asset, { targetCollectionId, newIds, plan, now }: RecordContext): Asset {
  const newId = newIds.get(asset.id);
  const record: Asset = {
    ...remapPaths(asset, plan.rewrites),
    id: newId ?? asset.id,
    collection: targetCollectionId,
    createdAt: newId ? now : asset.createdAt,
    modifiedAt: now,
  };
  if (record.type !== 'token' && record.type !== 'note') {
    const recordPath = plan.recordPaths.get(asset.id);
    // Without a file to carry over, the record gets a new one at the default place.
    if (recordPath) record.filePath = recordPath;
    else delete record.filePath;
  }
  if (record.type === 'scene' && asset.type === 'scene') {
    const from = asset.data?.mapPath;
    const to = record.data?.mapPath;
    if (from && to && from !== to && asset.name === sceneName(from)) record.name = sceneName(to);
  }
  return record;
}

/**
 * The tags of the source collection that `assets` carry and the target
 * collection does not register yet, with their colours and icons.
 */
export function tagsToRegister(
  assets: readonly Asset[],
  sourceTags: Readonly<Record<string, TagMetadata>>,
  targetTags: Readonly<Record<string, TagMetadata>>,
): Array<TagMetadata & { group: TagGroup }> {
  const needed = new Map<string, TagMetadata & { group: TagGroup }>();
  const registered = Object.values(sourceTags);
  for (const asset of assets) {
    const group = tagGroupOf(asset.type);
    if (!group) continue;
    for (const tag of registered) {
      const key = tagKey(group, tag.id);
      if (tag.group !== group || targetTags[key] || !hasAssetTag(asset.tags, tag)) continue;
      needed.set(key, { ...tag, group });
    }
  }
  return [...needed.values()];
}
