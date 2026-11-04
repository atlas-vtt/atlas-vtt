import type { AssetService, CollectionMetadata } from '../AssetService';
import { installedTemplates, type ReusedNote } from '../../statblocks/bundles/bundleTemplateIds';
import { installedRecords } from '../vaultRecords/bundleRecords';
import type { SystemPreset } from '../../types/systemPresetTypes';
import type { OpenedBundle } from './bundleReader';
import { importedSettings, settingsFromBundle } from './bundleSettings';
import { fieldFingerprint } from './fingerprints';
import type { ImportTargets } from './importInputs';
import type { ImportAction, ImportPlan } from './importPlan';
import { COLLECTION_FIELDS, type CollectionField, type InstallRecord } from './installRecord';

/** A bundle planned against the vault: what an import applies and records. */
export interface ImportContext {
  bundle: OpenedBundle;
  existing: CollectionMetadata | null;
  record: InstallRecord | null;
  targets: ImportTargets;
  plan: ImportPlan;
  /** The vault's notes the import keeps that name a template whose bundle version came in as a copy. */
  reusedNotes: readonly ReusedNote[];
}

/** `file:<path>` → `<path>`, `asset:<id>` → `<id>`. */
export const idOf = (key: string): string => key.slice(key.indexOf(':') + 1);

/** The collection record after the import: release identity from the bundle, each field from whichever side won. */
export async function mergedCollection(assets: AssetService, { bundle, existing, targets }: ImportContext, actions: ReadonlyMap<string, ImportAction>, name: string): Promise<CollectionMetadata> {
  const theirs: CollectionMetadata = { ...bundle.manifest.collection, settings: importedSettings(bundle.manifest.collection, targets) };
  const now = Date.now();
  const merged: CollectionMetadata = {
    ...(existing ?? theirs),
    id: targets.collectionId,
    uid: theirs.uid,
    version: theirs.version,
    releasedAt: bundle.manifest.exportedAt,
    createdAt: existing?.createdAt ?? now,
    modifiedAt: now,
  };
  // A collection keeps its publisher: a bundle cannot hand someone else's collection over to another publisher.
  const publisherId = existing?.publisherId ?? theirs.publisherId;
  if (publisherId === undefined) delete merged.publisherId;
  else merged.publisherId = publisherId;
  // Only a release speaks for the author and cover; a shared copy keeps what the vault had.
  const isRelease = bundle.manifest.release?.kind !== 'share';
  if (isRelease) {
    if (theirs.author === undefined) delete merged.author;
    else merged.author = theirs.author;
  }
  if (isRelease || !existing) {
    const coverPath = theirs.coverPath && targets.targetOf(theirs.coverPath);
    if (coverPath) merged.coverPath = coverPath;
    else delete merged.coverPath;
  }
  if (!existing) return { ...merged, name };
  for (const field of COLLECTION_FIELDS) {
    if (actions.get(`field:${field}`) !== 'write') continue;
    if (theirs[field] === undefined) delete merged[field];
    else if (field === 'settings') merged.settings = settingsFromBundle(theirs.settings, existing.settings);
    else Object.assign(merged, { [field]: theirs[field] });
  }
  // The update's name may belong to another collection here; the copy then keeps its own.
  if (await assets.isCollectionNameTaken(merged.name, targets.collectionId)) merged.name = existing.name;
  return merged;
}

/**
 * What the vault now holds from the bundle: every item the bundle carries is
 * recorded as the bundle's version installed. An item the user kept in their
 * own version therefore still differs from `installed`, so a later update never
 * overwrites it silently, and re-importing this bundle does not ask again.
 * Unchanged items keep their earlier record, including its exact bytes, and
 * collection fields record the value actually applied (a name the user chose
 * because the bundle's was taken counts as theirs). Templates, presets and dice
 * sets are recorded by their bundle id with their id here.
 */
export async function nextInstallRecord(
  { bundle: { manifest }, record, targets, plan }: ImportContext,
  actions: ReadonlyMap<string, ImportAction>,
  collection: CollectionMetadata,
  presets: readonly SystemPreset[],
): Promise<InstallRecord> {
  const next: InstallRecord = {
    uid: collection.uid, collectionId: targets.collectionId, sourceCollectionId: manifest.collection.id, sourceName: manifest.collection.name,
    version: manifest.collection.version, releasedAt: manifest.exportedAt, installedAt: Date.now(), files: {}, assets: {}, fields: {},
    ...(targets.templates.length > 0 && { templates: installedTemplates(targets.templates, record?.templates) }),
    ...(targets.presets.length > 0 && { presets: await installedRecords(targets.presets, record?.presets) }),
    ...(targets.diceSets.length > 0 && { diceSets: await installedRecords(targets.diceSets, record?.diceSets) }),
  };
  // Files the import only reads (the user's own notes) keep their record, so a later import still recognises them.
  for (const path of targets.shared) {
    const installed = record?.files[path];
    if (installed) next.files[path] = installed;
  }
  for (const unit of plan.units) {
    for (const item of unit.items) {
      if (item.theirs === null || actions.get(item.key) === 'remove') continue;
      // Never installed and not in the vault: recording it would make a later update say the user deleted it.
      if (!actions.has(item.key) && !item.base && item.mine === null) continue;
      const keepsRecord = !actions.has(item.key) && item.base?.source === item.theirs;
      const entry = keepsRecord && item.base ? item.base : { source: item.theirs, installed: item.theirsInstalled ?? item.theirs };
      const id = idOf(item.key);
      if (item.kind === 'file') next.files[id] = { ...entry, target: targets.targetOf(id)!, unit: unit.key };
      else if (item.kind === 'asset') next.assets[id] = { ...entry, localId: targets.localIdOf(id) };
      else if (actions.get(item.key) === 'write') next.fields[id as CollectionField] = { source: item.theirs, installed: await fieldFingerprint(collection, id as CollectionField, presets) };
      else next.fields[id as CollectionField] = entry;
    }
  }
  return next;
}
