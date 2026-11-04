/**
 * The statblock a ```statblock fence describes (§6.4), as Fantasy Statblocks
 * reads it: what Copy into a new statblock copies and moving a layout's
 * statblocks to Atlas writes into the fence's own note.
 */

import type { App } from 'obsidian';
import { resolveCreatureFromFence } from '../../services/FantasyStatblocksService';
import { decodeStatblockLinks } from '../../services/statblockLinks';
import { noteName } from '../../utils/pathUtils';
import { jsonRecordCopy } from '../format/jsonValues';
import { isReservedKey } from '../model/reservedKeys';
import type { FieldValue } from '../model/templateTypes';

/** What a fence's statblock holds: its name, the values a native note keeps, and the layout Fantasy Statblocks draws it with. */
export interface FenceValues {
  name: string;
  values: Record<string, FieldValue>;
  /** The fence's `layout:`, else the creature's; null where neither names one (the plugin's default draws it). */
  layout: string | null;
}

/** A layout's name as a fence or creature gives it; null where it gives none. */
export function layoutName(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** A value with Fantasy Statblocks' encoded links written as the links they stand for, as the plugin does. */
export function withPlainLinks(value: FieldValue): FieldValue {
  if (typeof value === 'string') return decodeStatblockLinks(value);
  if (Array.isArray(value)) return value.map(withPlainLinks);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, withPlainLinks(inner)]));
  }
  return value;
}

/**
 * The statblock a fence's params describe, as Fantasy Statblocks reads it
 * while it is loaded (a named creature, the linked note, the fence's own
 * values on top), else the fence's own values. Markers and Fantasy
 * Statblocks' own keys are left out.
 */
export async function fenceStatblock(app: App, params: Record<string, unknown>, path: string): Promise<FenceValues> {
  const creature = jsonRecordCopy((await resolveCreatureFromFence(app, params, path)) ?? params) ?? {};
  const named = creature.name;
  const values: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(creature)) {
    if (key !== 'name' && !isReservedKey(key)) values[key] = withPlainLinks(value);
  }
  return {
    name: typeof named === 'string' && named.trim() ? named.trim() : noteName(path),
    values,
    layout: layoutName(params.layout) ?? layoutName(creature.layout),
  };
}
