import type { Asset, CollectionMetadata } from '../AssetService';
import { BUILT_IN_SYSTEM_PRESETS } from '../../gameSystems/builtInPresets';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { comparableSettings } from './bundleSettings';
import { hashJson } from '../../utils/hashing';
import type { CollectionField } from './installRecord';

/** Bookkeeping Atlas changes on its own; a change there is not an edit. */
const VOLATILE_ASSET_FIELDS: ReadonlySet<string> = new Set(['createdAt', 'modifiedAt', 'collection', 'thumbnailPath']);

/** Fingerprint of an asset record by what the user or the author can change. */
export function assetFingerprint(asset: Asset): Promise<string> {
  return hashJson(Object.fromEntries(Object.entries(asset).filter(([key]) => !VOLATILE_ASSET_FIELDS.has(key))));
}

/**
 * Fingerprint of one collection record field; a missing field hashes like null. Settings are
 * compared as `comparableSettings` reads them with the vault's presets (`systemPresetsOf`), so
 * roles a bundle wrote out of a preset this vault has count as the preset's.
 */
export function fieldFingerprint(collection: CollectionMetadata, field: CollectionField, presets: readonly SystemPreset[] = BUILT_IN_SYSTEM_PRESETS): Promise<string> {
  return hashJson((field === 'settings' ? comparableSettings(collection.settings, presets) : collection[field]) ?? null);
}

/**
 * Fingerprint of a statblock template's JSON without its id, so a copy under another id is the
 * same template, together with the note beside it (`body`) where it has one with text: the two
 * travel, update and diverge as one.
 */
export function templateFingerprint(json: Readonly<Record<string, unknown>>, body: string | null = null): Promise<string> {
  const { id: _id, ...content } = json;
  return hashJson(body ? { template: content, body } : content);
}
