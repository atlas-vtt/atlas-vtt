import { musicRootWalked } from '../../services/musicBundle/installedMusic';
import { filesOfRows, rowsWithTags, shelfOf, type LibraryRow } from '../../react/components/dm-screen/sound/library/rowModel';
import { recordsByFile } from '../../soundLibrary/libraryRecords';
import type { LibraryFile, SoundLibrary } from '../../soundLibrary/SoundLibrary';
import type { SoundRecordStore } from '../../soundLibrary/SoundRecordStore';
import { MIN_ALBUM_TRACKS } from '../../services/musicBundle/musicBundleFormat';

/** A tag of the music root as an album: its name and its tracks in the library's order. */
export interface AlbumChoice {
  key: string;
  name: string;
  files: LibraryFile[];
}

/** What the music root offers to share: its tags with tracks enough for an album, and its tracks. */
export interface MusicChoices {
  albums: AlbumChoice[];
  tracks: { name: string; where: string; file: LibraryFile }[];
}

/** The music root as the Sound library shows it, once read whole; null where no music folder is linked here. */
export async function musicChoices(library: SoundLibrary, records: Pick<SoundRecordStore, 'whenLoaded' | 'all'>): Promise<MusicChoices | null> {
  if (library.locationOf('music') === null) return null;
  await Promise.all([records.whenLoaded(), musicRootWalked(library)]);
  const sounds = records.all();
  const shelf = shelfOf(library, sounds, recordsByFile(sounds, library), 'music');
  const files = shelf.rows.filter((row): row is LibraryRow & { type: 'file' } => row.type === 'file');
  return {
    albums: shelf.tags
      .map((tag) => ({ key: tag.key, name: tag.name, files: filesOfRows(rowsWithTags(files, [tag.key])) }))
      .filter((album) => album.files.length >= MIN_ALBUM_TRACKS),
    tracks: files.map((row) => ({ name: row.name, where: row.where, file: row.file })),
  };
}

/** The tracks whose name or tags hold every word typed, in the library's order. */
export function tracksMatching(tracks: MusicChoices['tracks'], query: string): MusicChoices['tracks'] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return tracks;
  return tracks.filter((track) => {
    const text = `${track.name} ${track.where}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
