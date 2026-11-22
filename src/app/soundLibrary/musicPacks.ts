import { fetchBytes, fetchVerified, inPool, StockPackError, type FetchBytes, type PackedFile } from '../services/stockPacks/verifiedFetch';
import type { DownloadProgress } from '../downloads/downloadTypes';
import { isRecord } from '../utils/guards';
import { importRoot } from './libraryOperations';
import type { SoundLibrary } from './SoundLibrary';
import { MUSIC_MANIFEST, MUSIC_PACKS } from './musicPackCatalogue';

/**
 * Vindsvept's music (CC BY 4.0), sorted into packs by mood. Every track is an Atlas copy made from the
 * composer's lossless files, so it plays as it comes and is never converted again. A pack is never changed
 * in place: a new catalogue is a new folder on the host and a new manifest hash.
 */
const HOST = 'https://assets.atlas-vtt.dev/starter/vindsvept-1/';

/** The music root's folder the packs go to; it and each pack's folder are the tracks' tags. */
export const MUSIC_FOLDER = 'Vindsvept';
/** A pack's subfolders for sung tracks and for the others, so "With vocals" and "Instrumental" are tags of their own. */
export const VOCALS_FOLDER = 'With vocals';
export const INSTRUMENTAL_FOLDER = 'Instrumental';
const CREDITS_NAME = 'Credits.md';
/** Requests at a time. */
const PARALLEL = 4;

export { MUSIC_PACKS, type MusicPackSummary } from './musicPackCatalogue';
export const MUSIC_PACK_BYTES = MUSIC_PACKS.reduce((sum, pack) => sum + pack.bytes, 0);

interface PackTrack extends PackedFile {
  name: string;
  vocals: boolean;
}

interface MusicPack {
  id: string;
  name: string;
  tracks: PackTrack[];
}

interface Manifest {
  credits: PackedFile;
  packs: MusicPack[];
}

/** What a name in the GM's folder may be: one segment of printable characters no disk refuses. */
const SAFE_NAME = /^[^\\/:*?"<>|]{1,120}$/;
const isPrintable = (value: string): boolean => [...value].every((char) => char >= ' ');

function packedFile(value: unknown, pattern: RegExp): PackedFile {
  if (!isRecord(value)) throw new StockPackError('The manifest names a file it does not describe.');
  const { key, bytes, sha256 } = value;
  if (typeof key !== 'string' || !pattern.test(key) || typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes <= 0 || typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new StockPackError('The manifest names a file it does not describe.');
  }
  return { key, bytes, sha256 };
}

function safeName(value: unknown, extension: string): string {
  if (typeof value !== 'string' || !SAFE_NAME.test(value) || !isPrintable(value) || !value.endsWith(extension) || value.startsWith('.')) throw new StockPackError('The manifest names a file it cannot write.');
  return value;
}

function readTrack(value: unknown): PackTrack {
  if (!isRecord(value)) throw new StockPackError('The manifest names a track it does not describe.');
  return { ...packedFile(value, /^[a-z0-9-]+\/[a-z0-9-]+\.opus$/), name: safeName(value.name, '.opus'), vocals: value.vocals === true };
}

/** The manifest's hash is pinned in the catalogue, so this only turns its JSON into types. */
function readManifest(bytes: ArrayBuffer): Manifest {
  const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(data) || data.format !== 1 || !Array.isArray(data.packs)) throw new StockPackError('The manifest is of another format.');
  const packs = data.packs.map((entry: unknown): MusicPack => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !Array.isArray(entry.tracks)) throw new StockPackError('The manifest names a pack it does not describe.');
    return { id: entry.id, name: safeName(entry.name, ''), tracks: entry.tracks.map(readTrack) };
  });
  return { credits: packedFile(data.credits, /^credits(-\d+)?\.md$/), packs };
}

const packFolder = (name: string): string => `${MUSIC_FOLDER}/${name}`;
const trackPath = (pack: MusicPack, track: PackTrack): string => `${packFolder(pack.name)}/${track.vocals ? VOCALS_FOLDER : INSTRUMENTAL_FOLDER}/${track.name}`;

