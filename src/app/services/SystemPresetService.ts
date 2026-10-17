import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import { parseUserPreset, parseUserPresets } from '../gameSystems/presetValidation';
import type { SystemPreset, SystemRules } from '../types/systemPresetTypes';
import type { StoredPreset } from './systemPresets/presetFiles';
import type { RecordStorage } from './vaultRecords/recordFolder';
import { t } from '../i18n';
import { withDeadConditionSettings } from '../gameSystems/deadCondition';

/** Where the user's presets are kept: one vault file each (`SystemPresetFiles`), or memory in tests. */
export type PresetStorage = RecordStorage;

/**
 * The game system presets of this vault: the built-in ones plus those the user
 * saved, which live in vault files and can be applied to any collection.
 *
 * Edits change only the fields they own, so data a newer Atlas added to a
 * stored preset survives an older one editing it.
 */
export class SystemPresetService {
  constructor(private readonly storage: PresetStorage) {}

  /** Built-in presets first, then the user's in alphabetical order. */
  list(): SystemPreset[] {
    const userPresets = parseUserPresets(this.stored()).sort((a, b) => a.name.localeCompare(b.name));
    return [...BUILT_IN_SYSTEM_PRESETS, ...userPresets];
  }

  /** Why `name` cannot name a preset, or null when it can. `exceptId` is the preset being renamed. */
  nameError(name: string, exceptId?: string): string | null {
    const key = name.trim().toLowerCase();
    if (!key) return t('names.enter');
    const taken = this.list().some((preset) => preset.id !== exceptId && preset.name.toLowerCase() === key);
    return taken ? t('names.presetTaken') : null;
  }

  create(name: string, rules: SystemRules): SystemPreset {
    this.assertName(name);
    const preset: SystemPreset = { id: crypto.randomUUID(), name: name.trim(), builtIn: false, rules: withDeadConditionSettings(structuredClone(rules)) };
    this.storage.create({ ...preset });
    return preset;
  }

  update(id: string, rules: SystemRules): void {
    this.modify(id, (stored) => {
      const merged = { ...asRecord(stored.rules), ...withDeadConditionSettings(structuredClone(rules)) };
      // The rules hold no default vision, senses, light presets, initiative rules or statblock roles when the system sets none, so stored ones must not survive.
      if (!rules.defaultTokenVision) delete merged.defaultTokenVision;
      if (!rules.senses) delete merged.senses;
      if (!rules.lightPresets) delete merged.lightPresets;
      if (!rules.initiative) delete merged.initiative;
      if (!rules.statblockRoles) delete merged.statblockRoles;
      if (!rules.diceSetId) delete merged.diceSetId;
      return { ...stored, rules: merged };
    });
  }

  rename(id: string, name: string): void {
    this.assertName(name, id);
    this.modify(id, (stored) => ({ ...stored, name: name.trim() }));
  }

  /** Collections set from the preset keep their rules. */
  delete(id: string): void {
    if (this.stored().some((entry) => isEditable(entry, id))) this.storage.remove(id);
  }

  /** Calls `listener` whenever a preset is saved, renamed or deleted, here or on another device. */
  onChange(listener: () => void): () => void {
    return this.storage.onChange(listener);
  }

  private stored(): readonly StoredPreset[] {
    return this.storage.entries();
  }

  private modify(id: string, change: (stored: StoredPreset) => StoredPreset): void {
    if (!this.stored().some((entry) => isEditable(entry, id))) throw new Error(`No editable preset with id ${id}`);
    this.storage.update(id, change);
  }

  private assertName(name: string, exceptId?: string): void {
    const error = this.nameError(name, exceptId);
    if (error) throw new Error(error);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Whether `entry` is the usable user preset `id`. */
function isEditable(entry: unknown, id: string): entry is StoredPreset {
  return parseUserPreset(entry)?.id === id;
}
