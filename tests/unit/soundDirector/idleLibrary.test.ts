// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSoundDirector } from '../../../src/app/plugin/soundDirector';
import { ConversionConsentModal } from '../../../src/app/soundLibrary/ConversionConsentModal';
import type { OriginalsChoice } from '../../../src/app/soundLibrary/SoundRoots';
import { keyOf, taggedCopy } from '../../helpers/atlasCopies';
import type { FakeSoundLocation } from '../../helpers/fakeSoundLocation';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';
import { settle } from '../../helpers/soundDirectorRig';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ setMessage: vi.fn(), hide: vi.fn() })) }));

/** A library of about 8 GB: 1,500 sources of 5.4 MB each, in 150 folders. */
const FOLDERS = 150;
const TRACKS = 10;
const SOURCE_BYTES = 5_400_000;
const IDLE_MS = 10 * 60_000;

/** What the sound feature asks of a disk, counted per kind of call. */
interface DiskUse {
  list: number;
  stat: number;
  exists: number;
  /** Parts of files: the first pages and the last page a copy says what it is on. */
  readRange: number;
  /** Whole files: what hashing and converting a source take, and playing a copy. */
  read: number;
}

interface Started {
  use: DiskUse;
  /** An event of the folder's watch, as a file manager or a sync tool causes one. */
  heard: (path: string) => void;
}

let rig: LibraryRig;
let contexts: number;
let workers: number;
/** Calls to the disk that have not answered yet. */
let underWay = 0;

const folderOf = (index: number): string => `Album ${String(index).padStart(3, '0')}`;

function fillWithSources(location: FakeSoundLocation, folders = FOLDERS): void {
  for (let folder = 0; folder < folders; folder++) {
    for (let track = 1; track <= TRACKS; track++) location.addFile(`${folderOf(folder)}/Track ${track}.mp3`, SOURCE_BYTES);
  }
}

function countDisk(location: FakeSoundLocation): DiskUse {
  const use: DiskUse = { list: 0, stat: 0, exists: 0, readRange: 0, read: 0 };
  const counted = <Args extends unknown[], Result>(call: keyof DiskUse, real: (...args: Args) => Promise<Result>) => (...args: Args): Promise<Result> => {
    use[call]++;
    underWay++;
    return real(...args).finally(() => { underWay--; });
  };
  // Each real method is taken before its spy stands in its place.
  const real = { list: location.list.bind(location), stat: location.stat.bind(location), exists: location.exists.bind(location), readRange: location.readRange.bind(location), read: location.read.bind(location) };
  vi.spyOn(location, 'list').mockImplementation(counted('list', real.list));
  vi.spyOn(location, 'stat').mockImplementation(counted('stat', real.stat));
  vi.spyOn(location, 'exists').mockImplementation(counted('exists', real.exists));
  vi.spyOn(location, 'readRange').mockImplementation(counted('readRange', real.readRange));
  vi.spyOn(location, 'read').mockImplementation(counted('read', real.read));
  return use;
}

/**
 * Fake time going by, a step at a time. A read answers outside it, sooner or later as the machine is loaded, so
 * each step waits for the disk's calls under way: time never runs ahead of them, and no read looks stuck.
 */
async function pass(ms: number, stepMs: number): Promise<void> {
  for (let at = 0; at < ms; at += stepMs) {
    await vi.advanceTimersByTimeAsync(stepMs);
    do await settle(); while (underWay > 0);
  }
}

/**
 * Atlas as it stands after a start with sound on and no map, Sound page or DM screen open, over a folder on disk.
 * The folder was walked once, which is the most a page opened and closed again leaves behind: every file is listed.
 */
