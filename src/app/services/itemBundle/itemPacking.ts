/**
 * What an item bundle packs of a vault item: the item's file at the place the contract names
 * (templates in the library folder under their name, records in their kind's folder under their
 * file name), the note beside a template, and the vault dice set the item rolls with. Templates go
 * through `cleanTemplate` (no code); no file keeps where it came from in the Armarium.
 */

import type { App } from 'obsidian';
import { isBuiltInDiceSetId } from '../../gameSystems/builtInDiceSets';
import { cleanTemplate, templateBodyAt, vaultTemplates } from '../../statblocks/bundles/bundleTemplates';
import { templateName } from '../../statblocks/library/templateFiles';
import { TEMPLATE_FOLDER, templateBodyPath, templateFileName, templatePathIn } from '../../statblocks/library/templatePaths';
import { isBuiltInTemplateId } from '../../statblocks/model/templateTypes';
import { baseName } from '../../utils/pathUtils';
import { DICE_SET_ROLE, TEMPLATE_BODY_ROLE, type BundleFileRole } from '../collectionBundle/bundleFormat';
import { presetDiceSetId } from '../collectionBundle/bundlePresetFiles';
import { recordText, type StoredRecord } from '../vaultRecords/recordFolder';
import { ITEM_ROLE, MAX_ITEM_NAME, type ItemKind, type ItemRef } from './itemBundleFormat';
import { withoutProvenance } from './itemProvenance';
import { ITEM_RECORDS, storedRecordItem } from './vaultItems';
import { t } from '../../i18n';

/** A file an item bundle packs, at its path in the bundle. */
export interface PackedItemFile {
  vaultPath: string;
  role: BundleFileRole;
  text: string;
  linkedFrom?: string[];
}

/** An item as an export packs it. */
export interface PackedItem {
  name: string;
  files: PackedItemFile[];
}

/** The record's file text as the bundle carries it: at its kind's format, without provenance. */
function packedRecordText(kind: Exclude<ItemKind, 'statblock-template'>, entry: StoredRecord): string {
  return recordText(ITEM_RECORDS[kind].spec, withoutProvenance(entry));
}

/** Its place in a bundle: the kind's folder, under the file's own name. */
const recordBundlePath = (kind: Exclude<ItemKind, 'statblock-template'>, path: string): string =>
  `${ITEM_RECORDS[kind].spec.folder}/${baseName(path)}`;

/** The vault dice set `id` names, packed beside the item; none for a built-in set or one the vault lacks. */
async function packedDiceSet(app: App, id: string | undefined, linkedFrom: string | null): Promise<PackedItemFile[]> {
  if (!id || isBuiltInDiceSetId(id)) return [];
  const set = await storedRecordItem(app, 'dice-set', id);
  if (!set) return [];
  return [{ vaultPath: recordBundlePath('dice-set', set.path), role: DICE_SET_ROLE, text: packedRecordText('dice-set', set.entry), ...(linkedFrom && { linkedFrom: [linkedFrom] }) }];
}

const clampName = (name: string): string => name.trim().slice(0, MAX_ITEM_NAME);

async function packTemplate(app: App, id: string): Promise<PackedItem> {
  const path = (await vaultTemplates(app)).get(id)?.path;
  const file = path === undefined ? null : app.vault.getFileByPath(path);
  if (!path || !file) throw new Error(t('itemBundle.missing'));
  const body = await templateBodyAt(app, path);
  const packed = await cleanTemplate(path, await app.vault.read(file), body);
  if (!packed) throw new Error(t('itemBundle.unreadable'));
  const name = templateName(path);
  const vaultPath = templatePathIn(TEMPLATE_FOLDER, templateFileName(name));
  const files: PackedItemFile[] = [{ vaultPath, role: ITEM_ROLE['statblock-template'], text: packed.text }];
  if (packed.body !== null) files.push({ vaultPath: templateBodyPath(vaultPath), role: TEMPLATE_BODY_ROLE, text: packed.body, linkedFrom: [vaultPath] });
  const diceSetId = typeof packed.json.diceSetId === 'string' ? packed.json.diceSetId : undefined;
  files.push(...await packedDiceSet(app, diceSetId, vaultPath));
  return { name: clampName(name), files };
}

async function packRecord(app: App, kind: Exclude<ItemKind, 'statblock-template'>, id: string): Promise<PackedItem> {
  const stored = await storedRecordItem(app, kind, id);
  if (!stored) throw new Error(t('itemBundle.missing'));
  const name = typeof stored.entry.name === 'string' ? stored.entry.name : '';
  const files: PackedItemFile[] = [{ vaultPath: recordBundlePath(kind, stored.path), role: ITEM_ROLE[kind], text: packedRecordText(kind, stored.entry) }];
  if (kind === 'system-preset') files.push(...await packedDiceSet(app, presetDiceSetId(stored.entry), null));
  return { name: clampName(name), files };
}

/** Packs the vault item `ref`; throws for a built-in and for an item the vault does not hold or cannot read. */
export async function packItem(app: App, ref: ItemRef): Promise<PackedItem> {
  if (isBuiltInTemplateId(ref.id) || isBuiltInDiceSetId(ref.id)) throw new Error(t('itemBundle.builtIn'));
  return ref.kind === 'statblock-template' ? packTemplate(app, ref.id) : packRecord(app, ref.kind, ref.id);
}
