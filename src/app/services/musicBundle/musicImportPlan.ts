import { readAtlasCopy, tagCopy } from '../../sound/codec/atlasOpus';
import type { SoundLocation } from '../../soundLibrary/soundLocation';
import { freeName, joinRelative, nameOfRelative } from '../../soundLibrary/soundPaths';
import { sha256 } from '../../utils/hashing';
import { installOf, type InstalledMusic } from './installedMusic';
import { safeFileName, trackFileName } from './musicBundleFormat';
import type { MusicBundleTrack, OpenedMusicBundle } from './musicBundleReader';
import { ALBUM_SIDECAR, trackSidecarName } from './musicProvenance';

/** A track as the install leaves it: where, its bytes (named for their own file), and what becomes of the version before. */
export interface PlannedTrack {
  title: string;
  source: MusicBundleTrack;
  /** Below the music root. */
  path: string;
  /** What the install writes; nothing is written where `from` is set. */
  bytes: Blob;
  /** Of the file at `path` once installed: the bytes written, or those of the file kept (`from`). */
  sha256: string;
  /** An unchanged file of the version installed before lies at `path`: it is set aside for this one, and goes to the trash once the install stands. */
  replaces: boolean;
  /**
   * An unchanged file of the version installed before that holds this track's audio: it stays as it is where it lies at
   * `path`, and is renamed to `path` where only the track's number or title changed. Nothing is written for it. Null
   * where the track is written.
   */
  from: string | null;
}

/** What installing a music bundle does in the music root. Nothing is written to work it out. */
export interface MusicImportPlan {
  /** The album's folder, or the folder a single goes in; '' is the root's top. */
  folder: string;
  /** Where the listing's sidecar goes; null for bytes that did not come from the Armarium for this listing, which name no install. */
  sidecarPath: string | null;
  tracks: PlannedTrack[];
  /** Files of the version installed before that came as they are and that no track takes the place of, and a sidecar that moved: trashed. */
  removes: string[];
  /** Files of the version installed before that the GM changed: they stay, and the new ones come beside them. */
  kept: string[];
  /** The install this one updates; null for a new one. */
  installed: InstalledMusic | null;
  /** The same version lies there already, every file as it came. */
  same: boolean;
}

/** A file of the version installed before: as the sidecar says it was written, changed since, or gone; and the audio it holds while unchanged. */
interface OldFile {
  path: string;
  written: string;
  state: 'missing' | 'unchanged' | 'changed';
  /** What tells its audio apart, whatever its tags say (`audioOf`); null unless unchanged. */
  audio: string | null;
}

/**
 * What tells a copy's audio apart: the key the Armarium gave it (the hash of the audio uploaded) and its length. The
 * bytes cannot, as every installed copy is tagged with its own file name.
 */
const audioOf = (facts: { key: string; frames: number }): string => `${facts.key}\n${facts.frames}`;

/** Reads only what decides anything. */
async function oldFile(location: SoundLocation, path: string, written: string): Promise<OldFile> {
  if (!(await location.exists(path))) return { path, written, state: 'missing', audio: null };
  const bytes = await location.read(path);
  if ((await sha256(await bytes.arrayBuffer())) !== written) return { path, written, state: 'changed', audio: null };
  const facts = await readAtlasCopy(bytes);
  return { path, written, state: 'unchanged', audio: facts ? audioOf(facts) : null };
}

/**
 * Which unchanged file of the version before each track keeps instead of being written: the one at its own path
 * holding its audio, else another holding it whose path no track takes (a renamed copy keeps the name it was tagged
 * with, which must name no other track's file beside it). Each file is kept once.
 */
function keptFiles(tracks: readonly { path: string; source: MusicBundleTrack }[], old: readonly OldFile[]): (string | null)[] {
  const unchanged = old.filter((file) => file.state === 'unchanged' && file.audio !== null);
  const targets = new Set(tracks.map((track) => track.path));
  const used = new Set<string>();
  const kept: (string | null)[] = tracks.map((track) => {
    const here = unchanged.find((file) => file.path === track.path && file.audio === audioOf(track.source.facts));
    if (here) used.add(here.path);
    return here?.path ?? null;
  });
  return kept.map((path, index) => {
    const track = tracks[index];
    if (path !== null || !track) return path;
    const moved = unchanged.find((file) => !used.has(file.path) && !targets.has(file.path) && file.audio === audioOf(track.source.facts));
    if (moved) used.add(moved.path);
    return moved?.path ?? null;
  });
}

