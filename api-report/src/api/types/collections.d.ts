import type { Json } from './common';
/** Capability `collections`: a collection of the asset index; its id is its folder's name, and so is its name. */
export interface CollectionRecord {
    id: string;
    name: string;
}
/**
 * Capability `collections`: the collections of the asset index, and an extension's own data on each. The data lives in
 * the asset index alone, as `scenes.setData`'s does: never in the collection's `collection.json`, an export, an
 * install or a copied folder, and it stays on the device that wrote it. A renamed collection keeps it; a deleted one
 * takes it along. Changes: `collections-changed`. Every call rejects when the asset index could not load.
 */
export interface CollectionsApi {
    /** Every collection, as frozen copies. */
    list(): Promise<CollectionRecord[]>;
    /** This extension's data on collection `collectionId`: a frozen copy, undefined when unset or there is no such collection. */
    getData(collectionId: string): Promise<Json | undefined>;
    /**
     * Sets or (null) clears it; `value` must be plain JSON and is copied. No edit of the collection: its record, its file
     * and `modifiedAt` stay as they were. Rejects for a collection that does not exist.
     */
    setData(collectionId: string, value: Json | null): Promise<void>;
}
