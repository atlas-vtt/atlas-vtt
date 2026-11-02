import type { MoodStore } from './MoodStore';
import type { SoundKind } from '../sound/soundTypes';
import { isAudioPath } from './soundFiles';
import type { SoundLibrary } from './SoundLibrary';
import { SoundMoveRefusedError, type SoundLocation } from './soundLocation';
import { asFileName, freeName, isWithin, joinRelative, nameOfRelative, parentOfRelative } from './soundPaths';
import { soundAfterMove, type StoredSound } from './soundRecords';
import type { SoundRecordStore } from './SoundRecordStore';
import { DEFAULT_SOUND_FOLDERS, isLinked } from './SoundRoots';
import { VaultLocation } from './vaultLocation';

/** A row of the library. */
export interface LibraryEntry {
  kind: SoundKind;
  path: string;
  isFolder: boolean;
}

export interface LibraryContext {
  library: SoundLibrary;
  records: SoundRecordStore;
}

function locationOf(library: SoundLibrary, kind: SoundKind): SoundLocation {
  const location = library.locationOf(kind);
  if (!location) throw new Error(`The ${kind} folder is not linked on this device.`);
  return location;
}

/** Copies between roots, which may lie on different disks, and only then lets go of the source. A failure leaves the source whole. */
async function copyAcross(source: SoundLocation, from: string, target: SoundLocation, to: string): Promise<void> {
  const listing = await source.list(from);
  if (!listing) {
    await target.write(to, await source.read(from));
    return;
  }
  await target.makeFolder(to);
  for (const folder of listing.folders) await copyAcross(source, folder.path, target, joinRelative(to, folder.name));
  for (const file of listing.files) await target.write(joinRelative(to, file.name), await source.read(file.path));
}

/**
 * Refuses a move that would copy a folder holding what the copy leaves behind, before anything moves: the source
 * goes to the trash afterwards, for good where the GM's trash setting says so. Renames take everything along.
 */
async function refuseWhatWouldBeLost(library: SoundLibrary, entries: readonly LibraryEntry[], targetKind: SoundKind): Promise<void> {
  const target = locationOf(library, targetKind);
  for (const entry of entries) {
    const source = locationOf(library, entry.kind);
    if (!entry.isFolder || entry.kind === targetKind || (source instanceof VaultLocation && target instanceof VaultLocation)) continue;
    if ((await source.firstUnlisted(entry.path)) !== null) throw new SoundMoveRefusedError(entry.path);
  }
}

async function moveFiles(library: SoundLibrary, entry: LibraryEntry, targetKind: SoundKind, to: string): Promise<void> {
  const source = locationOf(library, entry.kind);
  const target = locationOf(library, targetKind);
  if (entry.kind === targetKind) {
    await source.move(entry.path, to);
    return;
  }
  if (source instanceof VaultLocation && target instanceof VaultLocation) {
    await source.moveToVault(entry.path, target.fullPath(to));
    return;
  }
  try {
    await copyAcross(source, entry.path, target, to);
  } catch (error) {
    await target.trash(to).catch(() => undefined);
    throw error;
  }
  await source.trash(entry.path);
}

async function moveWithRecords(context: LibraryContext, entry: LibraryEntry, targetKind: SoundKind, to: string): Promise<void> {
  const { library, records } = context;
  const fromAudio = library.audioPathOf(entry.kind, entry.path);
  const toAudio = library.audioPathOf(targetKind, to);
  if (fromAudio === null || toAudio === null) throw new Error('A folder of the move is not linked on this device.');
  await records.whenLoaded();
  await moveFiles(library, entry, targetKind, to);
  const now = Date.now();
  records.rewrite((stored) => soundAfterMove(stored, fromAudio, toAudio, now, targetKind));
  await Promise.all([library.settle(entry.kind, [entry.path]), library.settle(targetKind, [to])]);
}