/** How many tracks of each pack lie in its folder; null until the music root has been read whole. */
export function musicPackTrackCounts(library: SoundLibrary): ReadonlyMap<string, number> | null {
  if (!library.locationOf('music') || !library.isWalked('music')) return library.rootOf('music').status === 'unlinked' ? new Map() : null;
  const files = library.filesOf('music');
  let counts = countsOfFiles.get(files);
  if (!counts) {
    // One pass, once per listing: the offer asks on every render of the rail, and a library may hold ten thousand files.
    const packOf = new Map(MUSIC_PACKS.map((pack) => [packFolder(pack.name), pack.id]));
    const found = new Map(MUSIC_PACKS.map((pack) => [pack.id, 0]));
    for (const { entry } of files) {
      const second = entry.path.indexOf('/', MUSIC_FOLDER.length + 1);
      const id = second < 0 ? undefined : packOf.get(entry.path.slice(0, second));
      if (id !== undefined) found.set(id, (found.get(id) ?? 0) + 1);
    }
    counts = found;
    countsOfFiles.set(files, counts);
  }
  return counts;
}

const countsOfFiles = new WeakMap<object, ReadonlyMap<string, number>>();

/**
 * The packs whose folder holds all their tracks; null until the music root has been read whole. A pack
 * with only some of them was stopped part way (or thinned out by hand) and is offered again, for the rest.
 */
export function installedMusicPacks(library: SoundLibrary): ReadonlySet<string> | null {
  const counts = musicPackTrackCounts(library);
  if (!counts) return null;
  return new Set(MUSIC_PACKS.filter((pack) => (counts.get(pack.id) ?? 0) >= pack.tracks).map((pack) => pack.id));
}

/** Whether this device could take a pack: the music root is linked here and reachable, or not linked at all (the default folder is linked then). */
export function mayInstallMusicPacks(library: SoundLibrary): boolean {
  const root = library.rootOf('music');
  if (root.status === 'unlinked') return true;
  return library.locationOf('music') !== null && !library.isMissing('music');
}

export interface MusicInstallOptions {
  /** Hears each track as it lands, and stops the install once its signal aborts. */
  progress?: DownloadProgress;
  fetch?: FetchBytes;
  /** The manifest to trust instead of the pinned one; tests only. */
  manifest?: PackedFile;
}

/**
 * Fetches the chosen packs into the music root's Vindsvept folder. Each track is checked against its size
 * and hash before it is written, so what lands is always whole; a track already there is left alone and
 * not fetched, so an interrupted download goes on where it stopped. A cancel starts no new track and writes
 * none still on its way; the tracks written stay. Returns the paths written.
 */
export async function installMusicPacks(library: SoundLibrary, ids: readonly string[], { progress, fetch = fetchBytes, manifest = MUSIC_MANIFEST }: MusicInstallOptions = {}): Promise<string[]> {
  const signal = progress?.signal;
  const catalogue = readManifest(await fetchVerified(HOST, manifest, fetch));
  signal?.throwIfAborted();
  const packs = catalogue.packs.filter((pack) => ids.includes(pack.id));
  if (packs.length !== ids.length) throw new StockPackError('The manifest lacks a pack this version offers.');
  const location = importRoot(library, 'music');
  if (!location) throw new StockPackError('The music folder is not linked on this device.', 'folder');
  await location.makeFolder(MUSIC_FOLDER);
  const creditsPath = `${MUSIC_FOLDER}/${CREDITS_NAME}`;
  if (!(await location.exists(creditsPath))) await location.write(creditsPath, new Blob([await fetchVerified(HOST, catalogue.credits, fetch)], { type: 'text/markdown' }));

  const jobs = packs.flatMap((pack) => pack.tracks.map((track) => ({ pack, track, path: trackPath(pack, track) })));
  progress?.expect({ bytes: jobs.reduce((sum, { track }) => sum + track.bytes, 0), files: jobs.length });
  // What lies there already is counted first, so the time left reads only what is still to come.
  const missing: typeof jobs = [];
  for (const job of jobs) {
    if (await location.exists(job.path)) progress?.fileDone(job.track.bytes, false);
    else missing.push(job);
  }
  for (const folder of new Set(missing.map(({ path }) => path.slice(0, path.lastIndexOf('/'))))) await location.makeFolder(folder);
  const written: string[] = [];
  // Once one track fails, the others start nothing new either: the run is over, and a retry must not meet them writing.
  let failed = false;
  const stopped = (): boolean => failed || signal?.aborted === true;
  try {
    await inPool(missing, PARALLEL, async ({ track, path }) => {
      if (stopped()) return;
      try {
        const bytes = await fetchVerified(HOST, track, fetch);
        if (stopped()) return;
        await location.write(path, new Blob([bytes], { type: 'audio/ogg' }));
      } catch (error) {
        failed = true;
        throw error;
      }
      written.push(path);
      progress?.fileDone(track.bytes, true);
    });
  } finally {
    // What landed is listed even when a later track failed or the download was cancelled.
    await library.reread('music');
    await library.settle('music', written);
  }
  signal?.throwIfAborted();
  return written;
}
