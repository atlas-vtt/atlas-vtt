import type { SoundRecord } from '@/app/sound/soundTypes';
import type { LibraryDeskDeps } from '@/app/soundDirector/libraryDesk';
import type { SoundLibrary } from '@/app/soundLibrary/SoundLibrary';
import { soundRecordOf, type StoredSound } from '@/app/soundLibrary/soundRecords';
import { FakeSoundLocation } from './fakeSoundLocation';
import { directorRig, type DirectorRig } from './soundDirectorRig';

export interface LibraryDeskRig {
  rig: DirectorRig;
  location: FakeSoundLocation;
  stored: StoredSound[];
  deps: LibraryDeskDeps;
}

/** A desk over real records: what `recordsForFiles` made is what the shelf reads next. */
export function libraryDeskRig(records: SoundRecord[]): LibraryDeskRig {
  const rig = directorRig(records);
  const location = new FakeSoundLocation();
  const stored: StoredSound[] = [];
  const library = {
    locationOf: () => location,
    audioPathOf: (_kind: string, path: string) => `audio/${path}`,
    pathNow: (audioPath: string) => audioPath,
  } as unknown as SoundLibrary;
  const seam: LibraryDeskDeps['records'] = {
    whenLoaded: () => Promise.resolve(),
    all: () => stored,
    add: (fresh) => {
      stored.push(...fresh);
      rig.records.push(...fresh.map(soundRecordOf));
    },
  };
  return { rig, location, stored, deps: { records: seam, library, director: rig.director, notify: (message) => rig.notices.push(message) } };
}
