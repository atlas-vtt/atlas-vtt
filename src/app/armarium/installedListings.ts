import type { App } from 'obsidian';
import type { AssetService } from '../services/AssetService';
import { readInstallRecord } from '../services/collectionBundle/installRecord';
import type { ArmariumRequest } from './armariumRequest';

/**
 * The releases of Armarium listings the vault holds. A listing's uid is the uid of the collection its bundle
 * carries (`manifest.collection.uid`), which an import keeps as the collection's and writes into its install
 * record, so the install records say which listings are in the vault and at which version. Only uids in
 * `listed` are told: the page learns nothing of collections that are not the Armarium's.
 */
export async function installedListings(app: App, assets: AssetService, listed: ReadonlySet<string>): Promise<ArmariumRequest[]> {
  const versions = new Map<string, number>();
  for (const collection of await assets.getCollections()) {
    if (!listed.has(collection.uid)) continue;
    try {
      const record = await readInstallRecord(app, collection);
      if (record) versions.set(record.uid, Math.max(record.version, versions.get(record.uid) ?? 0));
    } catch (error) {
      console.error(`[Atlas] Reading the install record of ${collection.id} failed:`, error);
    }
  }
  return [...versions].map(([uid, version]) => ({ uid, version }));
}
