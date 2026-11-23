import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundImportJob, SoundImportResult } from '@/app/sound/codec/soundImporter';
import { PEAK_BUCKETS } from '@/app/sound/codec/soundPeaks';
import type { SoundRecord } from '@/app/sound/soundTypes';
import type { SoundCopies, SoundFileAccess } from '@/app/soundDirector/soundCopies';
import { SoundShelf } from '@/app/soundDirector/soundShelf';
import { requestCopies } from '@/app/soundDirector/libraryDesk';
import type { SoundDirector } from '@/app/soundDirector/SoundDirector';
import { LibraryCopyFolder } from '@/app/soundLibrary/libraryCopyFolder';
import { recordsForFiles, type RecordsSeam } from '@/app/soundLibrary/libraryRecords';
import { SoundLibrary, type LibraryFile } from '@/app/soundLibrary/SoundLibrary';
import { soundRecordOf, type StoredSound } from '@/app/soundLibrary/soundRecords';
import type { SoundRecordStore } from '@/app/soundLibrary/SoundRecordStore';
import { SoundRoots, type OriginalsChoice } from '@/app/soundLibrary/SoundRoots';
import { keyOf, taggedCopy } from '../../helpers/atlasCopies';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';

const PEAKS = Uint8Array.from({ length: PEAK_BUCKETS }, (_, at) => at % 256);
const SOURCE = 'Bosses/Hornet [7xkM8mWC4Kk].opus';
const NUMBERED = 'Bosses/Hornet [7xkM8mWC4Kk] 2.opus';
const KEY = keyOf('a');
const NEVER = new Promise<never>(() => undefined);
const STUCK_MS = 1000;

type Records = RecordsSeam & Pick<SoundRecordStore, 'rewrite'>;

interface Folder {
  shelf: SoundShelf;
  copies: SoundCopies;
  library: SoundLibrary;
  location: FakeSoundLocation;
  records: Records;
}

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

/** A music folder linked on a Windows disk, holding an Opus file Atlas did not make (as a downloader writes one), with the GM's choice given. */
async function linkedFolder(choice: OriginalsChoice, failing: (change: string) => Error | null = () => null): Promise<Folder> {
  const location = new FakeSoundLocation();
  location.put(SOURCE, new Blob(['an Opus file from elsewhere']));
  location.failing = failing;
  const roots = new SoundRoots({
    shared: () => ({ music: { type: 'external' } }),
    setShared: () => undefined,
    onSharedChange: () => () => undefined,
    local: (kind) => (kind === 'music' ? 'C:\\Users\\gm\\Downloads\\Music' : null),
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
  const maker = {
    run: async (job: SoundImportJob): Promise<SoundImportResult> => ({ bytes: await taggedCopy({ key: job.key, from: job.from, peaks: PEAKS }), frames: 144_000, channels: 1, lufs: -20, truePeakDb: -3, peaks: PEAKS }),
    dispose: () => undefined,
  };
  const shelf = new SoundShelf({
    files,
    createFolder: () => new LibraryCopyFolder(() => library, records, Date.now, STUCK_MS),
    createMaker: () => maker,
    prepareSource: async (source) => ({ hash: KEY, source: source instanceof Blob ? source : new Blob([source]) }),
    readRecords: async () => records.all().map(soundRecordOf),
  }, () => undefined);
  const copies = shelf.open();
  await shelf.refresh();
  await library.reread('music');
  await library.settle('music', ['Bosses']);
  await settle();
  return { shelf, copies, library, location, records };
}

/** What the library lists: a kept original stands behind its copy. */
const rowsOf = (library: SoundLibrary): LibraryFile[] => library.filesOf('music').filter(({ entry }) => !library.isCopied('music', entry.path)).map(({ entry }) => ({ ...entry, kind: 'music' }));

/** The GM presses the track: its record is made and the shelf reads it. */
async function press({ shelf, library, records }: Folder): Promise<SoundRecord> {
  const [made] = await recordsForFiles(records, library, rowsOf(library));
  if (!made) throw new Error('No row to press.');
  await shelf.refresh();
  shelf.request([made], true);
  await settle();
  await shelf.refresh();
  return shelf.recordOf(made.id) ?? made;
}

const lockedOriginal = (change: string): Error | null => (change === `trash ${SOURCE}` ? new Error('EBUSY: resource busy or locked') : null);
const lockedCopy = (change: string): Error | null => (change === `move ${NUMBERED} ${SOURCE}` ? new Error('EPERM: operation not permitted') : null);

beforeEach(() => {
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('window', globalThis);
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the waveform of an Opus track in a linked folder, converted in the background', () => {
  it.each<[string, OriginalsChoice, (change: string) => Error | null]>([
    ['originals kept', 'keep', () => null],
    ['originals to the trash', 'trash', () => null],
    ['the original in use, so not trashed', 'trash', lockedOriginal],
    ['the copy in use, so not renamed', 'trash', lockedCopy],
  ])('shows once the track plays: %s', async (_case, choice, failing) => {
    const folder = await linkedFolder(choice, failing);
    const { shelf, library, records } = folder;
    await requestCopies({ records, library, director: { shelf } as unknown as SoundDirector }, rowsOf(library));
    await settle();

    const record = await press(folder);

    expect(shelf.infoOf(record)?.key, 'it plays').toBe(KEY);
    expect(shelf.recordOfKey(KEY)?.name, 'its name shows').toBeTruthy();
    expect(shelf.peaksOfKey(KEY), 'its waveform shows').toEqual(PEAKS);
    library.destroy();
    shelf.close();
  });
});

/** A track pressed before its copy was made, the originals going to the trash: the copy ends under the original's name. */
async function pressedWhileConverting(): Promise<Folder & { record: SoundRecord }> {
  const folder = await linkedFolder('trash');
  const { shelf, copies, library, records } = folder;
  const [record] = await recordsForFiles(records, library, rowsOf(library));
  if (!record) throw new Error('No row to press.');
  await shelf.refresh();
  // The page reads the sound's state on every change, as the rows do.
  copies.onChanged(() => shelf.stateOf(record));
  shelf.request([record], true);
  await settle();
  return { ...folder, record };
}

describe('a track whose copy took its original\'s name', () => {
  it('shows its waveform as the folder lists the copy, while the copy is read again', async () => {
    const { shelf, library } = await pressedWhileConverting();
    expect(shelf.peaksOfKey(KEY)).toEqual(PEAKS);
    library.destroy();
    shelf.close();
  });

  it('keeps its waveform while that read is slow, and it plays on', async () => {
    const { shelf, library, location, record } = await pressedWhileConverting();
    // A scanner holds the new file when Atlas reads its header again.
    const readRange = location.readRange.bind(location);
    vi.spyOn(location, 'readRange').mockImplementation((path, start, end) => (path === SOURCE ? NEVER : readRange(path, start, end)));
    shelf.stateOf(record);
    await vi.advanceTimersByTimeAsync(STUCK_MS);
    await settle();

    expect((await shelf.bytes(KEY)).byteLength, 'it plays').toBeGreaterThan(0);
    expect(shelf.peaksOfKey(KEY), 'its waveform shows').toEqual(PEAKS);
    library.destroy();
    shelf.close();
  });
});
