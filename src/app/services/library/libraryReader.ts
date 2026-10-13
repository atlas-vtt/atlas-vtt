import { TFolder, type App, type TFile } from 'obsidian';
import { COLLECTIONS_DIR } from '../assetPaths';
import type { Asset, CollectionMetadata } from '../AssetService';
import { collectionOfCollectionFile, isLibraryFile, isRecordFileCandidate, LIBRARY_FILE } from './libraryPaths';
import { parseCollectionFile, parseLibraryFile, type LibraryFacts } from './collectionFile';
import { parseRecordFile } from './recordFile';
import { originalOfCopy } from './recordHolders';
import { idOfKey, type FileStamp, type LibraryState } from './libraryState';
import { hashText } from '../../utils/hashing';

/** How a file was found on disk: what its stamp will say once the change is taken in. */
export interface FileReading {
  path: string;
  hash: string;
  mtime: number;
  size: number;
  /** Written by a newer Atlas, whose format this version must not rewrite. */
  newer: boolean;
}

export interface RecordReading extends FileReading {
  record: Asset;
  /** The collection the record was written for; see `ParsedRecordFile.writtenFor`. */
  writtenFor: string | null;
}

/** A record file without a record: the payload an older Atlas wrote for an asset the index knows by this file. */
export interface PayloadReading extends FileReading {
  payload: Record<string, unknown>;
}

export interface CollectionReading extends FileReading {
  collection: CollectionMetadata;
}

export interface LibraryReading extends FileReading {
  facts: LibraryFacts;
}

/** The library files that changed on disk since this device last read or wrote them. */
export interface LibraryChanges {
  records: RecordReading[];
  payloads: PayloadReading[];
  collections: CollectionReading[];
  library: LibraryReading | null;
  /** Files this device knew that are gone, with the stamp they had. */
  removed: Array<{ path: string; stamp: FileStamp }>;
  /** Files that are unchanged but were found with a new modification time. */
  touched: FileReading[];
}

const readingOf = (file: TFile, hash: string, newer: boolean): FileReading =>
  ({ path: file.path, hash, mtime: file.stat.mtime, size: file.stat.size, newer });

/**
 * Reads every library file that changed since it was last stamped: new files,
 * files whose size or time differ and whose content then differs too. Files
 * that cannot be parsed are left out (and read again next time).
 */
export async function readLibraryChanges(app: App, state: LibraryState, recordFormat: number, fileFormat: number): Promise<LibraryChanges> {
  const changes: LibraryChanges = { records: [], payloads: [], collections: [], library: null, removed: [], touched: [] };
  const present = new Set<string>();
  for (const file of app.vault.getFiles()) {
    if (!isLibraryFile(file.path)) continue;
    present.add(file.path);
    const stamp = state.files[file.path];
    if (stamp && stamp.mtime === file.stat.mtime && stamp.size === file.stat.size) continue;
    const text = await app.vault.read(file);
    const hash = hashText(text);
    if (stamp?.hash === hash) {
      changes.touched.push(readingOf(file, hash, Boolean(stamp.readOnly)));
      continue;
    }
    classify(changes, file, text, hash, recordFormat, fileFormat);
  }
  // A vault without any collection folder is not listed yet (the default collection's folder always exists): nothing counts as gone.
  if (hasCollectionFolder(app)) {
    for (const [path, stamp] of Object.entries(state.files)) {
      if (!present.has(path)) changes.removed.push({ path, stamp });
    }
  }
  await readOtherHolders(app, state, changes, recordFormat);
  return changes;
}

/** The record id a stamped file holds; a copy's file holds the record it was copied from. */
function recordIdOf(key: string): string | null {
  const copied = idOfKey(key, 'copy');
  return copied !== null ? originalOfCopy(copied) : idOfKey(key, 'asset') ?? idOfKey(key, 'duplicate');
}

/**
 * When a file holding a record changed or went, every other file holding it is
 * read too, so the file the record lives in is chosen from all of them, by
 * their content alone, the same on every device.
 */
async function readOtherHolders(app: App, state: LibraryState, changes: LibraryChanges, recordFormat: number): Promise<void> {
  const ids = new Set([
    ...changes.records.map((reading) => reading.record.id),
    ...changes.removed.map(({ stamp }) => recordIdOf(stamp.key)).filter((id): id is string => id !== null),
  ]);
  const read = new Set(changes.records.map((reading) => reading.path));
  for (const [path, stamp] of Object.entries(state.files)) {
    const id = recordIdOf(stamp.key);
    if (!id || !ids.has(id) || read.has(path)) continue;
    const file = app.vault.getFileByPath(path);
    if (!file) continue;
    const text = await app.vault.read(file);
    const parsed = parseRecordFile(text, path);
    if (parsed?.record) changes.records.push({ ...readingOf(file, hashText(text), (parsed.format ?? 0) > recordFormat), record: parsed.record, writtenFor: parsed.writtenFor });
  }
}

const hasCollectionFolder = (app: App): boolean =>
  (app.vault.getFolderByPath(COLLECTIONS_DIR)?.children ?? []).some((child) => child instanceof TFolder);

function classify(changes: LibraryChanges, file: TFile, text: string, hash: string, recordFormat: number, fileFormat: number): void {
  if (file.path === LIBRARY_FILE) {
    const parsed = parseLibraryFile(text);
    if (parsed) changes.library = { ...readingOf(file, hash, parsed.format > fileFormat), facts: parsed.value };
    return;
  }
  const collectionId = collectionOfCollectionFile(file.path);
  if (collectionId !== null) {
    const parsed = parseCollectionFile(text, collectionId);
    if (parsed) changes.collections.push({ ...readingOf(file, hash, parsed.format > fileFormat), collection: parsed.value });
    return;
  }
  if (!isRecordFileCandidate(file.path)) return;
  const parsed = parseRecordFile(text, file.path);
  if (!parsed) return;
  if (parsed.record) changes.records.push({ ...readingOf(file, hash, (parsed.format ?? 0) > recordFormat), record: parsed.record, writtenFor: parsed.writtenFor });
  else if (parsed.format === null) changes.payloads.push({ ...readingOf(file, hash, false), payload: parsed.payload });
}
