import type { AssetMetadata } from '../AssetService';
import type { PathMove } from '../renamedPaths';
import type { FileReading } from './libraryReader';
import type { FileStamp, LibraryState } from './libraryState';
import type { KeptSceneIndexData } from '../sceneIndexData';

export interface LibraryMergeResult {
  changed: boolean;
  /** Record files that hold a record another file already holds (copies a sync tool made on a conflict); left alone. */
  duplicates: string[];
  /** Collections whose record changed on disk, so open maps can apply their rules. */
  changedCollections: string[];
  /** Collection folders renamed outside Atlas, recognised by the `collection.json` they carried along. */
  folderMoves: PathMove[];
  /** When files that look like copies have stood long enough to be taken in as copies; null when none wait. */
  retryAt: number | null;
}

/** What one merge works on and reports into. */
export interface MergeContext {
  metadata: AssetMetadata;
  state: LibraryState;
  /** Whether this device has written its library files; before that, the index is the only copy of its records. */
  migrated: boolean;
  hasCollectionFile: (collectionId: string) => boolean;
  /** Whether a file that looks like a copy has stood long enough to be one (`COPY_SETTLE_MS`); notes when it is first seen. */
  settledCopy: (path: string) => boolean;
  /**
   * Index-only data of scenes that left the index because their file went, by id, kept for the session: a scene
   * whose file moves (another device moved it to another collection) may vanish in one read and come back from its
   * new path in the next, and takes that data back then. Never filled from a file.
   */
  droppedIndexData?: Map<string, KeptSceneIndexData>;
  result: LibraryMergeResult;
}

export const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function stamp(state: LibraryState, reading: FileReading, key: string): void {
  const entry: FileStamp = { key, hash: reading.hash, mtime: reading.mtime, size: reading.size };
  if (reading.newer) entry.readOnly = true;
  state.files[reading.path] = entry;
}
