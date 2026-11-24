import type { SoundRefusal } from '../../sound/codec/demux/demuxTypes';
import type { MusicKind } from '../../services/itemBundle/itemBundleFormat';
import type { LibraryFile } from '../../soundLibrary/SoundLibrary';
import type { ShareCommon } from './shareState';
import type { OwnListing } from './uploadContract';

/** Why a track cannot go: what a conversion refused, the GM's choice for the folder still to make, or the file gone. */
export type TrackRefusal = SoundRefusal | 'consent' | 'gone';

/** How far a track's Atlas copy is, as the share step shows it. */
export type TrackCopyState =
  | { readonly state: 'reading' }
  /** A conversion runs or waits its turn; `progress` from 0 to 1, null while unknown. */
  | { readonly state: 'converting'; readonly progress: number | null }
  | { readonly state: 'ready'; readonly seconds: number; readonly bytes: number }
  | { readonly state: 'refused'; readonly reason: TrackRefusal };

/** One track of a music share, in the order it plays. */
export interface MusicShareTrack {
  /** The file's root and path: unique in the share. */
  readonly id: string;
  readonly file: LibraryFile;
  readonly title: string;
  readonly copy: TrackCopyState;
}

/** A share of music from the Sound library: an album, or a single track. */
export interface MusicShareSnapshot extends ShareCommon {
  readonly subject: 'music';
  readonly listingKind: 'music';
  /** Fixed by where the share began: a single from one track, an album from several. */
  readonly kind: MusicKind;
  /** The album's title, or the single's. */
  readonly name: string;
  readonly artist: string;
  readonly tracks: readonly MusicShareTrack[];
  /** Tracks past the most an album holds, which were left out. */
  readonly cut: number;
  /** The account's music listings of this kind, once read; null before. */
  readonly listings: readonly OwnListing[] | null;
  /** They could not be read: the step says so and offers to try again, and Continue shares a new listing. */
  readonly listingsFailed: boolean;
  /** The listing this share continues; null for a new one. */
  readonly target: string | null;
  /** The version this share publishes, once the listings were read. */
  readonly version: number | null;
  readonly notes: string;
  readonly cover: Blob | null;
  readonly listedCover: Blob | null;
  readonly uploadedCover: Blob | null;
}

/** The longest a track and an album may play, as the Armarium's checks allow, and the shortest track. */
export const MUSIC_TIME_LIMITS = { minTrackSeconds: 1, maxTrackSeconds: 2 * 3600, maxAlbumSeconds: 10 * 3600 } as const;
