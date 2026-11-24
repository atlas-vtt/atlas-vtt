import { forPlayers, readAtlasCopy } from '../../sound/codec/atlasOpus';
import type { FileRanges } from '../../sound/codec/fileRanges';
import type { SoundRecord } from '../../sound/soundTypes';
import type { SoundDirector } from '../../soundDirector/SoundDirector';
import { recordsByFile, soundOfFile } from '../../soundLibrary/libraryRecords';
import type { LibraryFile, SoundLibrary } from '../../soundLibrary/SoundLibrary';
import type { SoundRecordStore } from '../../soundLibrary/SoundRecordStore';
import type { PreparedTrack } from './MusicShareSession';

export interface MusicCopiesDeps {
  library: Pick<SoundLibrary, 'locationOf' | 'audioPathOf' | 'pathNow' | 'roots'>;
  director: Pick<SoundDirector, 'shelf' | 'subscribe'>;
  records: Pick<SoundRecordStore, 'whenLoaded' | 'all'>;
}

/** The copy as it leaves the device: what players get, so neither the source's hash nor its name goes along. */
async function shared(copy: Blob, frames: number): Promise<PreparedTrack> {
  return { state: 'ready', copy: await forPlayers(copy), frames };
}

/**
 * Prepares a music file of the library for sharing: a file that is an Atlas copy is read as it is; any other goes
 * through the copy shelf, as a press of it would (a record is made for none), and only where the GM agreed to
 * converting the music folder. Returns the release: what it tells after that is not heard.
 */
export function prepareTrackCopy({ library, director, records }: MusicCopiesDeps, file: LibraryFile, listener: (state: PreparedTrack) => void): () => void {
  let live = true;
  let unsubscribe = (): void => undefined;
  let told = '';
  const tell = (state: PreparedTrack): void => {
    // The director tells of every change it has, a fader's too: a step is told once.
    const step = state.state === 'converting' ? `converting ${state.progress ?? ''}` : state.state;
    if (!live || step === told) return;
    told = step;
    if (state.state === 'ready' || state.state === 'refused') {
      live = false;
      unsubscribe();
    }
    listener(state);
  };

  const throughShelf = (sound: SoundRecord): void => {
    let fetching = false;
    const check = (): void => {
      if (!live || fetching) return;
      const conversion = director.shelf.stateOf(sound);
      const info = director.shelf.infoOf(sound);
      if (conversion.state === 'refused') tell({ state: 'refused', reason: conversion.reason });
      else if (conversion.state === 'ready' && info && !info.growing) {
        fetching = true;
        void director.shelf.storedBytes(info.key)
          .then(async (bytes) => tell({ state: 'ready', copy: new Blob([await bytes.read(0, bytes.byteLength)], { type: 'audio/ogg' }), frames: info.frames }))
          .catch(() => tell({ state: 'refused', reason: 'unreadable' }));
      } else tell({ state: 'converting', progress: conversion.state === 'converting' ? conversion.progress : null });
    };
    unsubscribe = director.subscribe(check);
    director.shelf.request([sound], true);
    check();
  };

  const run = async (): Promise<void> => {
    tell({ state: 'reading' });
    const location = library.locationOf(file.kind);
    const stat = location ? await location.stat(file.path) : null;
    const audioPath = library.audioPathOf(file.kind, file.path);
    if (!location || !stat || audioPath === null) return tell({ state: 'refused', reason: 'gone' });
    const ranges: FileRanges = { size: stat.size, read: (start, end) => location.readRange(file.path, start, end) };
    const facts = await readAtlasCopy(ranges).catch(() => null);
    if (facts) return tell(await shared(await location.read(file.path), facts.frames));
    // A conversion waits for the GM's choice for the folder; the share does not ask for it.
    if (library.roots.originalsOf(file.kind) === null) return tell({ state: 'refused', reason: 'consent' });
    await records.whenLoaded();
    if (live) throughShelf(soundOfFile(recordsByFile(records.all(), library), file, audioPath));
  };
  void run().catch((error: unknown) => {
    console.error(`[Atlas] Could not prepare ${file.path} for the Armarium:`, error);
    tell({ state: 'refused', reason: 'unreadable' });
  });
  return () => {
    live = false;
    unsubscribe();
  };
}
