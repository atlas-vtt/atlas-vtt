/**
 * The values a campaign keeps of its player characters, one per character and resource: every
 * number a character's tokens hold in `resources` (the collection's resources and the statblock's
 * further quantities). Keys are built and read here alone.
 */

import type { PartyKey, PartyValue } from '../../types/partyTypes';

export type { PartyKey, PartyValue, PartyValues } from '../../types/partyTypes';

/** What a party key names. */
export interface PartyKeyParts {
  readonly campaignId: string;
  readonly characterId: string;
  readonly resourceKey: string;
}

export function partyKey(campaignId: string, characterId: string, resourceKey: string): PartyKey {
  return JSON.stringify([campaignId, characterId, resourceKey]);
}

/** What `key` names, or null for a key that is no party key. */
export function readPartyKey(key: string): PartyKeyParts | null {
  let parts: unknown;
  try {
    parts = JSON.parse(key);
  } catch {
    return null;
  }
  if (!Array.isArray(parts) || parts.length !== 3 || !parts.every((part) => typeof part === 'string')) return null;
  const [campaignId, characterId, resourceKey] = parts as [string, string, string];
  return { campaignId, characterId, resourceKey };
}

/** Whether two values are the same. */
export function samePartyValue(a: PartyValue | undefined, b: PartyValue | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.current === b.current && a.max === b.max && a.maxByHand === b.maxByHand;
}

/** A value with a finite current and maximum, or null. */
export function readPartyValue(raw: unknown): PartyValue | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { current, max, maxByHand } = raw as Record<string, unknown>;
  if (typeof current !== 'number' || !Number.isFinite(current) || typeof max !== 'number' || !Number.isFinite(max)) return null;
  return { current, max, ...(maxByHand === true && { maxByHand: true as const }) };
}
