import type { App } from 'obsidian';
import { BUILT_IN_DICE_SETS, isBuiltInDiceSetId } from '../../gameSystems/builtInDiceSets';
import { MAX_DICE_NAME_LENGTH, parseStoredDiceSet } from '../../gameSystems/diceSetValidation';
import { templateDiceSetIdAt } from '../../statblocks/bundles/bundleTemplates';
import type { CollectionSettings } from '../../types/collectionSettingsTypes';
import { DICE_SET_FOLDER_SPEC, DiceSetFiles } from '../diceSets/DiceSetFiles';
import { SystemPresetFiles } from '../systemPresets/SystemPresetFiles';
import { DICE_SET_ROLE, TEMPLATE_ROLE, type BundleFile } from './bundleFormat';
import { presetDiceSetId } from './bundlePresetFiles';
import { withRecordFiles, type BundledRecordKind } from './bundleRecordFiles';

/**
 * The vault's dice sets a collection rolls with travel with it, matched by their set id on
 * import. A copy is named after the collection ("Sun and Moon (Fen)"), within a set name's length,
 * and never takes a built-in set's name.
 */
export const DICE_SET_RECORDS: BundledRecordKind = {
  role: DICE_SET_ROLE,
  spec: DICE_SET_FOLDER_SPEC,
  files: (app) => DiceSetFiles.forApp(app),
  isSound: (entry) => parseStoredDiceSet(entry) !== null,
  nameReserved: (name) => BUILT_IN_DICE_SETS.some((set) => set.name.toLowerCase() === name.toLowerCase()),
  maxNameLength: MAX_DICE_NAME_LENGTH,
};

/**
 * `files` with the dice sets the collection rolls with: its own pick, its user preset's, and
 * those the templates it carries name. A set the collection or its preset names travels with
 * the collection; one only templates name travels with those templates (`linkedFrom`). Built-in
 * sets never travel: every Atlas has them. A set the vault lacks stays behind too: what names
 * it rolls as it does here.
 */
export async function withDiceSetFiles(app: App, files: readonly BundleFile[], settings: CollectionSettings): Promise<BundleFile[]> {
  // Templates per set; null for a set the collection itself rolls.
  const namedBy = new Map<string, string[] | null>();
  const name = (id: string | undefined, template: string | null): void => {
    if (!id || isBuiltInDiceSetId(id)) return;
    const templates = namedBy.get(id);
    if (templates === null) return;
    namedBy.set(id, template === null ? null : [...(templates ?? []), template]);
  };
  name(settings.diceSetId, null);
  const preset = SystemPresetFiles.forApp(app)?.entries().find((entry) => entry.id === settings.systemPresetId);
  if (preset) name(presetDiceSetId(preset), null);
  for (const file of files) {
    if (file.role === TEMPLATE_ROLE) name(await templateDiceSetIdAt(app, file.vaultPath), file.vaultPath);
  }
  if (namedBy.size === 0) return [...files];
  await DiceSetFiles.forApp(app)?.load();
  return withRecordFiles(app, DICE_SET_RECORDS, files, [...namedBy].map(([id, templates]) => ({ id, linkedFrom: templates ?? undefined })));
}

