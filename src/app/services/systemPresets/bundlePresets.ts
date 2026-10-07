/**
 * The user's game system presets in collection bundles: a collection that names a user preset
 * carries its file, and an import matches it by preset id, never by path. Pure.
 *
 * - A preset the vault lacks comes in under its own id.
 * - The same preset (by content) is reused.
 * - One the vault holds as the last import left it is updated in place, silently.
 * - One the vault changed is never overwritten: the bundle's version comes in as a copy with a
 *   new id and name, and the imported collection points at the copy.
 */

import { parseUserPreset } from '../../gameSystems/presetValidation';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { hashJson } from '../../utils/hashing';
import type { InstalledPreset } from '../collectionBundle/installRecord';
import type { StoredPreset } from './presetFiles';

/** A preset as a bundle carries it, read and fingerprinted. */
export interface PackedPreset {
  /** Its file's path in the bundle. */
  path: string;
  entry: StoredPreset;
  fingerprint: string;
}

/** A preset of the vault, by the id it holds. */
export interface VaultPreset {
  id: string;
  path: string;
  name: string;
  fingerprint: string;
}

/**
 * - `new`: written under its id (the bundle's, or the copy a previous import made, which was deleted).
 * - `reuse`: the vault has the same preset.
 * - `keep`: the bundle's version is the one installed last time, and the vault changed it since.
 * - `update`: the vault holds it as installed last time; the bundle's version replaces it.
 * - `copy`: the vault's own differs; the bundle's version comes in beside it with a new id.
 */
export type PresetOutcome = 'new' | 'reuse' | 'keep' | 'update' | 'copy';

export interface PlannedPreset {
  bundleId: string;
  name: string;
  /** Its id in this vault after the import. */
  localId: string;
  /** Where its file is, or will be, in this vault. */
  target: string;
  outcome: PresetOutcome;
  /** Fingerprint of the vault's preset the decision read; null when the vault had none. */
  mine: string | null;
  theirs: string;
  /** The preset as the import writes it; unset for the presets it leaves alone. */
  entry?: StoredPreset | undefined;
}

export interface PresetPlanRules {
  /** A free path for a preset file of this name; each path given out is taken. */
  place(name: unknown): string;
  /** A name for a copy of the preset that no preset of the vault has. */
  copyName(name: string): string;
  newId(): string;
}

type InstalledPresets = Readonly<Record<string, InstalledPreset>> | undefined;

/** Fingerprint of a preset without its id and file format, so a copy under another id is the same preset. */
export function presetFingerprint(entry: Readonly<Record<string, unknown>>): Promise<string> {
  const { id: _id, format: _format, ...content } = entry;
  return hashJson(content);
}

const nameOf = (entry: StoredPreset): string => (typeof entry.name === 'string' ? entry.name : '');

/** What the install record says of a bundle preset, when it is sound. */
function installedOf(installed: InstalledPresets, bundleId: string): InstalledPreset | undefined {
  const entry = installed && Object.hasOwn(installed, bundleId) ? installed[bundleId] : undefined;
  return entry && typeof entry.localId === 'string' && entry.localId !== '' ? entry : undefined;
}

/** Decides what becomes of each preset the bundle carries. */
export function planPresets(
  bundle: readonly PackedPreset[],
  vault: ReadonlyMap<string, VaultPreset>,
  installed: InstalledPresets,
  rules: PresetPlanRules,
): PlannedPreset[] {
  // Preset names are unique in a vault, in any letter case.
  const nameTaken = (name: string, exceptId: string): boolean =>
    [...vault.values()].some((preset) => preset.id !== exceptId && preset.name.toLowerCase() === name.toLowerCase());
  return bundle.map(({ entry, fingerprint }): PlannedPreset => {
    const name = nameOf(entry);
    const base = { bundleId: entry.id, name, theirs: fingerprint };
    const record = installedOf(installed, entry.id);
    const installedHere = record ? vault.get(record.localId) : undefined;
    // An installed copy that is gone leaves the bundle's id to compare by.
    const local = installedHere ?? vault.get(entry.id);
    if (!local) {
      const localId = record?.localId ?? entry.id;
      const localName = nameTaken(name, localId) ? rules.copyName(name) : name;
      return { ...base, name: localName, localId, target: rules.place(localName), outcome: 'new', mine: null, entry: { ...entry, id: localId, name: localName } };
    }
    const found = { ...base, localId: local.id, target: local.path, mine: local.fingerprint };
    if (local.fingerprint === fingerprint) return { ...found, outcome: 'reuse' };
    if (installedHere && record?.source === fingerprint) return { ...found, outcome: 'keep' };
    if (installedHere && record?.installed === local.fingerprint) {
      const localName = nameTaken(name, local.id) ? local.name : name;
      return { ...found, name: localName, outcome: 'update', entry: { ...entry, id: local.id, name: localName } };
    }
    const copyName = rules.copyName(name);
    const copy = { ...entry, id: rules.newId(), name: copyName };
    return { ...base, name: copyName, localId: copy.id, target: rules.place(copyName), outcome: 'copy', mine: null, entry: copy };
  });
}

/** Bundle preset id → the id the preset has here, where the two differ. */
export function presetIdMap(planned: readonly PlannedPreset[]): ReadonlyMap<string, string> {
  return new Map(planned.flatMap((preset): Array<[string, string]> => (preset.localId === preset.bundleId ? [] : [[preset.bundleId, preset.localId]])));
}

/**
 * What the install record keeps of each preset: a kept one its earlier entry, the others the
 * bundle's version as source and what the import left in the vault (a new name, perhaps) as installed.
 */
export async function installedPresets(planned: readonly PlannedPreset[], previous: InstalledPresets): Promise<Record<string, InstalledPreset>> {
  const entries: Array<[string, InstalledPreset]> = [];
  for (const preset of planned) {
    const earlier = preset.outcome === 'keep' ? installedOf(previous, preset.bundleId) : undefined;
    const installed = preset.entry ? await presetFingerprint(preset.entry) : preset.theirs;
    entries.push([preset.bundleId, earlier ?? { localId: preset.localId, source: preset.theirs, installed }]);
  }
  return Object.fromEntries(entries);
}

/** The vault's presets as the import leaves them, so settings are compared with the presets they will be read with. */
export function presetsAfterImport(vault: readonly SystemPreset[], planned: readonly PlannedPreset[]): SystemPreset[] {
  const written = new Map(planned.flatMap((preset): Array<[string, SystemPreset]> => {
    const parsed = preset.entry ? parseUserPreset(preset.entry) : null;
    return parsed ? [[parsed.id, parsed]] : [];
  }));
  return [...vault.filter((preset) => !written.has(preset.id)), ...written.values()];
}
