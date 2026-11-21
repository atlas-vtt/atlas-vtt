/**
 * The vault's shareable items: its own statblock templates, user game system presets and dice
 * sets, never a built-in. Read from their files now (the template library reads in the background
 * and may not have every file yet), with the record edits not yet on disk written first.
 */

import type { App } from 'obsidian';
import { isBuiltInDiceSetId } from '../../gameSystems/builtInDiceSets';
import { parseStoredDiceSet } from '../../gameSystems/diceSetValidation';
import { parseUserPreset } from '../../gameSystems/presetValidation';
import { vaultTemplates } from '../../statblocks/bundles/bundleTemplates';
import { templateName } from '../../statblocks/library/templateFiles';
import { isBuiltInTemplateId } from '../../statblocks/model/templateTypes';
import { DICE_SET_RECORDS } from '../collectionBundle/bundleDiceSetFiles';
import { PRESET_RECORDS } from '../collectionBundle/bundlePresetFiles';
import type { BundledRecordKind } from '../collectionBundle/bundleRecordFiles';
import type { RecordFolderFiles } from '../vaultRecords/RecordFolderFiles';
import type { StoredRecord } from '../vaultRecords/recordFolder';
import type { ItemKind, ItemRef } from './itemBundleFormat';

/** An item of the vault that may be shared, with the name it is shown and shared under. */
export interface ShareableItem extends ItemRef {
  name: string;
  /** Its file in the vault. */
  path: string;
}

/** The library records each record kind of item is kept as. */
export const ITEM_RECORDS: Readonly<Record<Exclude<ItemKind, 'statblock-template'>, BundledRecordKind>> = {
  'system-preset': PRESET_RECORDS,
  'dice-set': DICE_SET_RECORDS,
};

/** The name a record shows under, when it is a sound record of its kind. */
export function recordItemName(kind: Exclude<ItemKind, 'statblock-template'>, entry: unknown): string | null {
  const parsed = kind === 'system-preset' ? parseUserPreset(entry) : parseStoredDiceSet(entry);
  return parsed?.name ?? null;
}

/** The app's files of a record kind, loaded and with every edit written. */
export async function loadedRecordFiles(app: App, kind: BundledRecordKind): Promise<RecordFolderFiles | undefined> {
  const store = kind.files(app);
  if (!store) return undefined;
  await store.load();
  await store.flush();
  return store;
}

const BY_NAME = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byName = (a: ShareableItem, b: ShareableItem): number => BY_NAME.compare(a.name, b.name);

async function shareableTemplates(app: App): Promise<ShareableItem[]> {
  const templates = [...(await vaultTemplates(app)).values()];
  return templates.filter((template) => !isBuiltInTemplateId(template.id))
    .map((template) => ({ kind: 'statblock-template' as const, id: template.id, name: templateName(template.path), path: template.path }));
}

async function shareableRecords(app: App, kind: Exclude<ItemKind, 'statblock-template'>): Promise<ShareableItem[]> {
  const store = await loadedRecordFiles(app, ITEM_RECORDS[kind]);
  if (!store) return [];
  return store.entries().flatMap((entry): ShareableItem[] => {
    const name = recordItemName(kind, entry);
    const path = store.pathOf(entry.id);
    const builtIn = kind === 'dice-set' && isBuiltInDiceSetId(entry.id);
    return name !== null && path !== null && !builtIn ? [{ kind, id: entry.id, name, path }] : [];
  });
}

/** The vault's items of `kind` that may be shared, by name; every kind's, templates first, when no kind is given. */
export async function shareableItems(app: App, kind?: ItemKind): Promise<ShareableItem[]> {
  const kinds: readonly ItemKind[] = kind ? [kind] : ['statblock-template', 'system-preset', 'dice-set'];
  const lists = await Promise.all(kinds.map(async (each) => (each === 'statblock-template' ? shareableTemplates(app) : shareableRecords(app, each))));
  return lists.flatMap((list) => [...list].sort(byName));
}

/** The record of a record item as stored, with its file; null where the vault holds none. */
export async function storedRecordItem(app: App, kind: Exclude<ItemKind, 'statblock-template'>, id: string): Promise<{ entry: StoredRecord; path: string } | null> {
  const store = await loadedRecordFiles(app, ITEM_RECORDS[kind]);
  const entry = store?.entries().find((each) => each.id === id);
  const path = store?.pathOf(id) ?? null;
  return entry && path !== null && recordItemName(kind, entry) !== null ? { entry, path } : null;
}
