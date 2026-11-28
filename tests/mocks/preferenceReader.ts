import type { PreferenceName, SettingsService } from '../../src/app/services/SettingsService';

/**
 * A settings service's `get` for a fake service: each preference read from its function in `values`,
 * often only the fields the code under test reads. A preference not given reads as undefined.
 */
export function preferenceReader(values: Partial<Record<PreferenceName, () => unknown>>): SettingsService['get'] {
  return ((name: PreferenceName) => values[name]?.()) as SettingsService['get'];
}