/** Moves rows into a folder. A name that is taken there gets a number, and a folder is never moved into itself. Refused whole where one of them would lose a file. */
export async function moveEntries(context: LibraryContext, entries: readonly LibraryEntry[], targetKind: SoundKind, folder: string): Promise<void> {
  const target = locationOf(context.library, targetKind);
  await refuseWhatWouldBeLost(context.library, entries, targetKind);
  for (const entry of entries) {
    if (entry.kind === targetKind && (parentOfRelative(entry.path) === folder || (entry.isFolder && isWithin(entry.path, folder)))) continue;
    const name = await freeName(nameOfRelative(entry.path), (candidate) => target.exists(joinRelative(folder, candidate)));
    await moveWithRecords(context, entry, targetKind, joinRelative(folder, name));
  }
}

/** Renames a row in its folder. Refused with an error where the name is taken. */
export async function renameEntry(context: LibraryContext, entry: LibraryEntry, name: string): Promise<void> {
  await moveWithRecords(context, entry, entry.kind, joinRelative(parentOfRelative(entry.path), name));
}

export async function makeLibraryFolder(context: Pick<LibraryContext, 'library'>, kind: SoundKind, folder: string, name: string): Promise<void> {
  const location = locationOf(context.library, kind);
  const free = await freeName(name, (candidate) => location.exists(joinRelative(folder, candidate)));
  await location.makeFolder(joinRelative(folder, free));
  await context.library.settle(kind, [joinRelative(folder, free)]);
}

/** The records of rows, and how many moods name any of them. */
export async function usesOf(context: LibraryContext, moods: Pick<MoodStore, 'moods' | 'whenLoaded'>, entries: readonly LibraryEntry[]): Promise<{ sounds: StoredSound[]; moods: number }> {
  const { records, library } = context;
  await Promise.all([records.whenLoaded(), moods.whenLoaded()]);
  const inRows = entries.flatMap((entry) => library.audioPathOf(entry.kind, entry.path) ?? []);
  const sounds = records.all().filter((sound) => inRows.some((path) => isWithin(path, sound.audioPath)));
  const ids = new Set(sounds.map((sound) => sound.id));
  const count = moods.moods().filter((mood) => mood.layers.some((layer) => ids.has(layer.sound))
    || (typeof mood.music !== 'string' && mood.music.tracks.some((id) => ids.has(id)))).length;
  return { sounds, moods: count };
}

/** Moves rows to the system's trash, and their records go with them: a mood that named one says its sound was deleted. Refused whole where there is no trash. */
export async function trashEntries(context: LibraryContext, entries: readonly LibraryEntry[], sounds: readonly StoredSound[]): Promise<void> {
  const { records, library } = context;
  for (const entry of entries) {
    await locationOf(library, entry.kind).trash(entry.path);
    await library.settle(entry.kind, [entry.path]);
  }
  for (const sound of sounds) records.remove(sound.id);
}

export interface LibraryImportOutcome {
  added: string[];
  refused: string[];
  failed: string[];
}

/** Where imported files of a kind go when no folder is open: the root, whose default folder is linked if nothing is. Null where it is linked elsewhere and not here. */
function importRoot(library: SoundLibrary, kind: SoundKind): SoundLocation | null {
  const root = library.rootOf(kind);
  if (root.status === 'unlinked') library.roots.linkVault(kind, DEFAULT_SOUND_FOLDERS[kind]);
  return isLinked(library.rootOf(kind)) ? library.locationOf(kind) : null;
}

/** Copies files from outside into a folder of a root, each under a free name; nothing is ever written over. Browsing makes no record, so this makes none. */
export async function importIntoLibrary(library: SoundLibrary, files: readonly File[], kind: SoundKind, folder: string, onStep?: (done: number, total: number) => void): Promise<LibraryImportOutcome> {
  const outcome: LibraryImportOutcome = { added: [], refused: [], failed: [] };
  const location = importRoot(library, kind);
  if (!location) return { ...outcome, failed: files.map((file) => file.name) };
  await location.makeFolder(folder);
  for (const [index, file] of files.entries()) {
    onStep?.(index, files.length);
    if (!isAudioPath(file.name)) {
      outcome.refused.push(file.name);
      continue;
    }
    try {
      const name = await freeName(asFileName(file.name), (candidate) => location.exists(joinRelative(folder, candidate)));
      await location.write(joinRelative(folder, name), file);
      outcome.added.push(name);
    } catch (error) {
      console.error(`[Atlas] Could not import ${file.name}`, error);
      outcome.failed.push(file.name);
    }
  }
  await library.reread(kind, folder);
  return outcome;
}
