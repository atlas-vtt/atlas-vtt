import type { App } from 'obsidian';
import type { CollectionSettings } from '../../types/collectionSettingsTypes';
import { PRESET_FOLDER_SPEC } from '../systemPresets/presetFiles';
import { SystemPresetFiles } from '../systemPresets/SystemPresetFiles';
import type { StoredRecord } from '../vaultRecords/recordFolder';
import { PRESET_ROLE, type BundleFile } from './bundleFormat';
import { withRecordFiles, type BundledRecordKind } from './bundleRecordFiles';

/**
 * The user game system preset a collection's settings name travels with it, matched by its
 * preset id on import. A copy is named after the collection ("Homebrew (Fen)").
 */
export const PRESET_RECORDS: BundledRecordKind = {
  role: PRESET_ROLE,
  spec: PRESET_FOLDER_SPEC,
  files: (app) => SystemPresetFiles.forApp(app),
};

/**
 * `files` with the file of the user preset the collection's settings name, so a collection
 * travels with its game system. A built-in preset never travels: every Atlas has it.
 */
export function withSystemPresetFile(app: App, files: readonly BundleFile[], settings: CollectionSettings): BundleFile[] {
  const id = settings.systemPresetId;
  return id ? withRecordFiles(app, PRESET_RECORDS, files, [{ id }]) : [...files];
}

/** The dice set a carried preset's rules name, as the rules of a user preset hold it. */
export function presetDiceSetId(entry: Readonly<StoredRecord>): string | undefined {
  const rules = entry.rules;
  const id = typeof rules === 'object' && rules !== null && 'diceSetId' in rules ? rules.diceSetId : undefined;
  return typeof id === 'string' && id !== '' ? id : undefined;
}

/** A carried preset whose dice set is the set's id in this vault. */
export function withPresetDiceSet(entry: StoredRecord, ids: ReadonlyMap<string, string>): StoredRecord {
  const id = presetDiceSetId(entry);
  const local = id === undefined ? undefined : ids.get(id);
  return local === undefined ? entry : { ...entry, rules: { ...(entry.rules as Record<string, unknown>), diceSetId: local } };
}
