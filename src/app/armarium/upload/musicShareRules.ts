import type { MusicKind } from '../../services/itemBundle/itemBundleFormat';
import { holdsTrackCount, isOneLine, MAX_MUSIC_TEXT, shownText } from '../../services/musicBundle/musicBundleFormat';
import { MUSIC_TIME_LIMITS, type MusicShareSnapshot } from './musicShareState';
import type { OwnListing } from './uploadContract';

/**
 * What music picked for a share becomes: one track is shared as a track, whatever was asked for, since the Armarium's
 * one Music entry asks for an album and its picker offers single tracks too; two or more are an album.
 */
export function pickedKind(asked: MusicKind, count: number): MusicKind {
  return count === 1 ? 'music-track' : asked;
}

/** What is wrong with a name, an artist or a title: nothing, missing (where one is needed) or too long. */
function textProblem(text: string, required: boolean): string | null {
  const trimmed = text.trim();
  if (shownText(trimmed).trim() === '') return required ? 'missing' : null;
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

/**
 * The name a share has while it continues a listing: the listing's own, so publishing never renames it; New listing
 * brings back the name there was before the first listing was chosen.
 */
export class ListingName {
  private before: string | null = null;

  /** The share's name once `listing` is chosen while it is called `current`; null where it stays as it is. */
  after(current: string, listing: OwnListing | null): string | null {
    if (listing?.name) {
      this.before ??= current;
      return listing.name;
    }
    if (listing !== null || this.before === null) return null;
    const name = this.before;
    this.before = null;
    return name;
  }
}
