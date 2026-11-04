import type { AssetMetadata } from '../AssetService';
import { collectionFilePath, LIBRARY_FILE, recordFilePath } from './libraryPaths';
import { libraryFactsOf, serializeCollection, serializeLibrary } from './collectionFile';
import { isPayloadUnread, serializeRecord } from './recordFile';
import { assetKey, collectionIdentity, collectionKey, LIBRARY_KEY } from './libraryState';
import { derivedCollectionRecord, INITIAL_COLLECTION_ID } from '../collectionRecords';

/** One file the library consists of, with the content the index says it holds. */
export interface DesiredFile {
  key: string;
  /** What stays the same when the file moves: the asset id, the collection's uid. */
  identity: string;
  path: string;
  content: string;
  /** See `isPayloadUnread`: such a file is not written until its payload is read. */
  payloadUnread: boolean;
  /**
   * The file holds nothing but what every device works out by itself (a collection as Atlas
   * makes it for a folder, a library with only the first collection as default): it is not
   * written while there is none, so a device that starts before sync delivered the library
   * writes nothing over it.
   */
  derivable: boolean;
}

/** The library facts of a vault nobody changed anything about. */
const PLAIN_LIBRARY = serializeLibrary({ defaultCollectionId: INITIAL_COLLECTION_ID });

/** Every file the library consists of: a record file per asset, `collection.json` per collection, `library.json`. */
export function desiredLibraryFiles(metadata: AssetMetadata): DesiredFile[] {
  const files: DesiredFile[] = [];
  for (const asset of Object.values(metadata.assets)) {
    const path = recordFilePath(asset);
    if (!path) continue;
    files.push({ key: assetKey(asset.id), identity: assetKey(asset.id), path, content: serializeRecord(asset), payloadUnread: isPayloadUnread(asset), derivable: false });
  }
  for (const collection of Object.values(metadata.collections)) {
    const content = serializeCollection(collection);
    files.push({
      key: collectionKey(collection.id),
      identity: collectionIdentity(collection.uid),
      path: collectionFilePath(collection.id),
      content,
      payloadUnread: false,
      derivable: content === serializeCollection(derivedCollectionRecord(collection.id)),
    });
  }
  const library = serializeLibrary(libraryFactsOf(metadata));
  files.push({ key: LIBRARY_KEY, identity: LIBRARY_KEY, path: LIBRARY_FILE, content: library, payloadUnread: false, derivable: library === PLAIN_LIBRARY || library === serializeLibrary({}) });
  return files;
}
