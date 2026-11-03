import type { MoodStore } from './MoodStore';
import type { SoundKind } from '../sound/soundTypes';
import { isAudioPath } from './soundFiles';
import type { SoundLibrary } from './SoundLibrary';
import type { SoundLocation } from './soundLocation';
import { asFileName, freeName, joinRelative, nameOfRelative, parentOfRelative } from './soundPaths';
import { soundAfterMove, type StoredSound } from './soundRecords';
import type { SoundRecordStore } from './SoundRecordStore';
import { DEFAULT_SOUND_FOLDERS, isLinked } from './SoundRoots';
import { VaultLocation } from './vaultLocation';

/** A file of the library, as a row names it. */
export interface LibraryEntry {
  kind: SoundKind;
  path: string;
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
  // Between roots, which may lie on different disks: only then does the source go, so a failure leaves it whole.
  try {
    await target.write(to, await source.read(entry.path));
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

/** Moves files to the top of the other root. A name that is taken there gets a number. */
export async function moveEntries(context: LibraryContext, entries: readonly LibraryEntry[], targetKind: SoundKind): Promise<void> {
  const target = locationOf(context.library, targetKind);
  for (const entry of entries) {
    if (entry.kind === targetKind) continue;
    const name = await freeName(nameOfRelative(entry.path), (candidate) => target.exists(candidate));
    await moveWithRecords(context, entry, targetKind, name);
  }
}

/** Renames a file where it lies. Refused with an error where the name is taken. */
export async function renameEntry(context: LibraryContext, entry: LibraryEntry, name: string): Promise<void> {
  await moveWithRecords(context, entry, entry.kind, joinRelative(parentOfRelative(entry.path), name));
}

/** The records of rows, and how many moods name any of them. */
export async function usesOf(context: LibraryContext, moods: Pick<MoodStore, 'moods' | 'whenLoaded'>, entries: readonly LibraryEntry[]): Promise<{ sounds: StoredSound[]; moods: number }> {
  const { records, library } = context;
  await Promise.all([records.whenLoaded(), moods.whenLoaded()]);
  const inRows = new Set(entries.flatMap((entry) => library.audioPathOf(entry.kind, entry.path) ?? []));
  const sounds = records.all().filter((sound) => inRows.has(library.pathNow(sound.audioPath, sound.audioSize)));
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

/** Where imported files of a kind go: the root, whose default folder is linked if nothing is. Null where it is linked elsewhere and not here. */
export function importRoot(library: SoundLibrary, kind: SoundKind): SoundLocation | null {
  const root = library.rootOf(kind);
  if (root.status === 'unlinked') library.roots.linkVault(kind, DEFAULT_SOUND_FOLDERS[kind]);
  return isLinked(library.rootOf(kind)) ? library.locationOf(kind) : null;
}

/** Copies files from outside to the top of a root, each under a free name; nothing is ever written over. Browsing makes no record, so this makes none. */
export async function importIntoLibrary(library: SoundLibrary, files: readonly File[], kind: SoundKind, onStep?: (done: number, total: number) => void): Promise<LibraryImportOutcome> {
  const outcome: LibraryImportOutcome = { added: [], refused: [], failed: [] };
  const location = importRoot(library, kind);
  if (!location) return { ...outcome, failed: files.map((file) => file.name) };
  await location.makeFolder('');
  for (const [index, file] of files.entries()) {
    onStep?.(index, files.length);
    if (!isAudioPath(file.name)) {
      outcome.refused.push(file.name);
      continue;
    }
    try {
      const name = await freeName(asFileName(file.name), (candidate) => location.exists(candidate));
      await location.write(name, file);
      outcome.added.push(name);
    } catch (error) {
      console.error(`[Atlas] Could not import ${file.name}`, error);
      outcome.failed.push(file.name);
    }
  }
  await library.reread(kind);
  return outcome;
}
