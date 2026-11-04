import type { StoredRecord } from '../services/recordFiles/recordLayout';
import type { CampaignSystem } from './campaignSystem';

/**
 * A campaign: a record of its own, in its own folder beside the collections and with nothing to
 * do with them. It may use any asset of any collection; it keeps what happened in it and what
 * belongs to its players.
 */
export interface Campaign {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** When it was made, and last played (milliseconds since the epoch). */
  readonly createdAt: number;
  readonly lastPlayed?: number;
  /** The time played in all its sessions, in milliseconds. */
  readonly playtime?: number;
  /** The world map: a map or scene of any collection, by asset id. */
  readonly worldMap?: string;
  /** The scene played last, by asset id. */
  readonly lastScene?: string;
  /** What the campaign used, by reference. */
  readonly used?: CampaignUsage;
  /** The game system every map plays by while the campaign is played; without one, each map's collection's. */
  readonly system?: CampaignSystem;
  /** Written by a newer Atlas: read, never changed here. */
  readonly readOnly?: true;
}

/** When a campaign first and last used something (milliseconds since the epoch). */
export interface UsedSpan {
  readonly first: number;
  readonly last: number;
}

/** What a campaign used: the scenes played in it, keyed by asset id. */
export interface CampaignUsage {
  readonly scenes: Readonly<Record<string, UsedSpan>>;
}

/** A campaign as its file holds it, with every field a newer Atlas may have added. */
export type StoredCampaign = StoredRecord;

/**
 * The fields a campaign's settings change; a field given as undefined is removed. `system` changes
 * the stored system field by field (`CampaignService.update`).
 */
export type CampaignChanges = Partial<Pick<Campaign, 'description' | 'worldMap'>> & {
  readonly system?: Partial<CampaignSystem> | undefined;
};
