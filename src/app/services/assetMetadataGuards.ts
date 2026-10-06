import { isRecord } from '../utils/guards';
import type { AssetMetadata, EncounterTokenRef } from './AssetService';

/** Pre-collections metadata: a flat token index without `assets` or `collections`. */
export interface LegacyAssetMetadata {
  tokens: Record<string, unknown>;
}

export interface LegacyTokenRecord {
  name: string;
  imagePath: string;
  tags?: unknown;
  createdAt?: unknown;
  modifiedAt?: unknown;
}

/**
 * Trust boundary for assets-metadata.json: checks the containers the service
 * walks into, not every asset field.
 */
export function isAssetMetadata(value: unknown): value is AssetMetadata {
  return isRecord(value)
    && isRecord(value.assets)
    && isRecord(value.collections)
    && typeof value.version === 'number';
}

export function isLegacyAssetMetadata(value: unknown): value is LegacyAssetMetadata {
  return isRecord(value) && isRecord(value.tokens) && !('assets' in value);
}

export function isLegacyTokenRecord(value: unknown): value is LegacyTokenRecord {
  return isRecord(value) && typeof value.name === 'string' && typeof value.imagePath === 'string';
}

function isGroupTokenRef(value: unknown): value is EncounterTokenRef {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.imagePath === 'string';
}

/** Token references of an encounter/player JSON payload; malformed entries are dropped. */
export function parseGroupTokenRefs(value: unknown): EncounterTokenRef[] {
  return Array.isArray(value) ? value.filter(isGroupTokenRef) : [];
}
