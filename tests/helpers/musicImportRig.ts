import { readMusicBundle } from '../../src/app/services/musicBundle/musicBundleReader';
import { openMusicImport, type MusicImportSession } from '../../src/app/services/musicBundle/musicImport';
import { SoundLibrary } from '../../src/app/soundLibrary/SoundLibrary';
import type { SoundLocation } from '../../src/app/soundLibrary/soundLocation';
import type { SharedSoundRoots } from '../../src/app/soundLibrary/soundRootsStore';
import { SoundRoots } from '../../src/app/soundLibrary/SoundRoots';
import { deliveredMusic } from './musicBundles';

export const MUSIC_UID = '0123456789abcdef0123456789abcdef';

/** A library whose music root is `location`: linked on this device's disk unless `shared` says another place. */
export function musicLibraryOn(location: SoundLocation | null, shared: SharedSoundRoots = { music: { type: 'external' } }, local: string | null = '/Music'): SoundLibrary {
  const roots = new SoundRoots({
    shared: () => shared,
    setShared: () => undefined,
    onSharedChange: () => () => undefined,
    local: (kind) => (kind === 'music' ? local : null),
    setLocal: () => undefined,
    localOriginals: () => 'keep',
    setLocalOriginals: () => undefined,
    vaultBase: () => null,
    realPath: async (path) => path,
  });
  return new SoundLibrary({ roots, open: () => location, probeSeconds: async () => null });
}

/** The album Old Roads by Mara, as the Armarium delivers its listing `MUSIC_UID`. */
export const deliveredAlbum = async (version: number, titles: string[], artist: string | undefined = 'Mara'): Promise<Blob> =>
  deliveredMusic({ kind: 'music-album', uid: MUSIC_UID, version, name: 'Old Roads', artist, notes: version > 1 ? 'New songs' : undefined, titles });

/** Opens the review of `data`; `listingUid` null: a file from anywhere but the Armarium's download for this listing. */
export async function openInstall(library: SoundLibrary, data: Blob, listingUid: string | null = MUSIC_UID): Promise<MusicImportSession> {
  return openMusicImport(library, await readMusicBundle(data), { listingUid: listingUid ?? undefined, creator: 'Mara' });
}
