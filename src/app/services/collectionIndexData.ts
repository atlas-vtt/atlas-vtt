/**
 * What a collection keeps in the asset index alone, never in its `collection.json`, a bundle, an
 * export or a copy: the data extensions keep on it (`collections.setData`). It lives beside the
 * collection records (`AssetMetadata.collectionIndexData`, by collection id), so the library files,
 * their reading and merging, and the bundles never see it. A rename moves it with the record
 * (`moveCollectionRecord`), a deleted collection takes it along, and a copied folder is a new
 * collection without it. Like extension data on scenes, it stays on the device that wrote it. The
 * collection's dice look (`diceLookId`) lives here too: an extension chooses it, by the same rules.
 */
import type { Json } from '../types/json';
import type { AssetMetadata } from './AssetService';

export interface CollectionIndexData {
  /** By extension id. */
  extensions?: Record<string, Json>;
  /** The dice look this collection's maps throw in (`dice.useLook`): a full look id, `''` for Atlas's own; unset follows the GM's. */
  diceLookId?: string;
}

/** The index-only data of collection `id`; null when it has none or the collection is gone. */
export function collectionIndexDataOf(metadata: AssetMetadata, id: string): CollectionIndexData | null {
  if (!Object.hasOwn(metadata.collections, id)) return null;
  const data = metadata.collectionIndexData;
  return data && Object.hasOwn(data, id) ? data[id]! : null;
}

/** Sets (or, undefined, removes) the keys of `patch` on collection `id`'s index-only data; an empty record goes. */
export function patchCollectionIndexData(metadata: AssetMetadata, id: string, patch: { [K in keyof CollectionIndexData]?: CollectionIndexData[K] | undefined }): void {
  const current: Record<string, unknown> = { ...collectionIndexDataOf(metadata, id) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) Reflect.deleteProperty(current, key);
    else current[key] = value;
  }
  const all = { ...metadata.collectionIndexData };
  if (Object.keys(current).length > 0) Object.defineProperty(all, id, { value: current, enumerable: true, writable: true, configurable: true });
  else Reflect.deleteProperty(all, id);
  if (Object.keys(all).length > 0) metadata.collectionIndexData = all;
  else delete metadata.collectionIndexData;
}

/** Collection `oldId`'s index-only data now belongs to `newId` (its folder was renamed). */
export function moveCollectionIndexData(metadata: AssetMetadata, oldId: string, newId: string): void {
  const data = metadata.collectionIndexData;
  if (!data || !Object.hasOwn(data, oldId) || oldId === newId) return;
  const moved = data[oldId]!;
  Reflect.deleteProperty(data, oldId);
  Object.defineProperty(data, newId, { value: moved, enumerable: true, writable: true, configurable: true });
}

/** Collection `id` is gone: so is its index-only data, so a new collection of that name starts without it. */
export function forgetCollectionIndexData(metadata: AssetMetadata, id: string): void {
  const data = metadata.collectionIndexData;
  if (!data || !Object.hasOwn(data, id)) return;
  Reflect.deleteProperty(data, id);
  if (Object.keys(data).length === 0) delete metadata.collectionIndexData;
}
