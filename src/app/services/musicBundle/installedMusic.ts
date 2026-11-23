/**
 * The music of the library's music root that came from the Armarium, found by its sidecars
 * (`musicProvenance.ts`): `Armarium.json` in a folder that holds audio, `<stem>.armarium.json` beside an Opus file.
 */

import type { SoundLibrary } from '../../soundLibrary/SoundLibrary';
import type { SoundLocation } from '../../soundLibrary/soundLocation';
import { joinRelative, nameOfRelative, parentOfRelative } from '../../soundLibrary/soundPaths';
import { inPool } from '../stockPacks/verifiedFetch';
import { ALBUM_SIDECAR, readSidecar, trackSidecarName, type MusicSidecar } from './musicProvenance';

/** A music install of the music root: where its sidecar lies, the folder its files lie in, and what the sidecar says. */
export interface InstalledMusic {
  sidecarPath: string;
  folder: string;
  sidecar: MusicSidecar;
}

export type MusicShelf = Pick<SoundLibrary, 'locationOf' | 'filesOf' | 'isWalked' | 'onChange' | 'rescan'>;

/** Sidecars read at a time: a disk folder answers each with a request of its own. */
const PARALLEL = 8;
const WALK_WAIT_MS = 15_000;

/** Settles once the music root has been read whole, asking for it where it was not; false where it cannot be. */
export function musicRootWalked(library: MusicShelf, withinMs = WALK_WAIT_MS): Promise<boolean> {
  if (library.locationOf('music') === null) return Promise.resolve(false);
  if (library.isWalked('music')) return Promise.resolve(true);
  library.rescan();
  if (withinMs <= 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (walked: boolean): void => {
      window.clearTimeout(timer);
      stop();
      resolve(walked);
    };
    const timer = window.setTimeout(() => done(false), withinMs);
    const stop = library.onChange(() => {
      if (library.locationOf('music') === null) done(false);
      else if (library.isWalked('music')) done(true);
    });
  });
}

async function sidecarAt(location: SoundLocation, path: string): Promise<MusicSidecar | null> {
  try {
    if (!(await location.exists(path))) return null;
    return readSidecar(await (await location.read(path)).text());
  } catch (error) {
    console.warn(`[Atlas] The Armarium sidecar ${path} could not be read:`, error);
    return null;
  }
}

/**
 * The sidecars of the music root, an album's or a single's: what the Armarium page is told is installed. Waits up to
 * `walkWaitMs` for the root's first walk; null where the root is not read whole by then, which is not the same as none
 * (an update planned on it would install beside its own install). A root that is not linked here holds none.
 */
export async function installedMusic(library: MusicShelf, walkWaitMs = WALK_WAIT_MS): Promise<InstalledMusic[] | null> {
  const location = library.locationOf('music');
  if (location === null) return [];
  if (!(await musicRootWalked(library, walkWaitMs))) return null;
  const paths = library.filesOf('music').map(({ entry }) => entry.path);
  const folders = [...new Set(paths.map(parentOfRelative))];
  const albums = (await inPool(folders, PARALLEL, async (folder): Promise<InstalledMusic | null> => {
    const sidecarPath = joinRelative(folder, ALBUM_SIDECAR);
    const sidecar = await sidecarAt(location, sidecarPath);
    return sidecar === null ? null : { sidecarPath, folder, sidecar };
  })).filter((found): found is InstalledMusic => found !== null);
  const albumFolders = new Set(albums.map((album) => album.folder));
  // A single is installed as Opus; nothing else needs its own look.
  const singles = paths.filter((path) => path.toLowerCase().endsWith('.opus') && !albumFolders.has(parentOfRelative(path)));
  const tracks = (await inPool(singles, PARALLEL, async (path): Promise<InstalledMusic | null> => {
    const folder = parentOfRelative(path);
    const sidecarPath = joinRelative(folder, trackSidecarName(nameOfRelative(path)));
    const sidecar = await sidecarAt(location, sidecarPath);
    return sidecar?.kind === 'music-track' ? { sidecarPath, folder, sidecar } : null;
  })).filter((found): found is InstalledMusic => found !== null);
  return [...albums.filter((album) => album.sidecar.kind === 'music-album'), ...tracks];
}

/** The install of the listing `uid`: where several name it, the newest version's, which took the listing's updates. */
export function installOf(installs: readonly InstalledMusic[], uid: string): InstalledMusic | null {
  return installs.reduce<InstalledMusic | null>((newest, install) => {
    if (install.sidecar.uid !== uid) return newest;
    return newest && newest.sidecar.version >= install.sidecar.version ? newest : install;
  }, null);
}
