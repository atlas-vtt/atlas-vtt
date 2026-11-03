import type { SoundRecord } from '../sound/soundTypes';
import { hashText } from '../utils/hashing';
import type { LibraryFile, SoundLibrary } from './SoundLibrary';
import { nameOfRelative, stemOf } from './soundPaths';
import { soundRecordOf, type SoundChanges, type StoredSound } from './soundRecords';
import type { SoundRecordStore } from './SoundRecordStore';

/**
 * What a file's record is called, worked out from the file alone. Two devices that start to use one file
 * while they cannot see each other make one record, which sync keeps once, whatever their disks are
 * called; a list of numbers would make two and leave a mood on either one.
 */
export function recordIdFor(audioPath: string, turn = 0): string {
  return `sound-${hashText(turn === 0 ? audioPath : `${audioPath}|${turn}`)}`;
}

function draft(file: LibraryFile, audioPath: string, id: string, now: number): StoredSound {
  return {
    id,
    name: stemOf(nameOfRelative(file.path)),
    tags: [],
    createdAt: now,
    modifiedAt: now,
    audioPath,
    audioSize: file.size,
    kind: file.kind,
  };
}

/**
 * A file as the engine reads it, without a record: enough to convert it or preview it, which writes nothing.
 * It has the id the file's record will get.
 */
export function unrecordedSound(file: LibraryFile, audioPath: string): SoundRecord {
  return soundRecordOf(draft(file, audioPath, recordIdFor(audioPath), 0));
}

/** The older of a file's records comes first, so every device reads the same one. */
const byAge = (a: StoredSound, b: StoredSound): number => a.createdAt - b.createdAt || a.id.localeCompare(b.id);

/** Of records that name one file, the one that stands for it. A move on one device and first use on another can make two, which share one copy. */
export const standingRecord = (sounds: readonly StoredSound[]): StoredSound | null => [...sounds].sort(byAge)[0] ?? null;

/**
 * Records by the file each stands for on this device: where it says, else where this device finds a file of that name
 * and size, so one file has one record whichever folder each device keeps it in.
 */
export function recordsByFile(sounds: readonly StoredSound[], library: Pick<SoundLibrary, 'pathNow'>): Map<string, StoredSound[]> {
  const byFile = new Map<string, StoredSound[]>();
  for (const sound of sounds) {
    const path = library.pathNow(sound.audioPath, sound.audioSize);
    byFile.set(path, [...(byFile.get(path) ?? []), sound]);
  }
  return byFile;
}

/** A file as the engine reads it: through its record where it has one. Writes nothing. */
export function soundOfFile(byFile: ReadonlyMap<string, readonly StoredSound[]>, file: LibraryFile, audioPath: string): SoundRecord {
  const held = standingRecord(byFile.get(audioPath) ?? []);
  return held ? soundRecordOf(held) : unrecordedSound(file, audioPath);
}

export type RecordsSeam = Pick<SoundRecordStore, 'whenLoaded' | 'all' | 'add'>;

/** The records of files that enter the mix or a mood, made where missing. */
export async function recordsForFiles(records: RecordsSeam, library: Pick<SoundLibrary, 'audioPathOf' | 'pathNow'>, files: readonly LibraryFile[], now = Date.now()): Promise<SoundRecord[]> {
  await records.whenLoaded();
  const sounds = records.all();
  const byFile = recordsByFile(sounds, library);
  const taken = new Set(sounds.map((sound) => sound.id));
  const fresh: StoredSound[] = [];
  const made = files.flatMap((file): SoundRecord[] => {
    const audioPath = library.audioPathOf(file.kind, file.path);
    if (audioPath === null) return [];
    const held = standingRecord(byFile.get(audioPath) ?? []);
    if (held) return [soundRecordOf(held)];
    let turn = 0;
    while (taken.has(recordIdFor(audioPath, turn))) turn++;
    const id = recordIdFor(audioPath, turn);
    taken.add(id);
    const sound = draft(file, audioPath, id, now);
    fresh.push(sound);
    byFile.set(audioPath, [sound]);
    return [soundRecordOf(sound)];
  });
  if (fresh.length > 0) records.add(fresh);
  return made;
}

/** The library's editors: trim and tags belong to the file, so they change every record of it, one made where it has none. */
export async function editFiles(records: RecordsSeam & Pick<SoundRecordStore, 'update'>, library: Pick<SoundLibrary, 'audioPathOf' | 'pathNow'>, files: readonly LibraryFile[], changes: SoundChanges): Promise<void> {
  await recordsForFiles(records, library, files);
  const byFile = recordsByFile(records.all(), library);
  records.update(files.flatMap((file) => byFile.get(library.audioPathOf(file.kind, file.path) ?? '') ?? []).map((sound) => sound.id), changes);
}
