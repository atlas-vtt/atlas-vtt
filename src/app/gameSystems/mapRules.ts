/**
 * Where the game system rules of a map come from: the campaign being played when it has a system
 * of its own, else the collection that holds the map. Pure; the app's lookup is
 * `services/mapRules.ts`.
 */

import type { CollectionSettings, ConditionDefinition } from '../types/collectionSettingsTypes';
import type { SystemSettings } from './systemRules';

/** The game system part of a collection's settings, which a campaign's system holds too. */
export type RulesSettings = Pick<CollectionSettings, keyof SystemSettings>;

/** The part of the asset service that tells a map's collection and its settings. */
export interface CollectionLookup {
  getCollectionForMap(mapPath: string): string | null;
  getCollectionSettings(collectionId: string): CollectionSettings;
}

/** How `AssetService.getCollectionForMap` recognises a map that lies in a collection's folder. */
export const COLLECTION_FOLDER = /collections\/[^/]+\//;

/** The system of the campaign this device plays. */
export interface PlayedSystem {
  readonly campaignId: string;
  readonly settings: RulesSettings;
}

/** Where a map's rules are looked up: its collection, and the system of the campaign being played. */
export interface RulesLookup extends CollectionLookup {
  /** The played campaign's system; null while none is played or it has none. */
  playedSystem(): PlayedSystem | null;
}

/**
 * Whose rules a map plays by. `none` is a map outside every collection (`outsideCollections`, also
 * no map at all) or one in a collection the index does not know yet.
 */
export type RulesSource =
  | { readonly kind: 'campaign'; readonly id: string }
  | { readonly kind: 'collection'; readonly id: string }
  | { readonly kind: 'none'; readonly outsideCollections: boolean };

export interface MapRules {
  readonly source: RulesSource;
  /** The rules' settings; null for a map without a source. */
  readonly settings: RulesSettings | null;
}

/**
 * The rules of the map at `mapPath`: the played campaign's system wins for every map, in a
 * collection, outside them all or in one the index does not know yet; without one, the
 * collection's settings.
 */
export function rulesForMap(lookup: RulesLookup, mapPath: string | null | undefined): MapRules {
  const played = lookup.playedSystem();
  if (played) return { source: { kind: 'campaign', id: played.campaignId }, settings: played.settings };
  const collectionId = mapPath ? lookup.getCollectionForMap(mapPath) : null;
  if (collectionId) return { source: { kind: 'collection', id: collectionId }, settings: lookup.getCollectionSettings(collectionId) };
  return { source: { kind: 'none', outsideCollections: !mapPath || !COLLECTION_FOLDER.test(mapPath) }, settings: null };
}

/** The conditions tokens on the map at `mapPath` may carry: those of its rules, none without a source. */
export function mapConditions(lookup: RulesLookup, mapPath: string | null | undefined): ConditionDefinition[] {
  return rulesForMap(lookup, mapPath).settings?.conditions ?? [];
}
