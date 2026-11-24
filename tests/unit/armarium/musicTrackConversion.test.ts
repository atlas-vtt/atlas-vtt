import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicShareSession } from '@/app/armarium/upload/MusicShareSession';
import { prepareTrackCopy } from '@/app/armarium/upload/musicTrackCopies';
import type { OwnListing } from '@/app/armarium/upload/uploadContract';
import type { SoundImportJob, SoundImportResult } from '@/app/sound/codec/soundImporter';
import type { SoundDirector } from '@/app/soundDirector/SoundDirector';
import type { SoundFileAccess } from '@/app/soundDirector/soundCopies';
import { SoundShelf } from '@/app/soundDirector/soundShelf';
import { LibraryCopyFolder } from '@/app/soundLibrary/libraryCopyFolder';
import type { RecordsSeam } from '@/app/soundLibrary/libraryRecords';
import { SoundLibrary, type LibraryFile } from '@/app/soundLibrary/SoundLibrary';
import { soundRecordOf, type StoredSound } from '@/app/soundLibrary/soundRecords';
import type { SoundRecordStore } from '@/app/soundLibrary/SoundRecordStore';
import { SoundRoots, type OriginalsChoice } from '@/app/soundLibrary/SoundRoots';
import { sha256 } from '@/app/utils/hashing';
import { keyOf, taggedCopy } from '../../helpers/atlasCopies';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';
import { FakeArmarium, noSleep } from './shareFakes';

const SOURCE = 'Realms/Volume II.flac';
const KEY = keyOf('c');

type Records = RecordsSeam & Pick<SoundRecordStore, 'rewrite'>;

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 40; turn++) await vi.advanceTimersByTimeAsync(50);
};

function memoryRecords(): Records {
  const stored: StoredSound[] = [];
  return {
    whenLoaded: () => Promise.resolve(),
    all: () => stored,
    add: (sounds) => {
      stored.push(...sounds);
    },
    rewrite: (change) => {
      let changed = false;
      stored.forEach((sound, at) => {
        const next = change(sound);
        if (next) stored[at] = next;
        changed ||= next !== null;
      });
      return changed;
    },
  };
}

/** A conversion the test ends: it runs while the share watches. */
function heldMaker(): { maker: { run: (job: SoundImportJob, progress: (share: number) => void) => Promise<SoundImportResult>; dispose: () => void }; progress: (share: number) => void; finish: () => Promise<void> } {
  let job: SoundImportJob | null = null;
  let told: (share: number) => void = () => undefined;
  let end: (result: SoundImportResult) => void = () => undefined;
  return {
    maker: {
      run: (asked, progress) => {
        job = asked;
        told = progress;
        return new Promise((resolve) => (end = resolve));
      },
      dispose: () => undefined,
    },
    progress: (share) => told(share),
    finish: async () => {
      if (!job) throw new Error('No conversion runs.');
      end({ bytes: await taggedCopy({ key: job.key, from: job.from }), frames: 3_600 * 48_000, channels: 2, lufs: -20, truePeakDb: -3, peaks: null });
    },
  };
}

