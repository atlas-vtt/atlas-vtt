import type { App } from 'obsidian';
import { ensureFolder } from '../../plugin/vaultFolders';
import { ATLAS_VTT_DIR, collectionFolderPath } from '../assetPaths';
import type { CollectionMetadata } from '../AssetService';
import { mapStrings } from '../../utils/mapStrings';
import { trashVaultItem } from '../../utils/trashVaultItem';
import { isRecord } from '../../utils/guards';
import { installFilePath } from '../library/libraryPaths';

/** Hidden and device-local: import backups and the index cache, which no sync tool should carry. */
export const COLLECTION_DATA_DIR = `${ATLAS_VTT_DIR}/.atlas-data`;
const LEGACY_INSTALLS_DIR = `${COLLECTION_DATA_DIR}/installs`;

/** The collection record fields an update compares one by one. */
export const COLLECTION_FIELDS = ['name', 'description', 'tags', 'settings'] as const;
export type CollectionField = typeof COLLECTION_FIELDS[number];

/**
 * One installed item as two fingerprints: `source` is what the bundle carried,
 * `installed` what the import left in the vault (paths rewritten, notes relinked).
 * A later bundle changed the item when its source differs; the user changed it
 * when the vault no longer matches `installed`.
 */
export interface InstalledItem {
  source: string;
  installed: string;
}

interface InstalledFile extends InstalledItem {
  /** Where the file lives in this vault. */
  target: string;
  /** The plan unit the file belongs to, so a later update can group its removal. */
  unit?: string;
}

interface InstalledAsset extends InstalledItem {
  /** The record's id in this vault, which differs from the bundle's when it collided. */
  localId: string;
}

/**
 * A user game system preset the collection brought, fingerprinted by content without its id
 * (`presetFingerprint`). Presets are found by id, wherever their file is.
 */
export interface InstalledPreset extends InstalledItem {
  /** Its id in this vault: the bundle's, or a copy's when the vault's own had changed. */
  localId: string;
}

/** What the vault got from a collection's last import or export: the baseline of the next update. */
export interface InstallRecord {
  uid: string;
  collectionId: string;
  /** The collection's id in the bundles it came from; bundle paths live under that folder. */
  sourceCollectionId: string;
  /** The collection's name in the bundles it came from, which shares keep unless the user renamed it. */
  sourceName: string;
  version: number;
  releasedAt: number;
  installedAt: number;
  /** Keyed by the file's path in the bundle. */
  files: Record<string, InstalledFile>;
  /** Keyed by the asset's id in the bundle. */
  assets: Record<string, InstalledAsset>;
  fields: Partial<Record<CollectionField, InstalledItem>>;
  /** Keyed by the preset's id in the bundle; missing in records of bundles without a user preset. */
  presets?: Record<string, InstalledPreset>;
}

/** Where versions before install records synced kept them, by collection uid. */
const legacyRecordPath = (uid: string): string => `${LEGACY_INSTALLS_DIR}/${uid}.json`;

/** The collection a record belongs to: its folder and its identity. */
type InstalledCollection = Pick<CollectionMetadata, 'id' | 'uid'>;

function isInstallRecord(value: unknown): value is InstallRecord {
  return isRecord(value)
    && typeof value.uid === 'string'
    && typeof value.collectionId === 'string'
    && typeof value.version === 'number'
    && isRecord(value.files)
    && isRecord(value.assets)
    && isRecord(value.fields);
}

function parseInstallRecord(text: string, path: string): InstallRecord | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isInstallRecord(parsed) ? parsed : null;
  } catch (error) {
    console.error(`[installRecord] Unreadable install record ${path}:`, error);
    return null;
  }
}

/** The record as it reads for the collection's folder: paths into the folder it was written for follow a rename. */
export function movedInstallRecord(record: InstallRecord, collectionId: string): InstallRecord {
  if (record.collectionId === collectionId) return record;
  const oldPrefix = `${collectionFolderPath(record.collectionId)}/`;
  const newPrefix = `${collectionFolderPath(collectionId)}/`;
  const files = mapStrings(record.files, (text) => (text.startsWith(oldPrefix) ? newPrefix + text.slice(oldPrefix.length) : text));
  return { ...record, collectionId, files };
}

async function readLegacyRecord(app: App, uid: string): Promise<InstallRecord | null> {
  const path = legacyRecordPath(uid);
  if (!(await app.vault.adapter.exists(path))) return null;
  return parseInstallRecord(await app.vault.adapter.read(path), path);
}

/**
 * The install record of a collection: `install.json` in its folder, so it moves
 * and syncs with the collection, or one an older version kept in the hidden
 * data folder. Null when the collection was never installed or exported.
 */
export async function readInstallRecord(app: App, collection: InstalledCollection): Promise<InstallRecord | null> {
  const file = app.vault.getFileByPath(installFilePath(collection.id));
  const record = file ? parseInstallRecord(await app.vault.read(file), file.path) : await readLegacyRecord(app, collection.uid);
  return record && record.uid === collection.uid ? movedInstallRecord(record, collection.id) : null;
}

export async function writeInstallRecord(app: App, record: InstallRecord): Promise<void> {
  const path = installFilePath(record.collectionId);
  const content = JSON.stringify(record);
  const file = app.vault.getFileByPath(path);
  if (file) {
    await app.vault.process(file, () => content);
  } else {
    await ensureFolder(app, collectionFolderPath(record.collectionId));
    await app.vault.create(path, content);
  }
}

export async function deleteInstallRecord(app: App, collection: InstalledCollection): Promise<void> {
  const file = app.vault.getFileByPath(installFilePath(collection.id));
  if (file) await trashVaultItem(app, file);
  const legacy = legacyRecordPath(collection.uid);
  if (await app.vault.adapter.exists(legacy)) await app.vault.adapter.remove(legacy);
}

/** Whether `record` stands for a later import than `other`: a newer release, else a later install of it. */
const isLaterInstall = (record: InstallRecord, other: InstallRecord): boolean =>
  record.version !== other.version ? record.version > other.version : record.installedAt > other.installedAt;

/**
 * Moves install records older versions kept in the hidden data folder, which
 * no sync tool carries, into their collection's folder. Runs on every device.
 * Each device kept its own while the collection's files synced, so where
 * another device moved its record already, the later install of the two stays.
 */
export async function migrateInstallRecords(app: App, collections: readonly InstalledCollection[]): Promise<void> {
  for (const collection of collections) {
    const legacy = await readLegacyRecord(app, collection.uid);
    if (!legacy) continue;
    try {
      const file = app.vault.getFileByPath(installFilePath(collection.id));
      const moved = file ? parseInstallRecord(await app.vault.read(file), file.path) : null;
      if (!moved || moved.uid !== collection.uid || isLaterInstall(legacy, moved)) await writeInstallRecord(app, movedInstallRecord(legacy, collection.id));
      await app.vault.adapter.remove(legacyRecordPath(collection.uid));
    } catch (error) {
      console.error(`[installRecord] Could not move the install record of ${collection.id}:`, error);
    }
  }
}
