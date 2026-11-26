/**
 * What an item bundle's import does, decided by id like a collection's templates and records
 * (`planTemplates`, `planRecords`): the dice set it brings first, its id remapped where it comes in
 * as a copy, then the item. The provenance in the vault item's file stands in for an install record:
 * an item unchanged since its install is updated in place, one the GM changed gets the new version
 * beside it as a copy, and without provenance the item is new, reused or copied by its id.
 */

import type { App } from 'obsidian';
import { readBundleTemplates, vaultTemplates } from '../../statblocks/bundles/bundleTemplates';
import { planTemplates, type PlannedTemplate } from '../../statblocks/bundles/bundleTemplateIds';
import { templateName } from '../../statblocks/library/templateFiles';
import { templateNameTakenAt } from '../../statblocks/library/templatePaths';
import { newTemplateId } from '../../statblocks/model/templateIds';
import { DICE_SET_RECORDS } from '../collectionBundle/bundleDiceSetFiles';
import { PRESET_RECORDS, withPresetDiceSet } from '../collectionBundle/bundlePresetFiles';
import { planRecordImport } from '../collectionBundle/bundleRecordFiles';
import type { InstalledRecord, InstalledTemplate } from '../collectionBundle/installRecord';
import { templatePlacer } from '../collectionBundle/pathRemap';
import { recordIdMap, type PlannedRecord, type RecordOutcome } from '../vaultRecords/bundleRecords';
import type { ItemKind } from './itemBundleFormat';
import type { OpenedItemBundle } from './itemBundleReader';
import { installedItemOf, type InstalledItem } from './installedItems';

/** What becomes of the item: the outcomes of `planTemplates` and `planRecords`, which are the same. */
export type ItemOutcome = RecordOutcome;

/** The import of one item bundle as decided against the vault. */
export interface ItemImportPlan {
  kind: ItemKind;
  /** The vault's item installed from the same listing, if any. */
  installed: InstalledItem | null;
  /** The item, for a statblock template. */
  template?: PlannedTemplate;
  /** The item, for a game system preset or a dice set. */
  record?: PlannedRecord;
  /** The dice set a template or preset brings; null where it brings none. */
  diceSet: PlannedRecord | null;
}

/** The install record entry the provenance stands for: the item as it was installed is the source last installed too. */
function installedEntry(installed: InstalledItem | null, bundleId: string): Record<string, InstalledRecord> | undefined {
  if (!installed) return undefined;
  const { localId, provenance } = installed;
  return { [bundleId]: { localId, source: provenance.installed, installed: provenance.installed } };
}

function installedTemplate(installed: InstalledItem | null, bundleId: string): Record<string, InstalledTemplate> | undefined {
  const entry = installedEntry(installed, bundleId)?.[bundleId];
  return entry && installed ? { [bundleId]: { ...entry, target: installed.path } } : undefined;
}

async function planTemplate(app: App, bundle: OpenedItemBundle, installed: InstalledItem | null, diceSetIds: ReadonlyMap<string, string>, mark: string): Promise<PlannedTemplate> {
  const packed = await readBundleTemplates(bundle.manifest.files, (path) => bundle.files.text(path), diceSetIds);
  const [planned] = planTemplates(packed, await vaultTemplates(app), installedTemplate(installed, bundle.manifest.item.id), {
    place: templatePlacer(mark, (path) => templateNameTakenAt(app, path)),
    newId: (name) => newTemplateId(name),
  });
  if (!planned) throw new Error('The bundle holds no template.');
  return planned;
}

/**
 * Decides what the import of `bundle` does. `mark` names copies and new files whose name is
 * taken ("Goblin (Mara)"): the creator, or the version. Only a `verified` bundle (downloaded and
 * checked for its listing) may update the vault's install of that listing; any other is planned as
 * if nothing were installed, so it comes in beside a changed item rather than over it.
 */
export async function planItemImport(app: App, bundle: OpenedItemBundle, mark: string, verified: boolean): Promise<ItemImportPlan> {
  const { manifest, files } = bundle;
  const { kind, uid, id } = manifest.item;
  const installed = verified ? await installedItemOf(app, kind, uid, id) : null;
  if (kind === 'dice-set') {
    const [record] = await planRecordImport(app, DICE_SET_RECORDS, manifest, files, installedEntry(installed, id), mark);
    if (!record) throw new Error('The bundle holds no dice set.');
    return { kind, installed, record, diceSet: null };
  }
  const diceSets = await planRecordImport(app, DICE_SET_RECORDS, manifest, files, undefined, mark);
  const diceSetIds = recordIdMap(diceSets);
  const diceSet = diceSets[0] ?? null;
  if (kind === 'statblock-template') return { kind, installed, template: await planTemplate(app, bundle, installed, diceSetIds, mark), diceSet };
  const [record] = await planRecordImport(app, PRESET_RECORDS, manifest, files, installedEntry(installed, id), mark, (entry) => withPresetDiceSet(entry, diceSetIds));
  if (!record) throw new Error('The bundle holds no game system.');
  return { kind, installed, record, diceSet };
}

/** The item's outcome, local id, target and name in this vault after the import. */
export function plannedItem(plan: ItemImportPlan): { outcome: ItemOutcome; localId: string; target: string; name: string } {
  if (plan.template) {
    const { outcome, localId, target } = plan.template;
    return { outcome, localId, target, name: templateName(target) };
  }
  const { outcome, localId, target, name } = plan.record!;
  return { outcome, localId, target, name };
}
