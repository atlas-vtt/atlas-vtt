/**
 * The vault's items installed from the Armarium, found by the provenance in their own files
 * (`itemProvenance.ts`): its templates, user presets and dice sets that name a listing.
 */

import type { App } from 'obsidian';
import { TEMPLATE_EXTENSION, indexTemplateFiles, readTemplateFile } from '../../statblocks/library/templateFiles';
import type { ItemKind } from './itemBundleFormat';
import { provenanceOf, type ArmariumProvenance } from './itemProvenance';
import { ITEM_RECORDS, loadedRecordFiles, recordItemName } from './vaultItems';

/** A vault item that names the listing it was installed from. */
export interface InstalledItem {
  kind: ItemKind;
  /** Its id in this vault. */
  localId: string;
  path: string;
  provenance: ArmariumProvenance;
}

async function installedTemplates(app: App): Promise<InstalledItem[]> {
  const files = [];
  for (const file of app.vault.getFiles()) {
    if (file.extension === TEMPLATE_EXTENSION) files.push(readTemplateFile(file.path, await app.vault.read(file)));
  }
  return [...indexTemplateFiles(files).byId.values()].flatMap((entry): InstalledItem[] => {
    const provenance = entry.template.armarium;
    return provenance && entry.path !== null ? [{ kind: 'statblock-template', localId: entry.template.id, path: entry.path, provenance }] : [];
  });
}

async function installedRecords(app: App, kind: Exclude<ItemKind, 'statblock-template'>): Promise<InstalledItem[]> {
  const store = await loadedRecordFiles(app, ITEM_RECORDS[kind]);
  if (!store) return [];
  return store.entries().flatMap((entry): InstalledItem[] => {
    const provenance = provenanceOf(entry);
    const path = store.pathOf(entry.id);
    return provenance && path !== null && recordItemName(kind, entry) !== null ? [{ kind, localId: entry.id, path, provenance }] : [];
  });
}

/** The vault's items of `kind` (every kind's when none is given) that name the listing they were installed from. */
export async function installedItems(app: App, kind?: ItemKind): Promise<InstalledItem[]> {
  const kinds: readonly ItemKind[] = kind ? [kind] : ['statblock-template', 'system-preset', 'dice-set'];
  const lists = await Promise.all(kinds.map((each) => (each === 'statblock-template' ? installedTemplates(app) : installedRecords(app, each))));
  return lists.flat();
}

/**
 * The vault's item of `kind` installed from the listing `uid`. Where several name it (one the GM
 * changed, and the copy a later version came in as), the newest version's: an update follows the
 * item that took the listing's versions. Only items installed from the same bundle item (`source`)
 * count: a bundle that names a listing's uid with another item id is not that listing's update.
 */
export async function installedItemOf(app: App, kind: ItemKind, uid: string, source: string): Promise<InstalledItem | null> {
  const named = (await installedItems(app, kind)).filter((item) => item.provenance.uid === uid && item.provenance.source === source);
  return named.reduce<InstalledItem | null>((newest, item) => (newest && newest.provenance.version >= item.provenance.version ? newest : item), null);
}
