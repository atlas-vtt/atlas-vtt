import type { SoundLibrary } from '../../soundLibrary/SoundLibrary';
import { soundAfterMove } from '../../soundLibrary/soundRecords';
import type { SoundRecordStore } from '../../soundLibrary/SoundRecordStore';
import type { MusicImportPlan } from './musicImportPlan';
import type { LetGoFiles } from './musicInstallFiles';

/** What an install of music changes of the sound records: a track's mood entries and the mix name a record. */
export type MusicRecords = Pick<SoundRecordStore, 'whenLoaded' | 'all' | 'rewrite' | 'remove'>;

/**
 * The records of an install's tracks once it stands. A replaced track's record stays in its place, where the new
 * version now lies, so moods and the mix play it; a renamed track's follows it to its new name; a track the update
 * took out goes with its file, as a track deleted from the library does, or follows it where the trash did not take it
 * and it is back in the folder. No record ever names a file set aside.
 */
export async function followInstall(records: MusicRecords, library: Pick<SoundLibrary, 'audioPathOf'>, plan: MusicImportPlan, letGo: LetGoFiles, now = Date.now()): Promise<void> {
  const audio = (path: string): string | null => library.audioPathOf('music', path);
  const moves = new Map<string, string>();
  const move = (from: string, to: string): void => {
    const [before, after] = [audio(from), audio(to)];
    if (before !== null && after !== null) moves.set(before, after);
  };
  for (const track of plan.tracks) if (track.from !== null && track.from !== track.path) move(track.from, track.path);
  const removed = new Set(plan.removes);
  for (const [from, to] of letGo.putBack) if (removed.has(from)) move(from, to);
  const gone = new Set(letGo.gone.filter((path) => removed.has(path)).flatMap((path) => audio(path) ?? []));
  if (moves.size === 0 && gone.size === 0) return;
  await records.whenLoaded();
  records.rewrite((stored) => {
    const to = moves.get(stored.audioPath);
    return to === undefined ? null : soundAfterMove(stored, stored.audioPath, to, now);
  });
  for (const stored of records.all()) if (gone.has(stored.audioPath)) records.remove(stored.id);
}
