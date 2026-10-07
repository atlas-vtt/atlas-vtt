import type { App } from 'obsidian';
import type { ExtensionScope } from './extension';
import { frozenCopy } from './frozen';
import { plainJson } from './plainJson';
import { loadedAssets } from './scenes';
import type { CollectionRecord, CollectionsApi } from './types/collections';
import type { Json } from './types/common';

/** Capability `collections`: the collections, and each extension's own data on them, in the asset index alone. */
export function collectionsApi(app: App, scope: Pick<ExtensionScope, 'id'>): CollectionsApi {
  return Object.freeze({
    list: async (): Promise<CollectionRecord[]> =>
      (await (await loadedAssets(app)).getCollections()).map((collection) => frozenCopy({ id: collection.id, name: collection.name })),
    getData: async (collectionId: string): Promise<Json | undefined> => {
      const extensions = (await (await loadedAssets(app)).getCollectionIndexData(String(collectionId)))?.extensions;
      return extensions && Object.hasOwn(extensions, scope.id) ? frozenCopy(extensions[scope.id]) : undefined;
    },
    setData: async (collectionId: string, value: Json | null): Promise<void> => {
      const assets = await loadedAssets(app);
      const copy = value === null ? null : plainJson('collections.setData', value);
      const id = String(collectionId);
      // Re-read right before writing and patch only this extension's key: never anyone else's data.
      await assets.runExclusive(async () => {
        const current = (await assets.getCollectionIndexData(id))?.extensions;
        const next = Object.fromEntries(Object.entries(current ?? {}).filter(([key]) => key !== scope.id));
        if (copy !== null) Object.defineProperty(next, scope.id, { value: copy, enumerable: true, writable: true, configurable: true });
        const written = await assets.updateCollectionIndexData(id, { extensions: Object.keys(next).length > 0 ? next : undefined });
        if (!written) throw new Error(`[Atlas API] collections.setData: there is no collection with the id "${id}".`);
      });
    },
  });
}
