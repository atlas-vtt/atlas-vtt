import type { Asset } from '../AssetService';
import { collectionFolderPath } from '../assetPaths';
import { mapStrings } from '../../utils/mapStrings';
import { baseName, parentPath } from '../../utils/pathUtils';
import type { RecordReading } from './libraryReader';
import { hashText } from '../../utils/hashing';

/** How the files holding one record id are taken in. */
export interface HolderResolution {
  /** The file the record lives in. */
  winner: RecordReading;
  /** Other versions of the same record (a conflict copy, a move on one device and an edit on another): left alone. */
  duplicates: RecordReading[];
  /** Files a copied collection folder brought: each is a record of its own. */
  copies: RecordReading[];
}

/** Whether the file was written for the collection whose folder holds it; a copied folder's files were not. */
const atHome = (reading: RecordReading): boolean => reading.writtenFor === null || reading.writtenFor === reading.record.collection;

/** Whether the file is named as Atlas names a record's file, which copies a sync tool makes on a conflict never are. */
const hasRecordName = (reading: RecordReading): boolean => baseName(reading.path) === `${reading.record.id}.json`;

/**
 * Decides which file holds a record when several carry its id, from the
 * holders' content and place alone, so every device decides the same. Files
 * written for the folder they lie in are versions of the record (a conflict
 * copy, or a move on one device racing an edit on another): one named for the
 * record wins, then the newest edit, then the first path; the vault check then
 * follows its art or map if that moved. Files written for another collection's
 * folder came with a copied folder and become records of their own; when no
 * file is at home, they are the record moved and the first of them holds it.
 */
export function resolveHolders(readings: readonly RecordReading[]): HolderResolution {
  const home = readings.filter(atHome);
  const [winner] = [...(home.length > 0 ? home : readings)].sort((a, b) =>
    Number(hasRecordName(b)) - Number(hasRecordName(a))
    || b.record.modifiedAt - a.record.modifiedAt
    || a.path.localeCompare(b.path));
  const others = readings.filter((reading) => reading !== winner);
  const isCopy = (reading: RecordReading): boolean =>
    (home.length > 0 ? !atHome(reading) : true) && parentPath(reading.path) !== parentPath(winner!.path);
  return { winner: winner!, duplicates: others.filter((reading) => !isCopy(reading)), copies: others.filter(isCopy) };
}

/**
 * The record as it belongs where its file lies: paths into the folder of the
 * collection it was written for point into its own folder instead, as for a
 * collection folder copied or renamed outside Atlas.
 */
export function placedRecord(reading: RecordReading): Asset {
  const { record, writtenFor } = reading;
  if (writtenFor === null || writtenFor === record.collection) return record;
  const from = `${collectionFolderPath(writtenFor)}/`;
  const to = `${collectionFolderPath(record.collection)}/`;
  return mapStrings(record, (text) => (text.startsWith(from) ? to + text.slice(from.length) : text));
}

/** The id a copy of record `id` gets: worked out from where the copy lies, so every device gives it the same. */
export const copyId = (id: string, path: string): string => `${id}-copy-${hashText(path)}`;

/** The record a copy's id was made from. */
export const originalOfCopy = (id: string): string => id.replace(/-copy-[a-z0-9]+$/, '');
