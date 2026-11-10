import type { App } from 'obsidian';
import { COLLECTIONS_DIR, type AssetService, type CollectionMetadata } from '../AssetService';
import { systemPresetsOf } from '../mapCollectionRules';
import { ID_MATCHED_ROLES, type CollectionBundleManifest } from './bundleFormat';
import { storeCover, type CoverFile } from './collectionCover';
import { assetFingerprint, fieldFingerprint } from './fingerprints';
import { COLLECTION_FIELDS, deleteInstallRecord, movedInstallRecord, readInstallRecord, writeInstallRecord, type InstallRecord, type InstalledById } from './installRecord';

/** How a shared copy names the collection, its folder and the files and records it carries. */
export interface OriginNames {
  collectionId: string;
  name: string;
  /** Vault path or local id → the path or id the bundles it was installed from used. */
  names: Map<string, string>;
}

/**
 * A shared copy names its files and assets as the bundles it was installed
 * from did, so every vault that has the collection compares the same items.
 * Files the sharer added move from their collection folder to the original's.
 */
export async function originNames(app: App, collection: CollectionMetadata, packedPaths: readonly string[]): Promise<OriginNames> {
  const record = await readInstallRecord(app, collection);
  const collectionId = record?.sourceCollectionId ?? collection.id;
  // A name the vault had to give the copy (because another collection used the original) is not a rename by the user.
  const keptOwnName = record?.sourceName !== undefined && record.fields.name?.installed === await fieldFingerprint(collection, 'name');
  const name = keptOwnName ? record.sourceName : collection.name;
  const names = new Map<string, string>();
  for (const [bundlePath, file] of Object.entries(record?.files ?? {})) {
    if (file.target !== bundlePath) names.set(file.target, bundlePath);
  }
  for (const [bundleId, asset] of Object.entries(record?.assets ?? {})) {
    if (asset.localId !== bundleId) names.set(asset.localId, bundleId);
  }
  const localFolder = `${COLLECTIONS_DIR}/${collection.id}/`;
  if (collectionId !== collection.id) {
    for (const vaultPath of packedPaths) {
      if (!names.has(vaultPath) && vaultPath.startsWith(localFolder)) {
        names.set(vaultPath, `${COLLECTIONS_DIR}/${collectionId}/${vaultPath.slice(localFolder.length)}`);
      }
    }
  }
  return { collectionId, name, names };
}

/** The lists of `byId` that hold an entry: a record names no kind its bundle did not carry. */
function withEntries(byId: InstalledById): InstalledById {
  return Object.fromEntries(Object.entries(byId).filter(([, entries]) => entries !== undefined && Object.keys(entries).length > 0));
}

/**
 * The publisher's vault holds what it exported, so every fingerprint is both
 * source and installed state; collection fields are installed as the vault has them,
 * since the bundle's settings leave out what does not travel. A new cover is stored first, so it is too. Files outside Atlas's folder are recorded
 * too, so a shared copy coming back is matched to them instead of copied; an
 * import only ever removes files inside the collection's own folder. Templates are
 * recorded by id (`templates`, keyed by their id): installed as the vault holds them,
 * code included, and with the packed version, without code, as their source. A user preset
 * and the dice sets are recorded by their ids (`presets`, `diceSets`).
 */
export async function recordRelease(
  app: App,
  assets: AssetService,
  exportedFrom: CollectionMetadata,
  manifest: CollectionBundleManifest,
  cover: CoverFile | null,
  byId: InstalledById = {},
): Promise<void> {
  const { collection } = manifest;
  let collectionId = exportedFrom.id;
  if (cover) await storeCover(app, cover);
  if (collection.uid !== exportedFrom.uid) {
    // A fork takes its new name, and with it a folder of that name.
    await deleteInstallRecord(app, exportedFrom);
    collectionId = (await assets.forkCollection(collectionId, collection.name, collection.uid)).id;
  }
  await assets.recordCollectionRelease(collectionId, {
    version: collection.version, releasedAt: manifest.exportedAt, author: collection.author, coverPath: collection.coverPath,
  });

  // The bundle's paths live under the folder the collection had when it was exported.
  const bundleCollectionId = exportedFrom.id;
  const record: InstallRecord = {
    uid: collection.uid,
    collectionId: bundleCollectionId,
    sourceCollectionId: bundleCollectionId,
    sourceName: collection.name,
    version: collection.version,
    releasedAt: manifest.exportedAt,
    installedAt: manifest.exportedAt,
    files: {},
    assets: {},
    fields: {},
    ...withEntries(byId),
  };
  for (const file of manifest.files) {
    if (file.sha256 && !ID_MATCHED_ROLES.has(file.role)) record.files[file.vaultPath] = { target: file.vaultPath, source: file.sha256, installed: file.sha256 };
  }
  for (const asset of manifest.assets) {
    const fingerprint = await assetFingerprint(asset);
    record.assets[asset.id] = { localId: asset.id, source: fingerprint, installed: fingerprint };
  }
  // The vault keeps what the bundle leaves out of its settings (loot bases left behind, role folders outside the collection).
  const presets = systemPresetsOf(app);
  const local = await assets.getCollection(collectionId);
  for (const field of COLLECTION_FIELDS) {
    const source = await fieldFingerprint(collection, field, presets);
    record.fields[field] = { source, installed: local ? await fieldFingerprint(local, field, presets) : source };
  }
  // Its paths are the bundle's; a fork's folder took a new name, which the stored record follows.
  await writeInstallRecord(app, movedInstallRecord(record, collectionId));
}
