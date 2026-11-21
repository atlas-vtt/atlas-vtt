import { fetchBytes, fetchVerified, StockPackError, type FetchBytes, type PackedFile } from '../services/stockPacks/verifiedFetch';
import type { DownloadProgress } from '../downloads/downloadTypes';
import { importRoot } from './libraryOperations';
import type { SoundLibrary } from './SoundLibrary';

/**
 * Where the starter ambience lies. A pack is never changed in place: a new pack is a new folder
 * on the host and a new list below, so the hashes here always name what is served.
 */
const STARTER_HOST = 'https://assets.atlas-vtt.dev/starter/ambience-2/';

/** The folder of the ambience root the pack goes to; its name is the tracks' tag. */
export const STARTER_FOLDER = 'Starter ambience';

export interface StarterFile extends PackedFile {
  /** Its name in the GM's folder. */
  name: string;
  type: string;
}

const AUDIO = 'audio/ogg';

/**
 * CC0 recordings, cut to seamless loops; their sources are in `credits.md`. Each is an Atlas copy, made as Atlas
 * makes one from the loop a GM imports (`ATLAS_FROM` the `.ogg` the first pack held), so it plays as it lands.
 */
export const STARTER_FILES: readonly StarterFile[] = [
  { key: 'quiet-forest.opus', name: 'Quiet forest.opus', bytes: 1_894_912, sha256: '62674b1cabda4e411c423822594e100fafe87899a2fb050271f66f47f0b8a78d', type: AUDIO },
  { key: 'campfire.opus', name: 'Campfire.opus', bytes: 2_682_518, sha256: '5787725beaf4c0aff3ebbb4279df53c6d249ec39d31a67dc6fc959cf3935a0de', type: AUDIO },
  { key: 'thunderstorm.opus', name: 'Thunderstorm.opus', bytes: 1_389_867, sha256: '8a0870ca42db8550ba624f5eddc155176e958218fc9b08b85d07f72998a259e8', type: AUDIO },
  { key: 'beach-waves.opus', name: 'Beach waves.opus', bytes: 1_778_401, sha256: '1fe635dc916e1e1baa5cf03ff92678232d68036dea856b72e03bca3700127363', type: AUDIO },
  { key: 'night-marsh.opus', name: 'Night marsh.opus', bytes: 767_466, sha256: '0f327f1cc957f0a165f4d20ee54cab9cd4a2bdf941826fe9a35ca1bfabb71e1d', type: AUDIO },
  { key: 'cave.opus', name: 'Cave.opus', bytes: 693_124, sha256: '896f2bd7282453fda515498687b7fdc22abda39c355468416a3e4e5399baff8f', type: AUDIO },
  { key: 'credits.md', name: 'Credits.md', bytes: 938, sha256: '64a61ebedf6e471731647355e6fd14bcefa1d42c08a4f39c361dafadf4c7df07', type: 'text/markdown' },
];

const STARTER_SOUNDS = STARTER_FILES.filter((file) => file.type === AUDIO);
export const STARTER_SOUND_COUNT = STARTER_SOUNDS.length;
export const STARTER_BYTES = STARTER_FILES.reduce((sum, file) => sum + file.bytes, 0);

export interface InstallOptions {
  /** Hears each file as it is fetched, and stops the install once its signal aborts. */
  progress?: DownloadProgress;
  fetch?: FetchBytes;
  files?: readonly StarterFile[];
}

function pathOf(file: StarterFile): string {
  return `${STARTER_FOLDER}/${file.name}`;
}

/** Whether the ambience root holds any of the pack's sounds where the pack puts them. A GM who deleted some kept the rest on purpose. */
export async function hasStarterPack(library: SoundLibrary): Promise<boolean> {
  const location = library.locationOf('ambience');
  if (!location) return false;
  for (const file of STARTER_SOUNDS) if (await location.exists(pathOf(file))) return true;
  return false;
}

/** Whether this device could take the pack: the ambience root is linked here and reachable, or not linked at all (the default folder is linked then). */
export function mayInstallStarterPack(library: SoundLibrary): boolean {
  const root = library.rootOf('ambience');
  if (root.status === 'unlinked') return true;
  return library.locationOf('ambience') !== null && !library.isMissing('ambience');
}

/**
 * Fetches every file of the pack, checks each against its size and hash, and only then writes them
 * into the ambience root's starter folder, so a broken or cancelled download leaves nothing behind.
 * A file already there is left alone.
 */
export async function installStarterPack(library: SoundLibrary, { progress, fetch = fetchBytes, files = STARTER_FILES }: InstallOptions = {}): Promise<void> {
  const signal = progress?.signal;
  progress?.expect({ bytes: files.reduce((sum, file) => sum + file.bytes, 0), files: files.length });
  const fetched: { file: StarterFile; bytes: ArrayBuffer }[] = [];
  for (const file of files) {
    signal?.throwIfAborted();
    const bytes = await fetchVerified(STARTER_HOST, file, fetch);
    fetched.push({ file, bytes });
    progress?.fileDone(file.bytes, true);
  }
  signal?.throwIfAborted();
  const location = importRoot(library, 'ambience');
  if (!location) throw new StockPackError('The ambience folder is not linked on this device.', 'folder');
  await location.makeFolder(STARTER_FOLDER);
  for (const { file, bytes } of fetched) {
    const filePath = pathOf(file);
    if (!(await location.exists(filePath))) await location.write(filePath, new Blob([bytes], { type: file.type }));
  }
  // The top alone would not list the new folder's files, which the caller prepares at once.
  await library.reread('ambience');
  await library.settle('ambience', fetched.map(({ file }) => pathOf(file)));
}
