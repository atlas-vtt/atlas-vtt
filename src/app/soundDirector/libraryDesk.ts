import { MAX_MOOD_LAYERS, type SoundKind, type SoundRecord } from '../sound/soundTypes';
import { t } from '../i18n';
import { MOOD_LIMITS } from '../soundLibrary/moodFile';
import { recordsForFiles, soundOfFile, type RecordsSeam } from '../soundLibrary/libraryRecords';
import type { SoundDrag } from '../soundLibrary/soundDrag';
import type { LibraryFile, SoundLibrary } from '../soundLibrary/SoundLibrary';
import type { SoundLocation } from '../soundLibrary/soundLocation';
import { parentOfRelative } from '../soundLibrary/soundPaths';
import { mixHolding } from './libraryMix';
import type { SoundDirector } from './SoundDirector';

export interface LibraryDeskDeps {
  records: RecordsSeam;
  library: SoundLibrary;
  director: SoundDirector;
  notify: (message: string) => void;
}

/** What the library asks of the mix: music now or next, ambience added. */
export type MixIntent = 'now' | 'next' | 'add';

/** Records for files, known to the shelf by the time this settles. */
async function shelved(deps: LibraryDeskDeps, files: readonly LibraryFile[]): Promise<SoundRecord[]> {
  const records = await recordsForFiles(deps.records, deps.library, files);
  await deps.director.shelf.refresh();
  return records;
}

/** The files the mix has room for, told once for each kind that has too little: no record is made for what cannot enter. Play now always enters, replacing what sounds. */
function filesWithRoom(deps: LibraryDeskDeps, files: readonly LibraryFile[], intent: MixIntent): LibraryFile[] {
  const { mix } = deps.director.snapshot();
  let layerRoom = MAX_MOOD_LAYERS - mix.table.layers.length - mix.waitingLayers.length;
  let trackRoom = intent === 'now' ? Infinity : MOOD_LIMITS.tracks - ((mix.listChange ?? mix.table.music)?.tracks.length ?? 0) - (mix.waitingMusic?.tracks.length ?? 0);
  const fitting = files.filter((file) => (file.kind === 'ambience' ? layerRoom-- : trackRoom--) > 0);
  if (layerRoom < 0) deps.notify(t('audio.add.full', { count: MAX_MOOD_LAYERS }));
  if (trackRoom < 0) deps.notify(t('audio.add.listFull', { count: MOOD_LIMITS.tracks }));
  return fitting;
}

/** Sends files to the mix. Their records are made here. */
export async function fileToMix(deps: LibraryDeskDeps, files: readonly LibraryFile[], intent: MixIntent): Promise<void> {
  const { desk } = deps.director;
  const release = deps.director.holdForPress();
  try {
    const records = await shelved(deps, filesWithRoom(deps, files, intent));
    for (const record of records) {
      if (record.kind !== 'music' || intent === 'add') {
        if (!desk.addSound(record)) deps.notify(t('audio.add.refused', { name: record.name }));
      }
    }
    const tracks = intent === 'add' ? [] : records.filter((record) => record.kind === 'music');
    if (tracks.length === 0) return;
    if (intent === 'now') desk.playNow(tracks);
    else desk.playNext(tracks);
  } finally {
    release();
  }
}

/** A folder's files in order, at most `limit`: those directly in it, and where it holds none, all those below it. */
export async function filesToPlay(location: SoundLocation, kind: SoundKind, folder: string, limit: number = MOOD_LIMITS.tracks): Promise<LibraryFile[]> {
  const found: LibraryFile[] = [];
  const direct = await location.list(folder);
  if (!direct) return [];
  if (direct.files.length > 0) return direct.files.slice(0, limit).map((file) => ({ ...file, kind }));
  const stack = [...direct.folders].reverse();
  for (let next = stack.pop(); next && found.length < limit; next = stack.pop()) {
    const listing = await location.list(next.path);
    if (!listing) continue;
    found.push(...listing.files.map((file) => ({ ...file, kind })));
    stack.push(...[...listing.folders].reverse());
  }
  return found.slice(0, limit);
}

/** Plays a music folder as the list, in order or shuffled; the ambience stays. A list holds what a mood can: of a larger folder the first, as the GM is told. */
export async function folderToMix(deps: LibraryDeskDeps, kind: SoundKind, folder: string, shuffle: boolean): Promise<void> {
  const location = deps.library.locationOf(kind);
  if (!location) return;
  const release = deps.director.holdForPress();
  try {
    const files = await filesToPlay(location, kind, folder, MOOD_LIMITS.tracks + 1);
    if (files.length > MOOD_LIMITS.tracks) deps.notify(t('audio.add.folderCut', { count: MOOD_LIMITS.tracks }));
    const records = await shelved(deps, files.slice(0, MOOD_LIMITS.tracks));
    deps.director.desk.playList(records, shuffle);
  } finally {
    release();
  }
}

/** What a drop on the desk does: music joins as next, ambience is added, a folder of music becomes the list. */
export async function dragToMix(deps: LibraryDeskDeps, drag: SoundDrag): Promise<void> {
  const release = deps.director.holdForPress();
  try {
    await fileToMix(deps, drag.files, 'next');
    for (const folder of drag.folders) {
      const location = deps.library.locationOf(folder.kind);
      if (!location) continue;
      if (folder.kind === 'music') await folderToMix(deps, folder.kind, folder.path, false);
      else await fileToMix(deps, await filesToPlay(location, folder.kind, folder.path), 'add');
    }
  } finally {
    release();
  }
}

/** Makes a folder's copies ahead of use, and at a table online offers them to players. This writes no record: browsing and preparing cost the library nothing. */
export async function prepareFolder(deps: LibraryDeskDeps, kind: SoundKind, folder: string): Promise<number> {
  const location = deps.library.locationOf(kind);
  if (!location) return 0;
  const files = await filesToPlay(location, kind, folder);
  await deps.records.whenLoaded();
  const stored = deps.records.all();
  const sounds = files.flatMap((file) => {
    const audioPath = deps.library.audioPathOf(kind, file.path);
    return audioPath === null ? [] : [soundOfFile(stored, file, audioPath)];
  });
  await deps.library.ensureListed(kind, files.map((file) => parentOfRelative(file.path)));
  deps.director.shelf.request(sounds);
  deps.director.players.sounds?.prepare(sounds);
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
      const record = shelf.recordOf(id);
      if (record) held.set(shelf.pathNow(record), { type, id, key });
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
