import type { AssetMetadata, CollectionMetadata } from './AssetService';
import { collectionFolderPath } from './assetPaths';
import { uniqueCollectionName } from './collectionNaming';
import { mapStrings } from '../utils/mapStrings';
import { hashText } from '../utils/hashing';

/** The folder of the collection a new vault starts with. */
export const INITIAL_COLLECTION_ID = 'Default';

/** The id collections had before the default one could be renamed. */
const LEGACY_DEFAULT_ID = 'default';

/** `winter-camp` → `Winter Camp`: a readable name for an asset known only by its file name. */
export function prettifyIdentifier(identifier: string): string {
  const words = identifier.replace(/[-_]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return identifier;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/** `name`, or `name (2)`, `name (3)`, … while a collection other than `exceptId` uses it. */
export function numberedCollectionName(metadata: AssetMetadata | null, name: string, exceptId?: string): string {
  const taken = Object.values(metadata?.collections ?? {})
    .filter((collection) => collection.id !== exceptId)
    .map((collection) => collection.name);
  return uniqueCollectionName(name, taken);
}

/**
 * The collection new content goes to when none is chosen; it cannot be
 * deleted. It is recorded in the index and follows its folder when renamed;
 * older indexes mean the collection in `default`, and without either the
 * oldest collection takes the part.
 */
export function defaultCollectionIdOf(metadata: AssetMetadata | null): string {
  const collections = metadata?.collections ?? {};
  const recorded = metadata?.defaultCollectionId;
  if (recorded && collections[recorded]) return recorded;
  if (collections[LEGACY_DEFAULT_ID]) return LEGACY_DEFAULT_ID;
  const [oldest] = Object.values(collections).sort((a, b) => a.createdAt - b.createdAt);
  return oldest?.id ?? recorded ?? INITIAL_COLLECTION_ID;
}

/** A new record for the collection folder `id`; a collection is named like its folder. */
export function createCollectionRecord(id: string, now = Date.now()): CollectionMetadata {
  return {
    id,
    uid: crypto.randomUUID(),
    version: 1,
    name: id,
    description: `${id} collection`,
    tags: {},
    settings: { conditions: [] },
    createdAt: now,
    modifiedAt: now,
  };
}

/**
 * A record for a collection Atlas finds rather than the user makes: a folder
 * that appeared, the first collection of a new vault. Every device that finds
 * the folder works out the same record, so it needs no file until the user
 * changes it.
 */
export function derivedCollectionRecord(id: string): CollectionMetadata {
  return { ...createCollectionRecord(id, 0), uid: `collection-${hashText(String(id))}` };
}

/**
 * Moves a collection record to the folder `newId`: the record keeps its uid,
 * settings and default role, takes the folder name as its name, and every
 * stored path into the old folder follows.
 */
export function moveCollectionRecord(metadata: AssetMetadata, oldId: string, newId: string, now = Date.now()): void {
  const collection = metadata.collections[oldId];
  if (!collection) return;
  const wasDefault = defaultCollectionIdOf(metadata) === oldId;
  delete metadata.collections[oldId];
  metadata.collections[newId] = { ...collection, id: newId, name: newId, modifiedAt: now };
  if (wasDefault) metadata.defaultCollectionId = newId;

  const oldPrefix = `${collectionFolderPath(oldId)}/`;
  const newPrefix = `${collectionFolderPath(newId)}/`;
  const movePath = (text: string): string => (text.startsWith(oldPrefix) ? newPrefix + text.slice(oldPrefix.length) : text);
  for (const [id, asset] of Object.entries(metadata.assets)) {
    const moved = mapStrings(asset, movePath);
    metadata.assets[id] = asset.collection === oldId ? { ...moved, collection: newId } : moved;
  }
}

/**
 * Removes a collection and its assets from the index. Files outside its folder,
 * such as token images in the global assets folder, stay. When the default
 * collection goes, the oldest remaining one takes its part, or a new one when
 * none is left; the caller creates its folder.
 */
export function forgetCollection(metadata: AssetMetadata, id: string, now = Date.now()): void {
  const wasDefault = defaultCollectionIdOf(metadata) === id;
  for (const [assetId, asset] of Object.entries(metadata.assets)) {
    if (asset.collection === id) delete metadata.assets[assetId];
  }
  delete metadata.collections[id];
  if (!wasDefault) return;
  delete metadata.defaultCollectionId;
  if (Object.keys(metadata.collections).length === 0) metadata.collections[INITIAL_COLLECTION_ID] = derivedCollectionRecord(INITIAL_COLLECTION_ID);
  metadata.defaultCollectionId = defaultCollectionIdOf(metadata);
}
