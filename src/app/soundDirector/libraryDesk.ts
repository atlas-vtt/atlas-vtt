import { MAX_MOOD_LAYERS, type SoundRecord } from '../sound/soundTypes';
import { t } from '../i18n';
import { MOOD_LIMITS } from '../soundLibrary/moodFile';
import { recordsByFile, recordsForFiles, soundOfFile, type RecordsSeam } from '../soundLibrary/libraryRecords';
import type { LibraryFile, SoundLibrary } from '../soundLibrary/SoundLibrary';
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
      if ((record.kind !== 'music' || intent === 'add') && !desk.addSound(record)) deps.notify(t('audio.add.refused', { name: record.name }));
    }
    const tracks = intent === 'add' ? [] : records.filter((record) => record.kind === 'music');
    if (tracks.length === 0) return;
    if (intent === 'now') desk.playNow(tracks);
    else desk.playNext(tracks);
  } finally {
    release();
  }
}

/** Plays music files as the list, in order or shuffled; the ambience stays. A list holds what a mood can: of more the first, as the GM is told. */
export async function listToMix(deps: LibraryDeskDeps, files: readonly LibraryFile[], shuffle: boolean): Promise<void> {
  const release = deps.director.holdForPress();
  try {
    if (files.length > MOOD_LIMITS.tracks) deps.notify(t('audio.add.listCut', { count: MOOD_LIMITS.tracks }));
    const records = await shelved(deps, files.slice(0, MOOD_LIMITS.tracks));
    deps.director.desk.playList(records, shuffle);
  } finally {
    release();
  }
}

/** The records files stand for, without writing any: an unrecorded file is a sound made for it alone. */
async function soundsOfFiles(deps: Pick<LibraryDeskDeps, 'records' | 'library'>, files: readonly LibraryFile[]): Promise<SoundRecord[]> {
  await deps.records.whenLoaded();
  const byFile = recordsByFile(deps.records.all(), deps.library);
  return files.flatMap((file) => {
    const audioPath = deps.library.audioPathOf(file.kind, file.path);
    return audioPath === null ? [] : [soundOfFile(byFile, file, audioPath)];
  });
}

/** Asks for files' copies in the background, writing no record. What has a copy already is skipped. */
export async function requestCopies(deps: Pick<LibraryDeskDeps, 'records' | 'library' | 'director'>, files: readonly LibraryFile[]): Promise<number> {
  const sounds = await soundsOfFiles(deps, files);
  deps.director.shelf.request(sounds);
  return sounds.length;
}

/**
 * Makes files' copies ahead of use, the first a list can hold, and at a table online offers them to players. This writes
 * no record: browsing and preparing cost the library nothing.
 * ponytail: the cut keeps a large library from churning the copies' cache out from under itself; say which to prepare if that is wanted.
 */
export async function prepareFiles(deps: LibraryDeskDeps, files: readonly LibraryFile[]): Promise<number> {
  const sounds = await soundsOfFiles(deps, files.slice(0, MOOD_LIMITS.tracks));
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

/** Whether what the mix holds of a file plays now: of a list only its one track, of ambience all it holds. */
export function soundsNow(held: HeldInMix | undefined, soundingKey: string | null): boolean {
  return held !== undefined && (held.type === 'layer' || (held.key !== null && held.key === soundingKey));
}

export function takeFromMix(director: SoundDirector, held: HeldInMix): void {
  if (held.type === 'layer') director.desk.removeLayer(held.id, held.key);
  else if (held.key === null) director.desk.removeWaitingTrack(held.id);
  else director.desk.removeTrack(held.key);
}
