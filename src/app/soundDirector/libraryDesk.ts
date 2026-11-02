import type { AssetService } from '../services/AssetService';
import type { SoundKind, SoundRecord } from '../sound/soundTypes';
import { MAX_MOOD_LAYERS } from '../sound/soundTypes';
import { t } from '../i18n';
import { MOOD_LIMITS } from '../soundLibrary/moodFile';
import { recordsForFiles, unrecordedSound } from '../soundLibrary/libraryRecords';
import type { SoundDrag } from '../soundLibrary/soundDrag';
import type { LibraryFile, SoundLibrary } from '../soundLibrary/SoundLibrary';
import type { SoundLocation } from '../soundLibrary/soundLocation';
import { parentOfRelative } from '../soundLibrary/soundPaths';
import { mixHolding } from './libraryMix';
import type { SoundDirector } from './SoundDirector';

export interface LibraryDeskDeps {
  assets: AssetService;
  library: SoundLibrary;
  director: SoundDirector;
  notify: (message: string) => void;
}

/** What the library asks of the mix: music now or next, ambience added. */
export type MixIntent = 'now' | 'next' | 'add';

/** Records for files, known to the shelf by the time this settles. */
async function shelved(deps: LibraryDeskDeps, files: readonly LibraryFile[], collectionId: string): Promise<SoundRecord[]> {
  const records = await recordsForFiles(deps.assets, deps.library, files, collectionId);
  await deps.director.shelf.refresh();
  return records;
}

/** Sends files to the mix. Their records are made here, in `collectionId`: the collection of the mood or mix in use. */
export async function fileToMix(deps: LibraryDeskDeps, files: readonly LibraryFile[], intent: MixIntent, collectionId: string): Promise<void> {
  const { desk } = deps.director;
  deps.director.tap();
  for (const record of await shelved(deps, files, collectionId)) {
    if (record.kind === 'ambience' || intent === 'add') {
      if (desk.addSound(record)) continue;
      const full = record.kind === 'ambience' && deps.director.snapshot().mix.table.layers.length >= MAX_MOOD_LAYERS;
      deps.notify(full ? t('audio.add.full', { count: MAX_MOOD_LAYERS }) : t('audio.add.refused', { name: record.name }));
    } else if (intent === 'now') {
      desk.playNow(record);
    } else {
      desk.playNext(record);
    }
  }
}

/** A folder's files in order: those directly in it, and where it holds none, all those below it. A list has the length a mood can hold. */
export async function filesToPlay(location: SoundLocation, kind: SoundKind, folder: string): Promise<LibraryFile[]> {
  const found: LibraryFile[] = [];
  const direct = await location.list(folder);
  if (!direct) return [];
  if (direct.files.length > 0) return direct.files.slice(0, MOOD_LIMITS.tracks).map((file) => ({ ...file, kind }));
  const stack = [...direct.folders].reverse();
  for (let next = stack.pop(); next && found.length < MOOD_LIMITS.tracks; next = stack.pop()) {
    const listing = await location.list(next.path);
    if (!listing) continue;
    found.push(...listing.files.map((file) => ({ ...file, kind })));
    stack.push(...[...listing.folders].reverse());
  }
  return found.slice(0, MOOD_LIMITS.tracks);
}

/** Plays a music folder as the list, in order or shuffled; the ambience stays. */
export async function folderToMix(deps: LibraryDeskDeps, kind: SoundKind, folder: string, shuffle: boolean, collectionId: string): Promise<void> {
  const location = deps.library.locationOf(kind);
  if (!location) return;
  deps.director.tap();
  const files = await filesToPlay(location, kind, folder);
  const records = await shelved(deps, files, collectionId);
  deps.director.desk.playList(records, shuffle);
}

/** What a drop on the desk does: music joins as next, ambience is added, a folder of music becomes the list. */
export async function dragToMix(deps: LibraryDeskDeps, drag: SoundDrag, collectionId: string): Promise<void> {
  await fileToMix(deps, drag.files, 'next', collectionId);
  for (const folder of drag.folders) {
    const location = deps.library.locationOf(folder.kind);
    if (!location) continue;
    if (folder.kind === 'music') await folderToMix(deps, folder.kind, folder.path, false, collectionId);
    else await fileToMix(deps, await filesToPlay(location, folder.kind, folder.path), 'add', collectionId);
  }
}

/** Makes a folder's copies ahead of use. This writes no record: browsing and preparing cost the library nothing. */
export async function prepareFolder(deps: LibraryDeskDeps, kind: SoundKind, folder: string, collectionId: string): Promise<number> {
  const location = deps.library.locationOf(kind);
  if (!location) return 0;
  const files = await filesToPlay(location, kind, folder);
  const sounds = files.flatMap((file) => {
    const audioPath = deps.library.audioPathOf(kind, file.path);
    return audioPath === null ? [] : [unrecordedSound(file, audioPath, collectionId)];
  });
  await deps.library.ensureListed(kind, files.map((file) => parentOfRelative(file.path)));
  deps.director.shelf.request(sounds);
  return sounds.length;
}

/** What the mix holds of a file: how to take it out again. */
export interface HeldInMix {
  type: 'track' | 'layer';
  id: string;
  key: string | null;
}

/** What the mix holds, by the file a record stands for: a file may have two records, and one copy serves both. */
export function heldInMix(director: SoundDirector): ReadonlyMap<string, HeldInMix> {
  const { shelf } = director;
  const holding = mixHolding(director.snapshot().mix, director.now(), (key) => shelf.idOfKey(key));
  const held = new Map<string, HeldInMix>();
  const note = (type: HeldInMix['type'], list: ReadonlyMap<string, string | null>): void => {
    for (const [id, key] of list) {
      const path = shelf.recordOf(id)?.filePath;
      if (path !== undefined) held.set(path, { type, id, key });
    }
  };
  note('track', holding.tracks);
  note('layer', holding.layers);
  return held;
}

export function takeFromMix(director: SoundDirector, held: HeldInMix): void {
  if (held.type === 'layer') director.desk.removeLayer(held.id, held.key);
  else if (held.key === null) director.desk.removeWaitingTrack(held.id);
  else director.desk.removeTrack(held.key);
}