async function start(originals: OriginalsChoice | null, fill: (location: FakeSoundLocation) => void): Promise<Started> {
  rig = await libraryRig({ local: { music: '/Volumes/Sounds' }, shared: { music: { type: 'external' } }, originals });
  const location = rig.locations.music;
  fill(location);
  const use = countDisk(location);
  let heard: Started['heard'] = () => undefined;
  const watch = location.watch.bind(location);
  vi.spyOn(location, 'watch').mockImplementation((onChange) => {
    heard = onChange;
    return watch(onChange);
  });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  registerSoundDirector({
    app: rig.app,
    addCommand: vi.fn(),
    removeCommand: vi.fn(),
    addStatusBarItem: () => document.createElement('div'),
    register: vi.fn(),
    registerInterval: vi.fn(),
  } as never);
  rig.library.rescan();
  await pass(120_000, 50);
  return { use, heard: (path) => heard(path) };
}

beforeEach(() => {
  contexts = 0;
  workers = 0;
  underWay = 0;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  // The dialog stays unanswered.
  vi.spyOn(ConversionConsentModal.prototype, 'open').mockImplementation(() => undefined);
  vi.stubGlobal('AudioContext', class {
    constructor() { contexts++; }
  });
  // A hash and a conversion each run in a worker of their own; these never answer.
  vi.stubGlobal('Worker', class {
    constructor() { workers++; }
    postMessage(): void { /* never answers */ }
    terminate(): void { /* nothing to stop */ }
  });
});

afterEach(() => {
  rig.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a large linked folder while nothing plays', () => {
  it('has no byte of a file read, hashed or converted, and no context, before the GM agreed to converting it', async () => {
    const { use } = await start(null, fillWithSources);
    expect(use.list, 'the folders, walked once').toBe(FOLDERS + 1);
    expect(use.exists, 'each source is asked once whether a copy lies beside it').toBe(FOLDERS * TRACKS);
    expect({ stat: use.stat, readRange: use.readRange, read: use.read }).toEqual({ stat: 0, readRange: 0, read: 0 });

    const afterStart = { ...use };
    await pass(IDLE_MS, 5000);
    expect(use, 'ten idle minutes ask nothing of the disk').toEqual(afterStart);
    expect(workers, 'nothing is hashed or converted').toBe(0);
    expect(contexts, 'no context runs with nothing to play').toBe(0);
    expect(rig.director.shelf.background()).toBeNull();
    // The status bar's refresh, every five seconds, is the one timer left: no pulse, no poll of the folder.
    expect(vi.getTimerCount()).toBe(1);
  });

  it('reads what each copy of a converted folder says of itself at a start, and nothing after', async () => {
    const copies = await Promise.all(Array.from({ length: TRACKS }, (_, index) => taggedCopy({ key: keyOf(index.toString(16)), from: `Track ${index + 1}.mp3` })));
    const { use, heard } = await start('keep', (location) => {
      fillWithSources(location);
      for (let folder = 0; folder < FOLDERS; folder++) copies.forEach((copy, index) => location.put(`${folderOf(folder)}/Track ${index + 1}.opus`, copy));
    });
    // A copy is read as itself and as the copy of the original kept beside it: its first pages and its last page.
    expect(use.readRange).toBeGreaterThan(0);
    expect(use.readRange).toBeLessThanOrEqual(FOLDERS * TRACKS * 4);
    expect(use.read, 'no file is read whole: nothing is hashed, converted or played').toBe(0);

    const afterStart = { ...use };
    await pass(IDLE_MS, 5000);
    expect(use, 'ten idle minutes ask nothing of the disk').toEqual(afterStart);

    // A file touched without changing costs its folder's listing, not a walk of the library, and no file is read again.
    heard(`${folderOf(7)}/Track 3.opus`);
    await pass(5000, 250);
    expect(use).toEqual({ ...afterStart, list: afterStart.list + 1 });
    expect(workers).toBe(0);
    expect(contexts).toBe(0);
    expect(rig.director.shelf.background()).toBeNull();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('is read and converted once the GM agreed, which is what the counts above would show', async () => {
    const { use } = await start('trash', (location) => fillWithSources(location, 3));
    expect(use.read, 'sources are read whole to be hashed and converted').toBeGreaterThan(0);
    expect(workers).toBeGreaterThan(0);
    expect(rig.director.shelf.background()).toMatchObject({ total: 3 * TRACKS, paused: false });
    expect(contexts, 'converting plays nothing').toBe(0);
  });
});
