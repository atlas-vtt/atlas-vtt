import type { App } from 'obsidian';
import { runInBackground } from '../utils/backgroundTask';
import type { SoundLibrary } from './SoundLibrary';
import type { SoundKind } from '../sound/soundTypes';
import type { StoredSound } from './soundRecords';
import { SoundRecordStore } from './SoundRecordStore';
import { nameOfRelative } from './soundPaths';

/**
 * Where records of a root's missing files have gone: found by name and size among what the root holds,
 * the first in path order where several match, so every device with these files finds the same. A record
 * without a size is left to wait.
 */
function relinksIn(sounds: readonly StoredSound[], library: SoundLibrary, kind: SoundKind): Map<string, string> {
  const files = library.filesOf(kind);
  const present = new Set(files.map((file) => file.path));
  const byIdentity = new Map<string, string>();
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const identity = `${file.size}|${file.name}`;
    if (!byIdentity.has(identity)) byIdentity.set(identity, file.path);
  }
  const moves = new Map<string, string>();
  for (const sound of sounds) {
    const file = library.fileOfAudioPath(sound.audioPath);
    if (file?.kind !== kind || present.has(file.path) || sound.audioSize === undefined) continue;
    const found = byIdentity.get(`${sound.audioSize}|${nameOfRelative(file.path)}`);
    const audioPath = found === undefined ? null : library.audioPathOf(kind, found);
    if (audioPath !== null) moves.set(sound.id, audioPath);
  }
  return moves;
}

/** Applies what a root's walk found: every record of a missing file that is back. */
export async function relinkRecords(library: SoundLibrary, records: Pick<SoundRecordStore, 'whenLoaded' | 'all' | 'rewrite'>, kind: SoundKind, now = Date.now()): Promise<boolean> {
  if (!library.isWalked(kind)) return false;
  await records.whenLoaded();
  const moves = relinksIn(records.all(), library, kind);
  if (moves.size === 0) return false;
  return records.rewrite((stored) => {
    const audioPath = moves.get(stored.id);
    return audioPath === undefined || stored.audioPath === audioPath ? null : { ...stored, audioPath, modifiedAt: now };
  });
}

/** Keeps records with their files for as long as the library lives. */
export function followMissingFiles(library: SoundLibrary, app: App): void {
  library.onWalked((kind) => {
    runInBackground(relinkRecords(library, SoundRecordStore.forApp(app), kind), 'Finding sounds that moved');
  });
}
