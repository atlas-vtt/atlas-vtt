import { collectionFolderPath } from '../assetPaths';
import { moveCollectionRecord } from '../collectionRecords';
import type { CollectionReading, LibraryReading } from './libraryReader';
import { collectionIdentity, collectionKey, LIBRARY_KEY } from './libraryState';
import { hashText } from '../../utils/hashing';
import { sameJson, stamp, type MergeContext } from './mergeShared';

/** A collection whose folder was copied gets an identity of its own, the same on every device that sees the copy. */
const copiedCollectionUid = (uid: string, folder: string): string => `${uid.slice(0, 36)}-${hashText(folder)}`;

/**
 * Takes in the `collection.json` files that changed. One carrying the uid of a
 * collection whose own file is gone is that collection's folder renamed. One
 * whose original is still there is a copy once it has stood beside it long
 * enough (`settledCopy`); it then gets a uid of its own, written to its file,
 * so the files alone tell every device which is which.
 */
export function mergeCollectionFiles(context: MergeContext, readings: readonly CollectionReading[]): void {
  const { metadata, state, result } = context;
  // After the records: moving a collection's record rewrites the paths every record holds into its folder.
  for (const reading of [...readings].sort((a, b) => a.path.localeCompare(b.path))) {
    const id = reading.collection.id;
    let collection = reading.collection;
    const sameUid = Object.values(metadata.collections).find((other) => other.uid === collection.uid && other.id !== id);
    if (sameUid && context.hasCollectionFile(sameUid.id)) {
      if (!context.settledCopy(reading.path)) continue;
      collection = { ...collection, uid: copiedCollectionUid(collection.uid, id) };
    } else if (sameUid) {
      moveCollectionRecord(metadata, sameUid.id, id);
      result.folderMoves.push({ from: collectionFolderPath(sameUid.id), to: collectionFolderPath(id) });
    }
    stamp(state, reading, collectionKey(id));
    delete state.derived[collectionIdentity(collection.uid)];
    // Before this device wrote its library files, its own collection record edited after the file's stays, as records do.
    const indexed = metadata.collections[id];
    if (!context.migrated && indexed?.uid === collection.uid && indexed.modifiedAt > collection.modifiedAt) continue;
    if (sameJson(metadata.collections[id], collection)) continue;
    metadata.collections[id] = collection;
    result.changedCollections.push(id);
    result.changed = true;
  }
}

/** Library facts from `library.json`; a fact it lacks keeps the index's value, and the starter tokens stay added once added anywhere. */
export function mergeLibraryFacts(context: MergeContext, reading: LibraryReading | null): void {
  if (!reading) return;
  const { metadata, state, result } = context;
  stamp(state, reading, LIBRARY_KEY);
  const { facts } = reading;
  if (facts.defaultCollectionId && facts.defaultCollectionId !== metadata.defaultCollectionId) {
    metadata.defaultCollectionId = facts.defaultCollectionId;
    result.changed = true;
  }
  if (facts.vaultId && facts.vaultId !== metadata.vaultId) {
    metadata.vaultId = facts.vaultId;
    result.changed = true;
  }
  if (facts.starterTokensAdded && !metadata.starterTokensAdded) {
    metadata.starterTokensAdded = true;
    result.changed = true;
  }
}
