/**
 * The user's game system presets in collection bundles. A collection that names a user preset
 * carries its file, and an import matches it by preset id like every library record
 * (`vaultRecords/bundleRecords.ts`). Pure.
 */

import { parseUserPreset } from '../../gameSystems/presetValidation';
import type { SystemPreset } from '../../types/systemPresetTypes';
import type { PlannedRecord } from '../vaultRecords/bundleRecords';

/** The vault's presets as the import leaves them, so settings are compared with the presets they will be read with. */
export function presetsAfterImport(vault: readonly SystemPreset[], planned: readonly PlannedRecord[]): SystemPreset[] {
  const written = new Map(planned.flatMap((preset): Array<[string, SystemPreset]> => {
    const parsed = preset.entry ? parseUserPreset(preset.entry) : null;
    return parsed ? [[parsed.id, parsed]] : [];
  }));
  return [...vault.filter((preset) => !written.has(preset.id)), ...written.values()];
}
