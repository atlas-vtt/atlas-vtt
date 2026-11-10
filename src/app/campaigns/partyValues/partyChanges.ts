import { readPartyKey, samePartyValue, type PartyValue, type PartyValues } from './partyKeys';

/** Changed values by party key: the new value, or undefined where it is gone. */
export type PartyChangeMap = Map<string, PartyValue | undefined>;

/** What differs between two sets of values, among the values of `campaignId` alone. */
export function changesBetween(known: PartyValues, next: PartyValues, campaignId: string): PartyChangeMap {
  const changes: PartyChangeMap = new Map();
  if (known === next) return changes;
  for (const key of new Set([...Object.keys(known), ...Object.keys(next)])) {
    if (samePartyValue(known[key], next[key]) || readPartyKey(key)?.campaignId !== campaignId) continue;
    changes.set(key, next[key]);
  }
  return changes;
}

/** `values` with `changes` made; the same object when they change nothing. */
export function withChanges(values: PartyValues, changes: ReadonlyMap<string, PartyValue | undefined>): PartyValues {
  let next: Record<string, PartyValue> | null = null;
  for (const [key, value] of changes) {
    if (samePartyValue(values[key], value)) continue;
    next ??= { ...values };
    if (value) next[key] = value;
    else delete next[key];
  }
  return next ?? values;
}

/** Only the values of `campaignId`. */
export function valuesOfCampaign(values: PartyValues, campaignId: string): PartyValues {
  return Object.fromEntries(Object.entries(values).filter(([key]) => readPartyKey(key)?.campaignId === campaignId));
}
