import type { SoundKind } from '../../../../../sound/soundTypes';
import { sortKey, type IndexedFile } from '../../../../../soundLibrary/FolderTree';
import type { LibraryEntry } from '../../../../../soundLibrary/libraryOperations';
import type { LibraryFile, SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { parentOfRelative, stemOf } from '../../../../../soundLibrary/soundPaths';
import type { StoredSound } from '../../../../../soundLibrary/soundRecords';
import { namesOfTrack, tagKey, tagsOfNames, tagsOfTrack, type RootTag } from '../../../../../soundLibrary/soundTags';

interface RowOf {
  id: string;
  name: string;
  /** The faint text beside the name: a row's tags, a search hit's place. */
  where: string;
  tagKeys: readonly string[];
  /** What a sort by name compares, worked out once with the row (`sortKey`): plain `<`, no collator. */
  order: string;
}

export type LibraryRow =
  | RowOf & { type: 'file'; file: LibraryFile }
  /** A record whose file is not where it says. */
  | RowOf & { type: 'waiting'; sound: StoredSound };

/** All a root holds: every track at any depth, by name, and the tags among them. */
export interface RootShelf {
  rows: readonly LibraryRow[];
  tags: readonly RootTag[];
}

const rowIdOf = (kind: SoundKind, path: string): string => `${kind}:${path}`;

/** The records of a root that no file on this device answers to. On a device without the root that is every record of it. Nothing can be said before the root was read. */
export function waitingIn(library: Pick<SoundLibrary, 'fileOfAudioPath' | 'pathNow'>, sounds: readonly StoredSound[], kind: SoundKind, reachable: boolean, here: ReadonlySet<string>): { sound: StoredSound; path: string }[] {
  return sounds.flatMap((sound) => {
    const place = library.fileOfAudioPath(sound.audioPath);
    if (!place || place.kind !== kind) return [];
    const missing = !reachable || (!here.has(place.path) && library.pathNow(sound.audioPath, sound.audioSize) === sound.audioPath);
    return missing ? [{ sound, path: place.path }] : [];
  });
}

/** What a file's row was made of, kept while its index entry stands: a walk's report then reads its tags and row again only where its records changed. */
interface FileShelf {
  kind: SoundKind;
  records: readonly StoredSound[];
  /** Its tags' names, each once (`namesOfTrack`), and their keys. */
  names: readonly string[];
  keys: readonly string[];
  row: LibraryRow | null;
}

const NO_RECORDS: readonly StoredSound[] = [];
const fileShelves = new WeakMap<IndexedFile, FileShelf>();

const sameRecords = (a: readonly StoredSound[], b: readonly StoredSound[]): boolean => a === b || (a.length === b.length && a.every((sound, index) => sound === b[index]));

function fileShelfOf(file: IndexedFile, kind: SoundKind, records: readonly StoredSound[]): FileShelf {
  const held = fileShelves.get(file);
  if (held && held.kind === kind && sameRecords(held.records, records)) return held;
  const names = namesOfTrack(tagsOfTrack(file.entry.path, records));
  const shelf: FileShelf = { kind, records, names, keys: names.map(tagKey), row: null };
  fileShelves.set(file, shelf);
  return shelf;
}

/**
 * A root's shelf. Costs a pass over its files, so it is worked out only when they, the records or the copies read
 * changed. A source beside its own Atlas copy is the copy's, and only the copy is listed. A file whose records and
 * tags are as before keeps its row object, so the rows memoised on it render nothing.
 */
export function shelfOf(library: SoundLibrary, sounds: readonly StoredSound[], byFile: ReadonlyMap<string, readonly StoredSound[]>, kind: SoundKind): RootShelf {
  const reachable = library.locationOf(kind) !== null;
  const all = library.filesOf(kind);
  const files = all.filter(({ entry }) => !library.isCopied(kind, entry.path))
    .map((file) => ({ file, shelf: fileShelfOf(file, kind, byFile.get(library.audioPathOf(kind, file.entry.path) ?? '') ?? NO_RECORDS) }));
  const waiting = reachable && !library.isWalked(kind)
    ? []
    : waitingIn(library, sounds, kind, reachable, new Set(all.map(({ entry }) => entry.path))).map(({ sound, path }) => {
      return { sound, names: namesOfTrack(tagsOfTrack(path, [sound])) };
    });
  const tags = tagsOfNames([...files.map(({ shelf }) => shelf.names), ...waiting.map(({ names }) => names)]);
  const nameOf = new Map(tags.map((tag) => [tag.key, tag.name]));
  const whereOf = (keys: readonly string[]): string => keys.map((key) => nameOf.get(key)).join(' · ');
  const fileRow = ({ file, shelf }: (typeof files)[number]): LibraryRow => {
    const where = whereOf(shelf.keys);
    if (shelf.row?.where !== where) {
      const { entry, order } = file;
      shelf.row = { type: 'file', id: rowIdOf(kind, entry.path), file: { ...entry, kind }, name: stemOf(entry.name), order, where, tagKeys: shelf.keys };
    }
    return shelf.row;
  };
  return {
    tags,
    rows: [
      ...files.map(fileRow),
      ...waiting.map(({ sound, names }): LibraryRow => {
        const keys = names.map(tagKey);
        return { type: 'waiting', id: sound.id, sound, name: sound.name, order: `${sortKey(sound.name)}\0${sound.id}`, where: whereOf(keys), tagKeys: keys };
      }),
    ],
  };
}

/** The rows with all of these tags; the same list where there are none. */
export const rowsWithTags = (rows: readonly LibraryRow[], keys: readonly string[]): readonly LibraryRow[] =>
  (keys.length === 0 ? rows : rows.filter((row) => keys.every((key) => row.tagKeys.includes(key))));

export const filesOfRows = (rows: readonly LibraryRow[]): LibraryFile[] => rows.flatMap((row) => (row.type === 'file' ? [row.file] : []));

/** A search's row of each file found, while it is the same file and its root keeps its name: typing on renders no row found before. */
const searchRowOf = new WeakMap<LibraryFile, LibraryRow>();

export const searchRows = (hits: readonly LibraryFile[], rootName: (kind: SoundKind) => string): LibraryRow[] =>
  hits.map((file) => {
    const folder = parentOfRelative(file.path);
    const where = [rootName(file.kind), ...(folder === '' ? [] : folder.split('/'))].join(' / ');
    const held = searchRowOf.get(file);
    if (held?.where === where) return held;
    const row: LibraryRow = { type: 'file', id: rowIdOf(file.kind, file.path), file, name: stemOf(file.name), order: `${sortKey(file.name)}\0${file.kind}\0${file.path}`, tagKeys: [], where };
    searchRowOf.set(file, row);
    return row;
  });

export const entryOfRow = (row: LibraryRow): LibraryEntry | null => (row.type === 'file' ? { kind: row.file.kind, path: row.file.path } : null);

/** Minutes and seconds, as a track's length is read. */
export function formatLength(seconds: number): string {
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** The selection after a press on a row: a plain press takes it, Cmd or Ctrl adds or takes away, Shift reaches from the anchor. */
export function selectionAfter(rows: readonly LibraryRow[], selected: ReadonlySet<string>, anchor: string | null, id: string, mode: { toggle: boolean; range: boolean }): { selected: Set<string>; anchor: string } {
  if (mode.range && anchor !== null) {
    const from = rows.findIndex((row) => row.id === anchor);
    const to = rows.findIndex((row) => row.id === id);
    if (from >= 0 && to >= 0) {
      const [low, high] = from < to ? [from, to] : [to, from];
      return { selected: new Set(rows.slice(low, high + 1).map((row) => row.id)), anchor };
    }
  }
  if (mode.toggle) {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    return { selected: next, anchor: id };
  }
  return { selected: new Set([id]), anchor: id };
}