/** The folder a new album goes in: `<artist>/<album>`, numbered where something of that name lies there already. */
async function freeFolder(parent: string, name: string, exists: (path: string) => Promise<boolean>): Promise<string> {
  for (let number = 1; ; number++) {
    const candidate = joinRelative(parent, number === 1 ? name : `${name} ${number}`);
    if (!(await exists(candidate))) return candidate;
  }
}

/**
 * The folder a single goes in: its artist's, or the root's top without one, but never an album's folder, whose sidecar
 * would hide the single from what is installed: `Lanterns 2` where the album `Lanterns` lies in `Lanterns`.
 */
async function singleFolder(artistFolder: string, exists: (path: string) => Promise<boolean>): Promise<string> {
  for (let number = 1; ; number++) {
    const candidate = number === 1 ? artistFolder : `${artistFolder} ${number}`;
    if (!(await exists(joinRelative(candidate, ALBUM_SIDECAR)))) return candidate;
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
 * Armarium for this listing) lets it update the listing's install where it lies and record the install in a sidecar;
 * otherwise it comes in beside and names no listing, so a file anyone can make never poses as the listing's install. Reads
 * only: `location` is null while the music root is not linked yet, which then holds nothing.
 */
export async function planMusicImport(location: SoundLocation | null, bundle: OpenedMusicBundle, installs: readonly InstalledMusic[], inPlace: boolean): Promise<MusicImportPlan> {
  const { kind, name, artist, uid, version } = bundle.manifest.item;
  const exists = (path: string): Promise<boolean> => (location ? location.exists(path) : Promise.resolve(false));
  const found = inPlace ? installOf(installs, uid) : null;
  const installed = found?.sidecar.kind === kind ? found : null;
  const old = installed && location
    ? await Promise.all(installed.sidecar.tracks.map(({ file, sha256: written }) => oldFile(location, joinRelative(installed.folder, file), written)))
    : [];
  const artistFolder = artist ? safeFileName(artist, 'Artist') : '';
  const folder = installed?.folder ?? (kind === 'music-album' ? await freeFolder(artistFolder, safeFileName(name, 'Album'), exists) : await singleFolder(artistFolder, exists));
  const unchanged = new Set(old.filter((file) => file.state === 'unchanged').map((file) => file.path));
  const taken = new Set<string>();
  const placed: Omit<PlannedTrack, 'replaces' | 'from'>[] = [];
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
    placed.push({ title: source.title, source, path, bytes, sha256: await sha256(await bytes.arrayBuffer()) });
  }
  const keeps = keptFiles(placed, old);
  const keptPaths = new Set(keeps.filter((path): path is string => path !== null));
  const writtenBefore = new Map(old.map((file) => [file.path, file.written]));
  const tracks: PlannedTrack[] = placed.map((track, index) => {
    const from = keeps[index] ?? null;
    return { ...track, sha256: from === null ? track.sha256 : writtenBefore.get(from) ?? track.sha256, replaces: unchanged.has(track.path) && !keptPaths.has(track.path), from };
  });
  const sidecarPath = inPlace ? joinRelative(folder, kind === 'music-album' ? ALBUM_SIDECAR : trackSidecarName(nameOfRelative(tracks[0]?.path ?? ''))) : null;
  const removes = [...unchanged].filter((path) => !taken.has(path) && !keptPaths.has(path));
  if (installed && installed.sidecarPath !== sidecarPath) removes.push(installed.sidecarPath);
  const kept = old.filter((file) => file.state === 'changed').map((file) => file.path);
  const same = installed?.sidecar.version === version && removes.length === 0 && kept.length === 0 && tracks.every((track) => track.from === track.path);
  return { folder, sidecarPath, tracks, removes, kept, installed, same };
}
