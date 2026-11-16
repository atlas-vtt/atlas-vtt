import type { LibraryFile, SoundLibrary } from './SoundLibrary';
import { recordsByFile, recordsForFiles, type RecordsSeam } from './libraryRecords';
import { parentOfRelative } from './soundPaths';
import { withChanges, type StoredSound } from './soundRecords';
import type { SoundRecordStore } from './SoundRecordStore';

/** Longer is no row of the rail, and no tag anyone chose. */
const MAX_TAG_LENGTH = 48;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** What two tags are compared by: never the locale's, or two devices would read one list differently. */
export const tagKey = (tag: string): string => tag.trim().toLowerCase();

/** A tag as written by hand, trimmed and cut to length; null where nothing is left. */
export function cleanTag(text: string): string | null {
  const tag = text.trim().slice(0, MAX_TAG_LENGTH).trim();
  return tag === '' ? null : tag;
}

/** What a record holds. Its file arrives unchecked, so what cannot be a tag reads as none. */
function tagsOfRecord({ tags }: Pick<StoredSound, 'tags'>): string[] {
  return Array.isArray(tags) ? tags.flatMap((tag: unknown) => (typeof tag === 'string' ? cleanTag(tag) ?? [] : [])) : [];
}

/** A track's tags: those of its records, and the names of the folders it lies in, which are read and never written. */
export interface TrackTags {
  own: readonly string[];
  folders: readonly string[];
}

export function tagsOfTrack(path: string, records: readonly StoredSound[]): TrackTags {
  const folder = parentOfRelative(path);
  return { own: records.flatMap(tagsOfRecord), folders: folder === '' ? [] : folder.split('/') };
}

const holds = (tags: readonly string[], key: string): boolean => tags.some((tag) => tagKey(tag) === key);

const without = (tags: readonly string[], key: string): string[] => tags.filter((tag) => tagKey(tag) !== key);

export const holdsTag = ({ own, folders }: TrackTags, key: string): boolean => holds(own, key) || holds(folders, key);

/** Each tag once, as first written. */
function distinct(tags: readonly string[]): string[] {
  const byKey = new Map<string, string>();
  for (const tag of tags) if (!byKey.has(tagKey(tag))) byKey.set(tagKey(tag), tag);
  return [...byKey.values()];
}

export const namesOfTrack = ({ own, folders }: TrackTags): string[] => distinct([...own, ...folders]);

/** A tag of a root, and how many of its tracks have it. */
export interface RootTag {
  key: string;
  name: string;
  count: number;
}

/** Every tag of a root's tracks, by name. A tag no track has is none: there is no list of tags besides the tracks. */
export function rootTags(tracks: readonly TrackTags[]): RootTag[] {
  const tags = new Map<string, RootTag>();
  for (const track of tracks) {
    for (const name of namesOfTrack(track)) {
      const key = tagKey(name);
      const held = tags.get(key);
      if (held) held.count++;
      else tags.set(key, { key, name, count: 1 });
    }
  }
  return [...tags.values()].sort((a, b) => collator.compare(a.name, b.name));
}

/** A selection after a press on a tag. */
export function toggledTag(tags: readonly string[], tag: string): string[] {
  const key = tagKey(tag);
  return holds(tags, key) ? without(tags, key) : [...tags, tag];
}

type TagRecords = Pick<SoundRecordStore, 'rewrite' | 'all'>;
type TagFiles = Pick<SoundLibrary, 'audioPathOf' | 'pathNow'>;

const recordsOf = (byFile: ReadonlyMap<string, readonly StoredSound[]>, library: TagFiles, file: LibraryFile): readonly StoredSound[] =>
  byFile.get(library.audioPathOf(file.kind, file.path) ?? '') ?? [];

/** The tags of files as the records stand now. */
export function tagsOfFiles(records: readonly StoredSound[], library: TagFiles, files: readonly LibraryFile[]): TrackTags[] {
  const byFile = recordsByFile(records, library);
  return files.map((file) => tagsOfTrack(file.path, recordsOf(byFile, library, file)));
}

function idsOfFiles(records: readonly StoredSound[], library: TagFiles, files: readonly LibraryFile[]): Set<string> {
  const byFile = recordsByFile(records, library);
  return new Set(files.flatMap((file) => recordsOf(byFile, library, file)).map((sound) => sound.id));
}

/** Adds a tag to the files that lack it. A file that has it through a folder needs nothing, so it gets no record. */
export async function addTag(records: TagRecords & RecordsSeam, library: TagFiles, files: readonly LibraryFile[], tag: string, now = Date.now()): Promise<void> {
  await records.whenLoaded();
  const key = tagKey(tag);
  const held = tagsOfFiles(records.all(), library, files);
  const lacking = files.filter((_, index) => !holdsTag(held[index]!, key));
  await recordsForFiles(records, library, lacking, now);
  const ids = idsOfFiles(records.all(), library, lacking);
  records.rewrite((stored) => (ids.has(stored.id) && !holds(tagsOfRecord(stored), key) ? withChanges(stored, { tags: [...tagsOfRecord(stored), tag] }, now) : null));
}

const withoutTag = (stored: StoredSound, key: string, now: number): StoredSound | null => {
  const tags = tagsOfRecord(stored);
  return holds(tags, key) ? withChanges(stored, { tags: without(tags, key) }, now) : null;
};

/** Takes a tag off files, where their records hold it; a folder's name stays. Makes no record. */
export function takeTagOff(records: TagRecords, library: TagFiles, files: readonly LibraryFile[], tag: string, now = Date.now()): void {
  const ids = idsOfFiles(records.all(), library, files);
  records.rewrite((stored) => (ids.has(stored.id) ? withoutTag(stored, tagKey(tag), now) : null));
}

/** A press on a tag in a menu: off where every file has it, else on where any lacks it. */
export async function toggleTag(records: TagRecords & RecordsSeam, library: TagFiles, files: readonly LibraryFile[], tag: string): Promise<void> {
  await records.whenLoaded();
  if (tagsOfFiles(records.all(), library, files).every((tags) => holdsTag(tags, tagKey(tag)))) takeTagOff(records, library, files, tag);
  else await addTag(records, library, files, tag);
}

/** How many files have the tag in a record, in both roots: what renaming or removing it reaches. None where only folder names give it. */
export function tracksHolding(records: readonly StoredSound[], library: Pick<SoundLibrary, 'pathNow'>, tag: string): number {
  const held = records.filter((sound) => holds(tagsOfRecord(sound), tagKey(tag)));
  return new Set(held.map((sound) => library.pathNow(sound.audioPath, sound.audioSize))).size;
}

/** Renames a tag on every record holding it, in both roots. Onto a tag a record holds already, the two become one. */
export function renameTag(records: Pick<SoundRecordStore, 'rewrite'>, from: string, to: string, now = Date.now()): void {
  const key = tagKey(from);
  records.rewrite((stored) => {
    const tags = tagsOfRecord(stored);
    return holds(tags, key) ? withChanges(stored, { tags: distinct(tags.map((tag) => (tagKey(tag) === key ? to : tag))) }, now) : null;
  });
}

/** Removes a tag from every record holding it, in both roots. */
export function removeTag(records: Pick<SoundRecordStore, 'rewrite'>, tag: string, now = Date.now()): void {
  records.rewrite((stored) => withoutTag(stored, tagKey(tag), now));
}
