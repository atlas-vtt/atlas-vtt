import type { SoundKind } from '../../../../../sound/soundTypes';
import type { LibraryEntry } from '../../../../../soundLibrary/libraryOperations';
import type { LibraryFile, SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { parentOfRelative, stemOf } from '../../../../../soundLibrary/soundPaths';
import type { StoredSound } from '../../../../../soundLibrary/soundRecords';
import { namesOfTrack, rootTags, tagKey, tagsOfTrack, type RootTag, type TrackTags } from '../../../../../soundLibrary/soundTags';

interface RowOf {
  id: string;
  name: string;
  /** The faint text beside the name: a row's tags, a search hit's place. */
  where: string;
  tagKeys: readonly string[];
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

/** A root's shelf. Costs a pass over its files, so it is worked out only when they or the records changed. */
export function shelfOf(library: SoundLibrary, sounds: readonly StoredSound[], byFile: ReadonlyMap<string, readonly StoredSound[]>, kind: SoundKind): RootShelf {
  const reachable = library.locationOf(kind) !== null;
  const files = library.filesOf(kind).map(({ entry }) => ({ entry, tags: tagsOfTrack(entry.path, byFile.get(library.audioPathOf(kind, entry.path) ?? '') ?? []) }));
  const waiting = reachable && !library.isWalked(kind)
    ? []
    : waitingIn(library, sounds, kind, reachable, new Set(files.map(({ entry }) => entry.path))).map(({ sound, path }) => ({ sound, tags: tagsOfTrack(path, [sound]) }));
  const tags = rootTags([...files, ...waiting].map((track) => track.tags));
  const nameOf = new Map(tags.map((tag) => [tag.key, tag.name]));
  const shown = (track: TrackTags): Pick<RowOf, 'where' | 'tagKeys'> => {
    const keys = namesOfTrack(track).map(tagKey);
    return { where: keys.map((key) => nameOf.get(key)).join(' · '), tagKeys: keys };
  };
  return {
    tags,
    rows: [
      ...files.map(({ entry, tags: track }): LibraryRow => ({ ...shown(track), type: 'file', id: rowIdOf(kind, entry.path), file: { ...entry, kind }, name: stemOf(entry.name) })),
      ...waiting.map(({ sound, tags: track }): LibraryRow => ({ ...shown(track), type: 'waiting', id: sound.id, sound, name: sound.name })),
    ],
  };
}

/** The rows with all of these tags; the same list where there are none. */
export const rowsWithTags = (rows: readonly LibraryRow[], keys: readonly string[]): readonly LibraryRow[] =>
  (keys.length === 0 ? rows : rows.filter((row) => keys.every((key) => row.tagKeys.includes(key))));

export const filesOfRows = (rows: readonly LibraryRow[]): LibraryFile[] => rows.flatMap((row) => (row.type === 'file' ? [row.file] : []));

export const searchRows = (hits: readonly LibraryFile[], rootName: (kind: SoundKind) => string): LibraryRow[] =>
  hits.map((file) => {
    const folder = parentOfRelative(file.path);
    return { type: 'file', id: rowIdOf(file.kind, file.path), file, name: stemOf(file.name), tagKeys: [], where: [rootName(file.kind), ...(folder === '' ? [] : folder.split('/'))].join(' / ') };
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
