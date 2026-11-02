import type { SoundAsset } from '../../../../../services/AssetService';
import type { SoundKind } from '../../../../../sound/soundTypes';
import type { LibraryEntry } from '../../../../../soundLibrary/libraryOperations';
import type { LibraryFile, SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import type { SoundListing } from '../../../../../soundLibrary/soundLocation';
import { nameOfRelative, parentOfRelative, stemOf } from '../../../../../soundLibrary/soundPaths';

export type LibraryRow =
  | { type: 'folder'; id: string; kind: SoundKind; path: string; name: string }
  | { type: 'file'; id: string; file: LibraryFile; name: string; /** Where a search found it. */ where?: string }
  /** A record whose file is not where it says. */
  | { type: 'waiting'; id: string; sound: SoundAsset; name: string };

const rowIdOf = (kind: SoundKind, path: string): string => `${kind}:${path}`;

/** What a folder's rows are: its folders, then its files, then what waits for a file that should lie here. */
export function folderRows(kind: SoundKind, listing: SoundListing | null, waiting: readonly SoundAsset[]): LibraryRow[] {
  const rows: LibraryRow[] = [];
  for (const folder of listing?.folders ?? []) rows.push({ type: 'folder', id: rowIdOf(kind, folder.path), kind, path: folder.path, name: folder.name });
  for (const file of listing?.files ?? []) rows.push({ type: 'file', id: rowIdOf(kind, file.path), file: { ...file, kind }, name: stemOf(file.name) });
  for (const sound of waiting) rows.push({ type: 'waiting', id: sound.id, sound, name: sound.name });
  return rows;
}

export const searchRows = (hits: readonly LibraryFile[], rootName: (kind: SoundKind) => string): LibraryRow[] =>
  hits.map((file) => {
    const folder = parentOfRelative(file.path);
    return { type: 'file', id: rowIdOf(file.kind, file.path), file, name: stemOf(file.name), where: [rootName(file.kind), ...(folder === '' ? [] : folder.split('/'))].join(' / ') };
  });

/** The records that say their file lies in this folder and that no listing holds. On a device without the root that is every record of it, shown together. */
export function waitingIn(library: Pick<SoundLibrary, 'fileOfAudioPath'>, sounds: readonly SoundAsset[], kind: SoundKind, folder: string, listing: SoundListing | null, linked: boolean): SoundAsset[] {
  if (linked && !listing) return [];
  const here = new Set(listing?.files.map((file) => file.path));
  return sounds.filter((sound) => {
    const place = library.fileOfAudioPath(sound.audioPath);
    if (!place || place.kind !== kind) return false;
    if (!linked) return true;
    return parentOfRelative(place.path) === folder && !here.has(place.path);
  });
}

export const entryOfRow = (row: LibraryRow): LibraryEntry | null => {
  if (row.type === 'folder') return { kind: row.kind, path: row.path, isFolder: true };
  return row.type === 'file' ? { kind: row.file.kind, path: row.file.path, isFolder: false } : null;
};

export const crumbsOf = (folder: string): { name: string; path: string }[] => {
  const crumbs: { name: string; path: string }[] = [];
  for (let at = folder; at !== ''; at = parentOfRelative(at)) crumbs.unshift({ name: nameOfRelative(at), path: at });
  return crumbs;
};

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
