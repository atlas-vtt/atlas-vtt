import { isFiniteNumber, isRecord, isStringArray } from '../utils/guards';
import type { LootDraw, LootProperty } from './lootRoller';

/** One press of the Roll button: the items it drew, when and on which map. */
export interface LootRoll {
  id: string;
  /** Unix time in milliseconds. */
  rolledAt: number;
  /** Name of the map the roll was made on. */
  mapName: string;
  draws: LootDraw[];
}

/** Rolls kept per collection, newest first. */
export const LOOT_HISTORY_LIMIT = 100;

function isLootProperty(value: unknown): value is LootProperty {
  return isRecord(value) && typeof value.label === 'string' && typeof value.value === 'string';
}

function isLootDraw(value: unknown): value is LootDraw {
  if (!isRecord(value)) return false;
  const { id, notePath, source, name, price, description, type, rarity, properties } = value;
  return typeof id === 'string'
    && typeof notePath === 'string'
    && isStringArray(source)
    && typeof name === 'string'
    && (price === undefined || typeof price === 'string')
    && (description === undefined || typeof description === 'string')
    && (type === undefined || typeof type === 'string')
    && (rarity === undefined || typeof rarity === 'string')
    && Array.isArray(properties) && properties.every(isLootProperty);
}

/** A saved roll, or null when the data is not one; its broken items are dropped. */
export function readLootRoll(value: unknown): LootRoll | null {
  if (!isRecord(value)) return null;
  const { id, rolledAt, mapName, draws } = value;
  if (typeof id !== 'string' || !isFiniteNumber(rolledAt) || typeof mapName !== 'string' || !Array.isArray(draws)) return null;
  const valid = draws.filter(isLootDraw);
  if (valid.length === 0) return null;
  return { id, rolledAt, mapName, draws: valid };
}

/** The rolls of a collection's history file, which arrives unchecked. */
export function readLootHistory(value: unknown): LootRoll[] {
  const rolls = isRecord(value) ? value.rolls : undefined;
  if (!Array.isArray(rolls)) return [];
  return rolls.flatMap((roll) => readLootRoll(roll) ?? []).slice(0, LOOT_HISTORY_LIMIT);
}
