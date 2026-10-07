import type { App } from 'obsidian';
import { ensureAdapterFolder } from '../app/plugin/vaultFolders';
import { COLLECTION_DATA_DIR } from '../app/services/collectionBundle/installRecord';
import type { StorageApi } from './types/settings';

const EXTENSION_ID = /^[a-z0-9-]+$/;

export function storageFolderOf(extensionId: string): string {
  return `${COLLECTION_DATA_DIR}/extensions/${extensionId}`;
}

export function storageApi(app: App, extensionId: string): StorageApi {
  let ready: Promise<string> | null = null;
  async function folder(): Promise<string> {
    // Checked here, not at connect: an odd id must still get the other namespaces.
    if (!EXTENSION_ID.test(extensionId)) {
      throw new Error(`[Atlas API] storage.folder: "${extensionId}" cannot have a storage folder: the extension id must be kebab-case (a-z, 0-9, -).`);
    }
    const path = storageFolderOf(extensionId);
    // A folder deleted since the first call is created again.
    if (ready && await ready.then(() => app.vault.adapter.exists(path), () => false)) return path;
    const creating = ensureAdapterFolder(app, path).then(() => path);
    ready = creating;
    try {
      return await creating;
    } catch (error) {
      if (ready === creating) ready = null;
      throw error;
    }
  }
  return Object.freeze({ folder });
}
