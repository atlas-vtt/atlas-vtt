import { fetchBytes, fetchVerified, StockPackError, type FetchBytes, type PackedFile } from '../services/stockPacks/verifiedFetch';
import { importRoot } from './libraryOperations';
import type { SoundLibrary } from './SoundLibrary';

/**
 * Where the starter ambience lies. A pack is never changed in place: a new pack is a new folder
 * on the host and a new list below, so the hashes here always name what is served.
 */
const STARTER_HOST = 'https://assets.atlas-vtt.dev/starter/ambience-1/';

/** The folder of the ambience root the pack goes to; its name is the tracks' tag. */
export const STARTER_FOLDER = 'Starter ambience';

export interface StarterFile extends PackedFile {
  /** Its name in the GM's folder. */
  name: string;
  type: string;
}

const AUDIO = 'audio/ogg';

/** CC0 recordings, cut to seamless loops; their sources are in `credits.md`. */
export const STARTER_FILES: readonly StarterFile[] = [
  { key: 'quiet-forest.ogg', name: 'Quiet forest.ogg', bytes: 2_745_587, sha256: 'cb817204c73738517dbc05f9ac61cdddb4fe0ea1604de7366b1f53289a176344', type: AUDIO },
  { key: 'campfire.ogg', name: 'Campfire.ogg', bytes: 4_221_306, sha256: 'ce87b7d516cd7786ec6c3f24c1917677784b3ac64484cf3365f37640c2f9e982', type: AUDIO },
  { key: 'thunderstorm.ogg', name: 'Thunderstorm.ogg', bytes: 1_524_571, sha256: 'e960c53378a3addc2a8e9e127c5cadd7cc25e5ddb85e3741d6636231ba297490', type: AUDIO },
  { key: 'beach-waves.ogg', name: 'Beach waves.ogg', bytes: 2_276_399, sha256: '48f58f46c331cb110d54d05123e4a3ac358237746ea0f96556ba409bf8a3cf12', type: AUDIO },
  { key: 'night-marsh.ogg', name: 'Night marsh.ogg', bytes: 1_656_392, sha256: 'ef68d3ce929d18f3d2e67e5826c01c3e709588e0ebf90a86d67688885981df57', type: AUDIO },
  { key: 'cave.ogg', name: 'Cave.ogg', bytes: 1_196_882, sha256: '97abb4305f52878bc2edf57daee64e6e555fd041f97d139c949f17d987ae2b63', type: AUDIO },
  { key: 'credits.md', name: 'Credits.md', bytes: 938, sha256: '64a61ebedf6e471731647355e6fd14bcefa1d42c08a4f39c361dafadf4c7df07', type: 'text/markdown' },
];

const STARTER_SOUNDS = STARTER_FILES.filter((file) => file.type === AUDIO);
export const STARTER_SOUND_COUNT = STARTER_SOUNDS.length;
export const STARTER_BYTES = STARTER_FILES.reduce((sum, file) => sum + file.bytes, 0);

export interface InstallOptions {
  /** Hears the share of the pack's bytes fetched so far. */
  onStep?: (share: number) => void;
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
 * into the ambience root's starter folder, so a broken download leaves nothing behind. A file already
 * there is left alone.
 */
export async function installStarterPack(library: SoundLibrary, { onStep, fetch = fetchBytes, files = STARTER_FILES }: InstallOptions = {}): Promise<void> {
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  const fetched: { file: StarterFile; bytes: ArrayBuffer }[] = [];
  let done = 0;
  onStep?.(0);
  for (const file of files) {
    const bytes = await fetchVerified(STARTER_HOST, file, fetch);
    fetched.push({ file, bytes });
    done += file.bytes;
    onStep?.(done / total);
  }
  const location = importRoot(library, 'ambience');
  if (!location) throw new StockPackError('The ambience folder is not linked on this device.');
  await location.makeFolder(STARTER_FOLDER);
  for (const { file, bytes } of fetched) {
    const filePath = pathOf(file);
    if (!(await location.exists(filePath))) await location.write(filePath, new Blob([bytes], { type: file.type }));
  }
  // The top alone would not list the new folder's files, which the caller prepares at once.
  await library.reread('ambience');
  await library.settle('ambience', fetched.map(({ file }) => pathOf(file)));
}
