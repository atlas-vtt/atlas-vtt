import type { Asset, AssetMetadata } from '../AssetService';
import type { LibraryChanges, PayloadReading, RecordReading } from './libraryReader';
import { recordFilePath } from './libraryPaths';
import { isPayloadUnread } from './recordFile';
import { assetKey, copyKey, duplicateKey, idOfKey, type FileStamp, type LibraryState } from './libraryState';
import { copyId, placedRecord, resolveHolders } from './recordHolders';
import { mergeCollectionFiles, mergeLibraryFacts } from './mergeCollections';
import { sameJson, stamp, type LibraryMergeResult, type MergeContext } from './mergeShared';

export type { LibraryMergeResult } from './mergeShared';

const PAYLOAD_TYPES: ReadonlySet<string> = new Set(['scene', 'encounter', 'player', 'character', 'statblock']);
const MIRRORED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  encounter: ['tokens', 'difficulty', 'formation'],
  player: ['tokens', 'level', 'class'],
};

/** Whether a file this device read or wrote holds `id` as a record of its own. */
const hasOwnFile = (state: LibraryState, id: string): boolean => Object.values(state.files).some((entry) => entry.key === assetKey(id));

/**
 * Takes the library files that changed on disk into the index: their content
 * wins over the index, which is only this device's cache of them. A record
 * whose file is gone leaves the index once this device has written its library
 * files (`migrated`); before that, the index is the only copy of its records.
 * Updates the stamps in `state` to what was read.
 */
export function mergeLibraryChanges(
  metadata: AssetMetadata,
  state: LibraryState,
  changes: LibraryChanges,
  migrated: boolean,
  vault: Pick<MergeContext, 'hasCollectionFile' | 'settledCopy'>,
): LibraryMergeResult {
  const result: LibraryMergeResult = { changed: false, duplicates: [], changedCollections: [], folderMoves: [], retryAt: null };
  const context: MergeContext = { metadata, state, migrated, ...vault, result };

  for (const reading of changes.touched) {
    const previous = state.files[reading.path];
    if (previous) state.files[reading.path] = { ...previous, mtime: reading.mtime, size: reading.size };
  }
  const upserted = mergeRecords(context, changes.records);
  mergePayloads(context, changes.payloads);
  mergeCollectionFiles(context, changes.collections);
  mergeLibraryFacts(context, changes.library);
  dropRecordsWhoseFileWent(context, changes.removed, upserted);
  return result;
}

/** Takes in the record files that changed, deciding for each id which file holds it; returns the ids taken in. */
function mergeRecords(context: MergeContext, readings: readonly RecordReading[]): Set<string> {
  const { state, result } = context;
  const upserted = new Set<string>();
  const byId = new Map<string, RecordReading[]>();
  for (const reading of readings) byId.set(reading.record.id, [...(byId.get(reading.record.id) ?? []), reading]);

  for (const [id, holders] of byId) {
    const { winner, duplicates, copies } = resolveHolders(holders);
    for (const reading of duplicates) {
      result.duplicates.push(reading.path);
      stamp(state, reading, duplicateKey(id));
    }
    takeIn(context, placedRecord(winner), winner, upserted);
    for (const reading of copies) {
      // Taken in once it has stood long enough: until then it may be another device's move arriving in halves.
      if (!context.settledCopy(reading.path)) continue;
      const copied = copyId(id, reading.path);
      stamp(state, reading, copyKey(copied));
      // Written as a record of its own already, its old file is what the copy left behind; the writer clears it.
      if (hasOwnFile(state, copied)) continue;
      upsert(context, { ...placedRecord(reading), id: copied }, upserted);
    }
  }
  return upserted;
}

/**
 * Takes a record in from the file it lives in; a file that stood for a copy until now hands it back to its record.
 * Before this device has written its library files, its index was its own copy of the library, so an entry
 * edited here no earlier than the file's version stays and is written over the file at the first save.
 */
function takeIn(context: MergeContext, record: Asset, reading: RecordReading, upserted: Set<string>): void {
  const { metadata, state, result } = context;
  const formerCopy = idOfKey(state.files[reading.path]?.key ?? '', 'copy');
  stamp(state, reading, assetKey(record.id));
  delete state.derived[assetKey(record.id)];
  const indexed = metadata.assets[record.id];
  // A tie stays too: an older version followed an art rename into encounter refs without stamping `modifiedAt`.
  if (!context.migrated && indexed && indexed.modifiedAt >= record.modifiedAt) {
    upserted.add(record.id);
    return;
  }
  upsert(context, record, upserted);
  if (formerCopy && formerCopy !== record.id && !hasOwnFile(state, formerCopy) && metadata.assets[formerCopy]) {
    delete metadata.assets[formerCopy];
    delete state.derived[assetKey(formerCopy)];
    result.changed = true;
  }
}

function upsert(context: MergeContext, record: Asset, upserted: Set<string>): void {
  upserted.add(record.id);
  if (sameJson(context.metadata.assets[record.id], record)) return;
  context.metadata.assets[record.id] = record;
  context.result.changed = true;
}

/**
 * Payloads older versions wrote into the JSON of records the index knows. Until
 * this device has written its library files, its index is what older versions
 * kept current: they rewrote token refs of encounters and parties in the index
 * alone, after a token edit or an art rename (the latter without touching
 * `modifiedAt`), so neither time tells a stale file from a newer one. A payload
 * the index holds stays and is written over the file; one it lacks comes from
 * the file. An edit another device made reaches this one through its record
 * file once that device migrated, where the later edit wins (`takeIn`). Once
 * migrated, the file's payload wins, as records do.
 */
function mergePayloads(context: MergeContext, readings: readonly PayloadReading[]): void {
  if (readings.length === 0) return;
  const { metadata, state, migrated, result } = context;
  const byPath = new Map<string, Asset>();
  for (const asset of Object.values(metadata.assets)) {
    if (PAYLOAD_TYPES.has(asset.type)) byPath.set(recordFilePath(asset), asset);
  }
  for (const reading of readings) {
    const asset = byPath.get(reading.path);
    if (!asset) continue;
    stamp(state, reading, assetKey(asset.id));
    if (!migrated && !isPayloadUnread(asset)) continue;
    if (sameJson('data' in asset ? asset.data : undefined, reading.payload)) continue;
    const updated: Record<string, unknown> = { ...asset, data: reading.payload };
    for (const key of MIRRORED_FIELDS[asset.type] ?? []) {
      if (key in reading.payload) updated[key] = reading.payload[key];
    }
    Object.assign(asset, updated);
    result.changed = true;
  }
}

/** Records whose file went leave the index, unless the record was taken in from another file. */
function dropRecordsWhoseFileWent(context: MergeContext, removed: ReadonlyArray<{ path: string; stamp: FileStamp }>, upserted: ReadonlySet<string>): void {
  const { metadata, state, migrated, result } = context;
  for (const { path, stamp: entry } of removed) {
    delete state.files[path];
    const own = idOfKey(entry.key, 'asset');
    const copied = idOfKey(entry.key, 'copy');
    const id = own ?? copied;
    const asset = id ? metadata.assets[id] : undefined;
    if (!migrated || !id || !asset || upserted.has(id)) continue;
    if (own && recordFilePath(asset) !== path) continue;
    if (copied && hasOwnFile(state, copied)) continue;
    delete metadata.assets[id];
    delete state.derived[assetKey(id)];
    result.changed = true;
  }
}
