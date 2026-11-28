import { DEVICE_PREFERENCES } from '../deviceSettings';
import { COMBINED_PREFERENCES } from './combinedPreferences';
import type { AnyPreferenceRow, PreferenceChangeOf, PreferenceValueOf } from './preferenceRow';
import { SYNCED_PREFERENCES } from './syncedPreferences';

const { inputMode, animateMaps, playerView4k, selectionBar, gmFogOpacity, tableTvDevice } = DEVICE_PREFERENCES;

/**
 * Every preference the settings service reads and writes, by name: each declares its store, its
 * keys, how it reads and what a change stores (`PreferenceRow`). A change of any of them tells the
 * service's listeners. The device facts nothing listens for are read and written where they are
 * used (`readDevice`, `writeDevice`).
 */
export const PREFERENCES = {
  ...SYNCED_PREFERENCES,
  ...COMBINED_PREFERENCES,
  inputMode,
  animateMaps,
  playerView4k,
  selectionBar,
  gmFogOpacity,
  tableTvDevice,
} satisfies Record<string, AnyPreferenceRow>;

export type PreferenceName = keyof typeof PREFERENCES;
/** `T` with every field and list read-only, at any depth. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends ReadonlyArray<infer Item>
    ? ReadonlyArray<DeepReadonly<Item>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/**
 * What a preference reads as. Read-only: every reader is handed the same value until the
 * preference changes, so a write into it would change what all of them see.
 */
export type Preference<N extends PreferenceName> = DeepReadonly<PreferenceValueOf<(typeof PREFERENCES)[N]>>;
/** What a preference takes as a change: the whole value, or the fields to change of one kept as a record. */
export type PreferenceChange<N extends PreferenceName> = DeepReadonly<PreferenceChangeOf<(typeof PREFERENCES)[N]>>;
