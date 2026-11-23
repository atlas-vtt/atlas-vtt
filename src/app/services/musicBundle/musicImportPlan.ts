import { tagCopy } from '../../sound/codec/atlasOpus';
import type { SoundLocation } from '../../soundLibrary/soundLocation';
import { freeName, joinRelative, nameOfRelative } from '../../soundLibrary/soundPaths';
import { sha256 } from '../../utils/hashing';
import { installOf, type InstalledMusic } from './installedMusic';
import { safeFileName, trackFileName } from './musicBundleFormat';
import type { MusicBundleTrack, OpenedMusicBundle } from './musicBundleReader';
import { ALBUM_SIDECAR, trackSidecarName } from './musicProvenance';

/** A track as the install writes it: where, its bytes (named for their own file), and whether it takes the place of the version before. */
export interface PlannedTrack {
  title: string;
  source: MusicBundleTrack;
  /** Below the music root. */
  path: string;
  bytes: Blob;
  sha256: string;
  /** An unchanged file of the version installed before lies at `path` and goes to the trash for this one. */
  replaces: boolean;
}

/** What installing a music bundle does in the music root. Nothing is written to work it out. */
export interface MusicImportPlan {
  /** The album's folder, or the folder a single goes in; '' is the root's top. */
  folder: string;
  sidecarPath: string;
  tracks: PlannedTrack[];
  /** Files of the version installed before that came as they are and that no track takes the place of: trashed. */
  removes: string[];
  /** Files of the version installed before that the GM changed: they stay, and the new ones come beside them. */
  kept: string[];
  /** The install this one updates; null for a new one. */
  installed: InstalledMusic | null;
  /** The same version lies there already, every file as it came. */
  same: boolean;
}

type FileState = 'missing' | 'unchanged' | 'changed';

/** Reads only what decides anything: a file as the sidecar says it was written, changed since, or gone. */
async function fileState(location: SoundLocation, path: string, written: string): Promise<FileState> {
  if (!(await location.exists(path))) return 'missing';
  return (await sha256(await (await location.read(path)).arrayBuffer())) === written ? 'unchanged' : 'changed';
}

/** The folder a new album goes in: `<artist>/<album>`, numbered where something of that name lies there already. */
async function freeFolder(parent: string, name: string, exists: (path: string) => Promise<boolean>): Promise<string> {
  for (let number = 1; ; number++) {
    const candidate = joinRelative(parent, number === 1 ? name : `${name} ${number}`);
    if (!(await exists(candidate))) return candidate;
  }
}

/** The copy named for the file it becomes, so the library never takes another file of the folder for its source. */
async function namedCopy(track: MusicBundleTrack, fileName: string): Promise<Blob> {
  const { key, codec, lufs, truePeakDb, peaks } = track.facts;
  return tagCopy(track.bytes, { key, codec, from: fileName, lufs, truePeakDb, peaks });
}

/**
 * Plans the install of a checked music bundle into the music root: `<artist>/<album>/<NN> <title>.opus`, a single as
 * `<artist>/<title>.opus`, without the artist's folder where it names none. `inPlace` (the bytes came from the
 * Armarium for this listing) lets it update the listing's install where it lies; otherwise it comes in beside. Reads
 * only: `location` is null while the music root is not linked yet, which then holds nothing.
 */
export async function planMusicImport(location: SoundLocation | null, bundle: OpenedMusicBundle, installs: readonly InstalledMusic[], inPlace: boolean): Promise<MusicImportPlan> {
  const { kind, name, artist, uid, version } = bundle.manifest.item;
  const exists = (path: string): Promise<boolean> => (location ? location.exists(path) : Promise.resolve(false));
  const found = inPlace ? installOf(installs, uid) : null;
  const installed = found?.sidecar.kind === kind ? found : null;
  const old = installed && location
    ? await Promise.all(installed.sidecar.tracks.map(async ({ file, sha256: written }) => {
      const path = joinRelative(installed.folder, file);
      return { path, written, state: await fileState(location, path, written) };
    }))
    : [];
  const artistFolder = artist ? safeFileName(artist, 'Artist') : '';
  const folder = installed?.folder ?? (kind === 'music-album' ? await freeFolder(artistFolder, safeFileName(name, 'Album'), exists) : artistFolder);
  const unchanged = new Set(old.filter((file) => file.state === 'unchanged').map((file) => file.path));
  const taken = new Set<string>();
  const tracks: PlannedTrack[] = [];
  for (const [index, source] of bundle.tracks.entries()) {
    const wanted = trackFileName(kind, index, bundle.tracks.length, source.title);
    const free = async (candidate: string): Promise<boolean> => {
      const path = joinRelative(folder, candidate);
      return !taken.has(path) && (unchanged.has(path) || !(await exists(path)));
    };
    const fileName = await freeName(wanted, async (candidate) => !(await free(candidate)));
    const path = joinRelative(folder, fileName);
    taken.add(path);
    const bytes = await namedCopy(source, fileName);
    tracks.push({ title: source.title, source, path, bytes, sha256: await sha256(await bytes.arrayBuffer()), replaces: unchanged.has(path) });
  }
  const sidecarPath = joinRelative(folder, kind === 'music-album' ? ALBUM_SIDECAR : trackSidecarName(nameOfRelative(tracks[0]?.path ?? '')));
  const removes = [...unchanged].filter((path) => !taken.has(path));
  if (installed && installed.sidecarPath !== sidecarPath) removes.push(installed.sidecarPath);
  const kept = old.filter((file) => file.state === 'changed').map((file) => file.path);
  const writtenBefore = new Map(old.map((file) => [file.path, file.written]));
  const same = installed?.sidecar.version === version && removes.length === 0 && kept.length === 0
    && tracks.every((track) => track.replaces && writtenBefore.get(track.path) === track.sha256);
  return { folder, sidecarPath, tracks, removes, kept, installed, same };
}
