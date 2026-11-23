import { holdsTrackCount, isOneLine, MAX_MUSIC_TEXT } from '../../services/musicBundle/musicBundleFormat';
import { stemOf } from '../../soundLibrary/soundPaths';
import { MUSIC_TIME_LIMITS, type MusicShareSnapshot } from './musicShareState';

/** A track number a file name starts with, and what sets it apart: `01 `, `01 - `, `1. `, `07_`. */
const LEADING_NUMBER = /^\d{1,3}\s*[-–.)_]?\s+|^\d{1,3}[-–._]\s*/;

/** A track's title to begin with: its file name without extension, and without the number it starts with. */
export function startingTitle(fileName: string): string {
  const stem = stemOf(fileName).trim();
  const title = stem.replace(LEADING_NUMBER, '').trim();
  return title === '' ? stem : title;
}

/** What is wrong with a name, an artist or a title: nothing, missing (where one is needed) or too long. */
function textProblem(text: string, required: boolean): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return required ? 'missing' : null;
  // Counted as the Armarium counts (UTF-16 units), so the share never uploads what its rules refuse.
  if (trimmed.length > MAX_MUSIC_TEXT) return 'too-long';
  return isOneLine(trimmed) ? null : 'one-line';
}

/** What keeps the music step from going on, by field: `name`, `artist`, `title:<track id>` and `tracks`. */
export function musicProblems(state: Pick<MusicShareSnapshot, 'kind' | 'name' | 'artist' | 'tracks'>): Record<string, string> {
  const problems: Record<string, string> = {};
  const name = textProblem(state.name, true);
  if (name) problems.name = name;
  const artist = textProblem(state.artist, false);
  if (artist) problems.artist = artist;
  const going = state.tracks.filter((track) => track.copy.state !== 'refused');
  if (state.kind === 'music-album') {
    for (const track of going) {
      const title = textProblem(track.title, true);
      if (title) problems[`title:${track.id}`] = title;
    }
  }
  const seconds = going.flatMap((track) => (track.copy.state === 'ready' ? [track.copy.seconds] : []));
  if (seconds.length < going.length) problems.tracks = 'preparing';
  else if (!holdsTrackCount(state.kind, going.length)) problems.tracks = 'too-few';
  else if (seconds.some((each) => each < MUSIC_TIME_LIMITS.minTrackSeconds)) problems.tracks = 'too-short';
  else if (seconds.some((each) => each > MUSIC_TIME_LIMITS.maxTrackSeconds)) problems.tracks = 'track-too-long';
  else if (seconds.reduce((sum, each) => sum + each, 0) > MUSIC_TIME_LIMITS.maxAlbumSeconds) problems.tracks = 'album-too-long';
  return problems;
}
