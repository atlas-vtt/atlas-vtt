import type { AssetService, SoundAsset } from '../services/AssetService';
import type { SoundRecord } from '../sound/soundTypes';
import { hashText } from '../utils/hashing';
import type { LibraryFile, SoundLibrary } from './SoundLibrary';
import { nameOfRelative, stemOf } from './soundPaths';
import { soundRecordOf, updateSounds, type SoundChanges } from './soundRecords';

/**
 * What a file's record is called, worked out from the collection and the file. Two devices that start to
 * use one file while they cannot see each other make one record, which sync keeps once, whatever their
 * disks are called; a list of numbers would make two and leave a mood on either one.
 */
export function recordIdFor(collectionId: string, audioPath: string, turn = 0): string {
  return `sound-${hashText(`${collectionId}|${audioPath}${turn === 0 ? '' : `|${turn}`}`)}`;
}

function draft(file: LibraryFile, audioPath: string, collectionId: string, id: string, now: number): SoundAsset {
  return {
    id,
    type: 'sound',
    name: stemOf(nameOfRelative(file.path)),
    tags: [],
    collection: collectionId,
    createdAt: now,
    modifiedAt: now,
    audioPath,
    audioSize: file.size,
    kind: file.kind,
    licence: 'unknown',
    streaming: 'unknown',
  };
}

/**
 * A file as the engine reads it, without a record: enough to convert it or preview it, which writes nothing.
 * It has the id the file's record will get.
 */
export function unrecordedSound(file: LibraryFile, audioPath: string, collectionId: string): SoundRecord {
  return soundRecordOf(draft(file, audioPath, collectionId, recordIdFor(collectionId, audioPath), 0));
}

/** The older of a file's records comes first, so every device reads the same one. */
const byAge = (a: SoundAsset, b: SoundAsset): number => a.createdAt - b.createdAt || a.id.localeCompare(b.id);

/** A file's record in the collection in use, else in any other. */
export function recordOfFile(sounds: readonly SoundAsset[], audioPath: string, collectionId: string | null): SoundAsset | null {
  const held = sounds.filter((sound) => sound.audioPath === audioPath).sort(byAge);
  return held.find((sound) => sound.collection === collectionId) ?? held[0] ?? null;
}

/**
 * The records of files that enter the mix or a mood, made where missing. A record belongs to the
 * collection of the mood or mix in use, and a file used from two collections has one record in each, with
 * trim, licence and credit of its own: a collection travels with its records, and no record is ever taken
 * from another collection.
 */
export async function recordsForFiles(assets: Pick<AssetService, 'runExclusive' | 'getAssets' | 'addIdentifiedAssets'>, library: Pick<SoundLibrary, 'audioPathOf'>, files: readonly LibraryFile[], collectionId: string, now = Date.now()): Promise<SoundRecord[]> {
  return assets.runExclusive(async () => {
    const sounds = await assets.getAssets(undefined, 'sound');
    const taken = new Set(sounds.map((sound) => sound.id));
    const fresh: SoundAsset[] = [];
    const records = files.flatMap((file): SoundRecord[] => {
      const audioPath = library.audioPathOf(file.kind, file.path);
      if (audioPath === null) return [];
      const held = sounds.filter((sound) => sound.collection === collectionId && sound.audioPath === audioPath).sort(byAge)[0];
      if (held) return [soundRecordOf(held)];
      let turn = 0;
      while (taken.has(recordIdFor(collectionId, audioPath, turn))) turn++;
      const id = recordIdFor(collectionId, audioPath, turn);
      taken.add(id);
      const made = draft(file, audioPath, collectionId, id, now);
      fresh.push(made);
      return [soundRecordOf(made)];
    });
    if (fresh.length > 0) await assets.addIdentifiedAssets(fresh);
    return records;
  });
}

/**
 * The library's editors: trim, licence, credit and tags belong to the file, so they change every record of
 * it. A file without one gets its first in the collection in use.
 */
export async function editFiles(assets: AssetService, library: Pick<SoundLibrary, 'audioPathOf'>, files: readonly LibraryFile[], collectionId: string, changes: SoundChanges): Promise<void> {
  const sounds = await assets.getAssets(undefined, 'sound');
  const paths = new Set(files.flatMap((file) => library.audioPathOf(file.kind, file.path) ?? []));
  const unheld = files.filter((file) => !sounds.some((sound) => sound.audioPath === library.audioPathOf(file.kind, file.path)));
  const fresh = unheld.length > 0 ? await recordsForFiles(assets, library, unheld, collectionId) : [];
  const ids = [...sounds.filter((sound) => paths.has(sound.audioPath)).map((sound) => sound.id), ...fresh.map((record) => record.id)];
  await updateSounds(assets, ids, changes);
}
