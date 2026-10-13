import type { Asset, CollectionMetadata } from '../AssetService';
import { comparableSettings } from './bundleSettings';
import { hashJson } from '../../utils/hashing';
import type { CollectionField } from './installRecord';

/** Bookkeeping Atlas changes on its own; a change there is not an edit. */
const VOLATILE_ASSET_FIELDS: ReadonlySet<string> = new Set(['createdAt', 'modifiedAt', 'collection', 'thumbnailPath']);

/** Fingerprint of an asset record by what the user or the author can change. */
export function assetFingerprint(asset: Asset): Promise<string> {
  return hashJson(Object.fromEntries(Object.entries(asset).filter(([key]) => !VOLATILE_ASSET_FIELDS.has(key))));
}

/** Fingerprint of one collection record field; a missing field hashes like null. */
export function fieldFingerprint(collection: CollectionMetadata, field: CollectionField): Promise<string> {
  return hashJson((field === 'settings' ? comparableSettings(collection.settings) : collection[field]) ?? null);
}