/** A music folder on a disk, holding a FLAC Atlas has not converted yet, with the GM's choice for its originals given. */
async function folderWith(choice: OriginalsChoice): Promise<{ library: SoundLibrary; shelf: SoundShelf; records: Records; conversion: ReturnType<typeof heldMaker>; subscribe: (listener: () => void) => () => void }> {
  const location = new FakeSoundLocation();
  location.put(SOURCE, new Blob(['fLaC not converted']));
  const roots = new SoundRoots({
    shared: () => ({ music: { type: 'external' } }),
    setShared: () => undefined,
    onSharedChange: () => () => undefined,
    local: (kind) => (kind === 'music' ? '/home/gm/Music' : null),
    setLocal: () => undefined,
    localOriginals: () => choice,
    setLocalOriginals: () => undefined,
    vaultBase: () => null,
    realPath: async (path) => path,
  });
  const library = new SoundLibrary({ roots, open: () => location, probeSeconds: async () => null });
  const records = memoryRecords();
  const files: SoundFileAccess = {
    statOf: ({ filePath, audioSize }) => library.statOfFile(filePath, audioSize),
    read: ({ filePath, audioSize }) => library.readFile(filePath, audioSize),
    pathNow: ({ filePath, audioSize }) => library.pathNow(filePath, audioSize),
  };
  const conversion = heldMaker();
  const shelf = new SoundShelf({
    files,
    createFolder: () => new LibraryCopyFolder(() => library, records, Date.now, 1000),
    createMaker: () => conversion.maker,
    prepareSource: async (source) => ({ hash: KEY, source: source instanceof Blob ? source : new Blob([source]) }),
    readRecords: async () => records.all().map(soundRecordOf),
  }, () => undefined);
  const copies = shelf.open();
  await shelf.refresh();
  await library.reread('music');
  await library.settle('music', ['Realms']);
  await settle();
  // The director tells of every change of the shelf and of the library.
  const subscribe = (listener: () => void): (() => void) => {
    const offCopies = copies.onChanged(listener);
    const offLibrary = library.onChange(listener);
    return () => {
      offCopies();
      offLibrary();
    };
  };
  return { library, shelf, records, conversion, subscribe };
}

beforeEach(() => {
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('window', globalThis);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

class MusicArmarium extends FakeArmarium {
  ownListings(): Promise<OwnListing[]> {
    return Promise.resolve([]);
  }
}

/** A single shared from `file`, its copy prepared through the real shelf, as the Sound library's share does. */
function shareOf(file: LibraryFile, deps: Parameters<typeof prepareTrackCopy>[0]): MusicShareSession {
  return new MusicShareSession({
    account: { state: () => ({ kind: 'signed-in', who: { id: 'acct-1', name: 'Mara', handle: 'mara' } }), token: () => 'tok', signIn: () => Promise.resolve('signed-in'), onChange: () => () => undefined },
    api: new MusicArmarium(),
    kind: 'music-track',
    files: [file],
    name: 'Volume II',
    prepare: (track, listener) => prepareTrackCopy(deps, track, listener),
    newUid: () => 'f'.repeat(32),
    pack: () => Promise.resolve({ fileName: 'x.zip', blob: new Blob(['zip']) }),
    fetchCover: () => Promise.resolve(null),
    sha256: (bytes) => sha256(bytes),
    sleep: noSleep,
  });
}

describe('a track whose conversion ends while the share is open', () => {
  // The copy is stored before the folder's listing shows it; read by its path through the listing, the copy's twin
  // rule named its source (the FLAC), whose header no copy has, and the share said the file was damaged.
  it.each<OriginalsChoice>(['keep', 'trash'])('is ready once its copy stands, never left out (originals: %s)', async (choice) => {
    const { library, shelf, records, conversion, subscribe } = await folderWith(choice);
    const file: LibraryFile = { ...library.filesOf('music').find(({ entry }) => entry.path === SOURCE)!.entry, kind: 'music' };
    const session = shareOf(file, { library, director: { shelf, subscribe } as unknown as Pick<SoundDirector, 'shelf' | 'subscribe'>, records });
    const seen: string[] = [];
    session.subscribe(() => {
      const copy = session.snapshot().tracks[0]?.copy;
      const step = copy?.state === 'converting' ? `converting ${copy.progress}` : copy?.state ?? 'none';
      if (seen.at(-1) !== step) seen.push(step);
    });
    session.start();
    await settle();
    conversion.progress(0.5);
    await settle();
    await conversion.finish();
    await settle();

    expect(seen).toEqual(['reading', 'converting null', 'converting 0.5', 'ready']);
    expect(session.snapshot().tracks[0]?.copy).toEqual({ state: 'ready', seconds: 3_600, bytes: expect.any(Number) });
    session.dispose();
    library.destroy();
    shelf.close();
  });
});
