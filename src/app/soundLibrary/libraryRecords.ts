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
    licence: 'unknown',
    streaming: 'unknown',
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

/** A file's record. A move on one device and first use on another can make two, which name one file and one copy. */
export function recordOfFile(sounds: readonly StoredSound[], audioPath: string): StoredSound | null {
  return sounds.filter((sound) => sound.audioPath === audioPath).sort(byAge)[0] ?? null;
}

/** A file as the engine reads it: through its record where it has one. Writes nothing. */
export function soundOfFile(sounds: readonly StoredSound[], file: LibraryFile, audioPath: string): SoundRecord {
  const held = recordOfFile(sounds, audioPath);
  return held ? soundRecordOf(held) : unrecordedSound(file, audioPath);
}

export type RecordsSeam = Pick<SoundRecordStore, 'whenLoaded' | 'all' | 'add'>;

/** The records of files that enter the mix or a mood, made where missing. */
export async function recordsForFiles(records: RecordsSeam, library: Pick<SoundLibrary, 'audioPathOf'>, files: readonly LibraryFile[], now = Date.now()): Promise<SoundRecord[]> {
  await records.whenLoaded();
  const sounds = records.all();
  const taken = new Set(sounds.map((sound) => sound.id));
  const fresh: StoredSound[] = [];
  const made = files.flatMap((file): SoundRecord[] => {
    const audioPath = library.audioPathOf(file.kind, file.path);
    if (audioPath === null) return [];
    const held = recordOfFile([...sounds, ...fresh], audioPath);
    if (held) return [soundRecordOf(held)];
    let turn = 0;
    while (taken.has(recordIdFor(audioPath, turn))) turn++;
    const id = recordIdFor(audioPath, turn);
    taken.add(id);
    const sound = draft(file, audioPath, id, now);
    fresh.push(sound);
    return [soundRecordOf(sound)];
  });
  if (fresh.length > 0) records.add(fresh);
  return made;
}

/** The library's editors: trim, licence, credit and tags belong to the file, so they change every record of it, one made where it has none. */
export async function editFiles(records: RecordsSeam & Pick<SoundRecordStore, 'update'>, library: Pick<SoundLibrary, 'audioPathOf'>, files: readonly LibraryFile[], changes: SoundChanges): Promise<void> {
  await recordsForFiles(records, library, files);
  const paths = new Set(files.flatMap((file) => library.audioPathOf(file.kind, file.path) ?? []));
  records.update(records.all().filter((sound) => paths.has(sound.audioPath)).map((sound) => sound.id), changes);
}
