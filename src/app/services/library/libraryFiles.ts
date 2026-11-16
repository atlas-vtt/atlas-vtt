import type { Asset, CollectionMetadata } from '../AssetService';
import { collectionFilePath, LIBRARY_FILE, recordFilePath } from './libraryPaths';
import { serializeCollection, serializeLibrary, type LibraryFacts } from './collectionFile';
import { isPayloadUnread, serializeRecord } from './recordFile';
import { assetKey, collectionIdentity, collectionKey, LIBRARY_KEY } from './libraryState';
import { derivedCollectionRecord, INITIAL_COLLECTION_ID } from '../collectionRecords';
import { hashText } from '../../utils/hashing';
import type { IndexSnapshot } from './indexSnapshot';

/** One file the library consists of, with the content the index says it holds. */
export interface DesiredFile {
  key: string;
  /** What stays the same when the file moves: the asset id, the collection's uid. */
  identity: string;
  path: string;
  /** `hashText` of the content, which the stamps of the files this device knows are compared with. */
  hash: string;
  /** The content, worked out when the file is written: the files of a library are not all held in memory. */
  content: () => string;
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

/** The record file of the asset whose JSON is `json`; null for a record without a place. */
function recordFile(json: string): DesiredFile | null {
  const asset = JSON.parse(json) as Asset;
  const path = recordFilePath(asset);
  if (!path) return null;
  const key = assetKey(asset.id);
  return {
    key,
    identity: key,
    path,
    hash: hashText(serializeRecord(asset)),
    content: () => serializeRecord(JSON.parse(json) as Asset),
    payloadUnread: isPayloadUnread(asset),
    derivable: false,
  };
}

/** The `collection.json` of the collection whose JSON is `json`. */
function collectionFile(json: string): DesiredFile {
  const collection = JSON.parse(json) as CollectionMetadata;
  const content = serializeCollection(collection);
  return {
    key: collectionKey(collection.id),
    identity: collectionIdentity(collection.uid),
    path: collectionFilePath(collection.id),
    hash: hashText(content),
    content: () => serializeCollection(JSON.parse(json) as CollectionMetadata),
    payloadUnread: false,
    derivable: content === serializeCollection(derivedCollectionRecord(collection.id)),
  };
}

function libraryFile(facts: LibraryFacts): DesiredFile {
  const content = serializeLibrary(facts);
  return {
    key: LIBRARY_KEY,
    identity: LIBRARY_KEY,
    path: LIBRARY_FILE,
    hash: hashText(content),
    content: () => content,
    payloadUnread: false,
    derivable: content === PLAIN_LIBRARY || content === serializeLibrary({}),
  };
}

/** A file as it was worked out, with the JSON it was worked out from. */
interface Remembered {
  json: string;
  file: DesiredFile | null;
}

/** The files of `texts`, each worked out anew only where its JSON is not the one `known` holds for it. */
function filesOf(texts: ReadonlyMap<string, string>, known: ReadonlyMap<string, Remembered>, describe: (json: string) => DesiredFile | null, files: DesiredFile[]): Map<string, Remembered> {
  const remembered = new Map<string, Remembered>();
  for (const [id, json] of texts) {
    const held = known.get(id);
    const entry = held?.json === json ? held : { json, file: describe(json) };
    remembered.set(id, entry);
    if (entry.file) files.push(entry.file);
  }
  return remembered;
}

/**
 * Works out the files a library consists of, and remembers each record's and
 * collection's by the JSON it was worked out from, so a save serializes and
 * hashes only what changed since the last one, however large the library.
 *
 * A file is made of its record's JSON and nothing else, so equal JSON is the
 * same file: a record changed in place, by whatever code, is never taken for
 * unchanged, which remembering by the record's object would do.
 */
export class LibraryFileMemo {
  private records: ReadonlyMap<string, Remembered> = new Map();
  private collections: ReadonlyMap<string, Remembered> = new Map();

  /** Every file the library consists of: a record file per asset, `collection.json` per collection, `library.json`. */
  files(snapshot: IndexSnapshot): DesiredFile[] {
    const files: DesiredFile[] = [];
    this.records = filesOf(snapshot.assets, this.records, recordFile, files);
    this.collections = filesOf(snapshot.collections, this.collections, collectionFile, files);
    files.push(libraryFile(snapshot.library));
    return files;
  }
}
