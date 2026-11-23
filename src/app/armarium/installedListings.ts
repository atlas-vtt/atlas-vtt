import type { App } from 'obsidian';
import type { AssetService } from '../services/AssetService';
import { readInstallRecord } from '../services/collectionBundle/installRecord';
import { installedItems } from '../services/itemBundle/installedItems';
import { installedMusic, musicRootWalked } from '../services/musicBundle/installedMusic';
import { SoundLibrary } from '../soundLibrary/SoundLibrary';
import type { ArmariumRequest } from './armariumRequest';

/**
 * The versions of the listings the vault's collections came from. A collection listing's uid is the uid of the
 * collection its bundle carries (`manifest.collection.uid`), which an import keeps as the collection's and writes
 * into its install record.
 */
async function installedCollections(app: App, assets: AssetService, listed: ReadonlySet<string>): Promise<ArmariumRequest[]> {
  const collections = (await assets.getCollections()).filter((collection) => listed.has(collection.uid));
  // Read together: the page waits on the answer to show its Install buttons.
  const records = await Promise.all(collections.map(async (collection) => {
    try {
      return await readInstallRecord(app, collection);
    } catch (error) {
      console.error(`[Atlas] Reading the install record of ${collection.id} failed:`, error);
      return null;
    }
  }));
  return records.flatMap((record) => (record ? [{ uid: record.uid, version: record.version }] : []));
}

/** The versions of the listings the vault's single items came from, by the provenance in their own files. */
async function installedItemListings(app: App, listed: ReadonlySet<string>): Promise<ArmariumRequest[]> {
  try {
    return (await installedItems(app)).filter((item) => listed.has(item.provenance.uid))
      .map(({ provenance }) => ({ uid: provenance.uid, version: provenance.version }));
  } catch (error) {
    console.error('[Atlas] Reading the installed templates, game systems and dice sets failed:', error);
    return [];
  }
}

/** How long the page waits, at most, to hear what the music root holds once its first walk ends. */
const MUSIC_WALK_WAIT_MS = 120_000;

/** The library the music installs lie in: opened if it was not, since an install from the page opens it too. Null where none can be. */
function musicLibrary(app: App): SoundLibrary | null {
  try {
    return SoundLibrary.forApp(app);
  } catch (error) {
    console.error('[Atlas] The sound library could not be opened:', error);
    return null;
  }
}

/**
 * The versions of the listings the music root's albums and tracks came from, by their sidecars, as far as the root has
 * been read: waits for nothing, and asks for the first walk where it was not made yet (`musicWalkEnds` says when).
 */
async function installedMusicListings(app: App, listed: ReadonlySet<string>): Promise<ArmariumRequest[]> {
  const library = musicLibrary(app);
  if (library === null) return [];
  try {
    return ((await installedMusic(library, 0)) ?? []).filter(({ sidecar }) => listed.has(sidecar.uid)).map(({ sidecar }) => ({ uid: sidecar.uid, version: sidecar.version }));
  } catch (error) {
    console.error('[Atlas] Reading the music installed from the Armarium failed:', error);
    return [];
  }
}

/**
 * Settles true once the music root's first walk ends, where it had not when asked, so the page hears what is installed
 * again; false where it was walked already or cannot be (nothing more will come). Asked with the installed listings.
 */
export function musicWalkEnds(app: App): Promise<boolean> {
  const library = musicLibrary(app);
  if (library === null || library.locationOf('music') === null || library.isWalked('music')) return Promise.resolve(false);
  return musicRootWalked(library, MUSIC_WALK_WAIT_MS);
}

/**
 * The releases of Armarium listings the vault holds, the newest of each: collections by their install records,
 * statblock templates, game systems and dice sets by the provenance in their files, music by the sidecars beside it.
 * Only uids in `listed` are told: the page learns nothing of what is not the Armarium's.
 */
export async function installedListings(app: App, assets: AssetService, listed: ReadonlySet<string>): Promise<ArmariumRequest[]> {
  const found = await Promise.all([installedCollections(app, assets, listed), installedItemListings(app, listed), installedMusicListings(app, listed)]);
  const versions = new Map<string, number>();
  for (const { uid, version } of found.flat()) versions.set(uid, Math.max(version, versions.get(uid) ?? 0));
  return [...versions].map(([uid, version]) => ({ uid, version }));
}
