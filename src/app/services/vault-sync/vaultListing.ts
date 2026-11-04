import { TFolder, type App } from 'obsidian';
import type { AssetMetadata } from '../AssetService';
import { COLLECTIONS_DIR } from '../assetPaths';
import { isAdoptableJson } from './assetAdoption';
import { indexedPaths, primaryPath } from './assetFiles';
import type { VaultListing } from './reconcileIndex';

/** What reading files adds to the vault listing; gathered before the listing is taken. */
export interface VaultReadings {
  /** Files the index uses that Obsidian did not list but the adapter found. */
  unlisted: ReadonlySet<string>;
  /** Parsed content of the asset JSON files the index does not know. */
  json: ReadonlyMap<string, unknown>;
}

const listedFiles = (app: App): Set<string> => new Set(app.vault.getFiles().map((file) => file.path));

async function readJson(app: App, path: string): Promise<unknown> {
  try {
    return JSON.parse(await app.vault.adapter.read(path));
  } catch {
    return null;
  }
}

/**
 * Reads what the vault check needs from the disk. Obsidian's file list can lag
 * behind the disk, so a file the index uses counts as present while the adapter
 * still finds it.
 */
export async function readVault(app: App, metadata: AssetMetadata): Promise<VaultReadings> {
  const files = listedFiles(app);
  const unlisted = new Set<string>();
  for (const asset of Object.values(metadata.assets)) {
    const path = primaryPath(asset);
    if (path && !files.has(path) && await app.vault.adapter.exists(path)) unlisted.add(path);
  }

  const owned = indexedPaths(metadata);
  const json = new Map<string, unknown>();
  for (const path of files) {
    if (isAdoptableJson(path) && !owned.has(path)) json.set(path, await readJson(app, path));
  }
  return { unlisted, json };
}

/**
 * The vault as it is right now. Taken synchronously just before the check runs,
 * so the check never works from a listing older than the index it changes.
 */
export function listVault(app: App, readings: VaultReadings, deleted: ReadonlySet<string>, recorded: ReadonlySet<string> = new Set()): VaultListing {
  const files = listedFiles(app);
  for (const path of readings.unlisted) files.add(path);
  const root = app.vault.getFolderByPath(COLLECTIONS_DIR);
  const collectionFolders = new Set(
    (root?.children ?? [])
      .filter((child): child is TFolder => child instanceof TFolder && !child.name.startsWith('.'))
      .map((folder) => folder.name),
  );
  return { files, collectionFolders, deleted, json: readings.json, recorded };
}
