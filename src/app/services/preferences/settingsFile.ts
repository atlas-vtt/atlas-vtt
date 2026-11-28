import { overDefault } from '../atlasSettings';
import { PREFERENCES } from './preferences';
import { sameValue, type AnyPreferenceRow, type PreferenceRow, type StoredChange, type StoredEntries } from './preferenceRow';

/** Keys that are no preferences and never go into the plugin's data: the input mode is the device's, the game system presets are vault files. */
const NOT_PREFERENCES = ['navigation', 'systemPresets'];

const ROWS: readonly AnyPreferenceRow[] = Object.values(PREFERENCES);

/** The file's record as the settings keep it: without the keys that are no preferences, the values other devices write checked. */
export function asLoaded(loaded: Record<string, unknown>): Record<string, unknown> {
  const stored = Object.fromEntries(Object.entries(loaded).filter(([key]) => !NOT_PREFERENCES.includes(key)));
  for (const row of ROWS) {
    if (!row.onLoad) continue;
    for (const key of row.keys.filter((name) => name in stored)) {
      const checked = row.onLoad(stored[key]);
      if (checked === undefined) delete stored[key];
      else stored[key] = checked;
    }
  }
  return stored;
}

/**
 * What a change made here and not saved yet keeps when another device's file arrives: each key
 * whose value here differs from the one last saved, both merged over the key's default, so a key
 * the file lacks equals its default. A row that keeps another version's entries inside its value
 * (`rebasesOnArrival`) stores this device's value over what arrived, so the arrived entries stay.
 */
export function keptOnArrival(local: Record<string, unknown>, saved: Record<string, unknown>, arrived: StoredEntries): StoredChange {
  const changed = [...new Set([...Object.keys(local), ...Object.keys(saved)])].filter((key) => !sameValue(overDefault(key, local[key]), overDefault(key, saved[key])));
  const kept: Record<string, unknown> = Object.fromEntries(changed.map((key) => [key, local[key]]));
  for (const row of ROWS) {
    if (!row.rebasesOnArrival || !row.keys.some((key) => key in kept)) continue;
    const rebased = row as PreferenceRow<unknown, unknown>;
    Object.assign(kept, rebased.write(rebased.read((key) => local[key]), arrived));
  }
  return kept;
}
