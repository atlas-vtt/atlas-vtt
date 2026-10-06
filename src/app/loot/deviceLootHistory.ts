import { isRecord, isStringArray } from '../utils/guards';
import { LOOT_HISTORY_LIMIT, readLootHistory, type LootRoll } from './lootHistory';

/** Layout of a loot history file; unchanged since rolls were kept in one file per collection. */
export const LOOT_HISTORY_FORMAT = 1;

/**
 * What one device's loot history file holds: the rolls made on that device,
 * newest first, and the rolls of other devices it removed, one by one or by
 * clearing the history. Removals name rolls, never a time, so the devices'
 * clocks never decide what stays.
 */
export interface DeviceLootHistory {
  rolls: readonly LootRoll[];
  /** Ids of other devices' rolls this device removed. */
  removed: readonly string[];
}

export const EMPTY_DEVICE_HISTORY: DeviceLootHistory = { rolls: [], removed: [] };

/** A device's history file, which arrives unchecked. */
export function readDeviceLootHistory(value: unknown): DeviceLootHistory {
  if (!isRecord(value)) return EMPTY_DEVICE_HISTORY;
  return {
    rolls: readLootHistory(value),
    removed: isStringArray(value.removed) ? value.removed : [],
  };
}

export function serializeDeviceLootHistory({ rolls, removed }: DeviceLootHistory): string {
  return JSON.stringify({ format: LOOT_HISTORY_FORMAT, rolls, ...(removed.length > 0 ? { removed } : {}) });
}

/**
 * The collection's history as every device sees it: all devices' rolls, each
 * once, without those any device removed, newest first.
 */
export function mergeLootHistories(histories: readonly DeviceLootHistory[]): LootRoll[] {
  const removed = new Set(histories.flatMap((history) => history.removed));
  const byId = new Map<string, LootRoll>();
  for (const roll of histories.flatMap((history) => history.rolls)) {
    if (!removed.has(roll.id) && !byId.has(roll.id)) byId.set(roll.id, roll);
  }
  return [...byId.values()].sort((a, b) => b.rolledAt - a.rolledAt).slice(0, LOOT_HISTORY_LIMIT);
}

/** `own` after rolling `roll` on this device. */
export const withRoll = (own: DeviceLootHistory, roll: LootRoll): DeviceLootHistory =>
  ({ ...own, rolls: [roll, ...own.rolls.filter((entry) => entry.id !== roll.id)].slice(0, LOOT_HISTORY_LIMIT) });

/** `own` after removing the roll `rollId`: from its own rolls, or marked removed when another device made it. */
export function withoutRoll(own: DeviceLootHistory, others: readonly DeviceLootHistory[], rollId: string): DeviceLootHistory {
  const elsewhere = others.some((history) => history.rolls.some((roll) => roll.id === rollId));
  return {
    ...own,
    rolls: own.rolls.filter((roll) => roll.id !== rollId),
    removed: elsewhere && !own.removed.includes(rollId) ? [...own.removed, rollId] : own.removed,
  };
}

/** `own` after clearing the whole history: its own rolls go, and every roll other devices hold now is marked removed. */
export const clearedHistory = (others: readonly DeviceLootHistory[]): DeviceLootHistory =>
  ({ rolls: [], removed: [...new Set(others.flatMap((history) => history.rolls.map((roll) => roll.id)))] });

/** `own` without removal marks for rolls no other device holds any more, so the file does not grow forever. */
export function prunedHistory(own: DeviceLootHistory, others: readonly DeviceLootHistory[]): DeviceLootHistory {
  const held = new Set(others.flatMap((history) => history.rolls.map((roll) => roll.id)));
  const removed = own.removed.filter((id) => held.has(id));
  return removed.length === own.removed.length ? own : { ...own, removed };
}

/** Rolls of an earlier version's single history file, taken into this device's own. */
export function withLegacyRolls(own: DeviceLootHistory, legacy: readonly LootRoll[]): DeviceLootHistory {
  const known = new Set(own.rolls.map((roll) => roll.id));
  const rolls = [...own.rolls, ...legacy.filter((roll) => !known.has(roll.id))]
    .sort((a, b) => b.rolledAt - a.rolledAt)
    .slice(0, LOOT_HISTORY_LIMIT);
  return { ...own, rolls };
}
