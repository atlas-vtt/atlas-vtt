import type { Mood, TableSound } from '../sound/soundTypes';
import { soundingTrack } from './musicList';
import type { SoundShelf } from './soundShelf';

/** What the status bar and the palette name: the mood, else the track, else the first layer. */
export function whatPlays(table: TableSound, mood: Mood | null, shelf: Pick<SoundShelf, 'recordOfKey'>, now: number): string | null {
  if (mood) return mood.name;
  const sound = soundingTrack(table, now) ?? table.layers[0]?.sound;
  return sound ? (shelf.recordOfKey(sound.key)?.name ?? null) : null;
}
