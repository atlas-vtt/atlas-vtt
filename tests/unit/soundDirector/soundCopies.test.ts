import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forPlayers, withComments } from '@/app/sound/codec/atlasOpus';
import { SoundImportError } from '@/app/sound/codec/demux/demuxTypes';
import { readPage, packetsOfPage } from '@/app/sound/codec/oggPages';
import { readOpusComments } from '@/app/sound/codec/opusFormat';
import type { SoundImportJob, SoundImportResult } from '@/app/sound/codec/soundImporter';
import type { SoundRecord } from '@/app/sound/soundTypes';
import { SoundCopies, type SoundFileAccess } from '@/app/soundDirector/soundCopies';
import { UNKNOWN_RETRY_MS } from '@/app/soundDirector/copyEntries';
import { SoundRefs } from '@/app/online/gm/sound/soundRefs';
import { LiveSegments } from '@/app/online/gm/sound/liveSegments';
import { ASSET_USES } from '@/app/online/gm/assets/assetUses';
import { sha256Hex } from '@/app/online/gm/assetServe';
import { keyOf, taggedCopy } from '../../helpers/atlasCopies';
import { FakeCopyFolder, factsOf, record } from '../../helpers/soundDirectorRig';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';
import { LibraryCopyFolder } from '@/app/soundLibrary/libraryCopyFolder';
import { SoundLibrary } from '@/app/soundLibrary/SoundLibrary';
import { externalAudioPath } from '@/app/soundLibrary/soundPaths';
import type { StoredSound } from '@/app/soundLibrary/soundRecords';
import { SoundRoots } from '@/app/soundLibrary/SoundRoots';

const MB = 1024 * 1024;
const NEVER = new Promise<never>(() => undefined);

interface Run {
  job: SoundImportJob;
  finish: () => void;
}

interface Rig {
  copies: SoundCopies;
  folder: FakeCopyFolder;
  runs: Run[];
  reads: string[];
  refused: Array<[string, string]>;
  stats: Map<string, { size: number; mtime: number }>;
  /** Reads that answer only when the test lets them, by path. */
  held: Set<string>;
  /** What a read gives, by path; the path's text otherwise. */
  bytes: Map<string, ArrayBuffer | Blob>;
}

function rig({ parallel = 3 }: { parallel?: number } = {}): Rig {
  const folder = new FakeCopyFolder();
  const runs: Run[] = [];
  const reads: string[] = [];
  const refused: Array<[string, string]> = [];
  const stats = new Map<string, { size: number; mtime: number }>();
  const held = new Set<string>();
  const bytes = new Map<string, ArrayBuffer | Blob>();
  const files: SoundFileAccess = {
    statOf: ({ filePath }) => stats.get(filePath) ?? { size: 1, mtime: 1 },
    read: ({ filePath }) => {
      reads.push(filePath);
      if (held.has(filePath)) return NEVER;
      return Promise.resolve(bytes.get(filePath) ?? new TextEncoder().encode(filePath).buffer);
    },
    pathNow: ({ filePath }) => filePath,
  };
  const maker = {
    run: (job: SoundImportJob): Promise<SoundImportResult> => new Promise((resolve) => {
      runs.push({
        job,
        finish: () => {
          const copy = new Blob([`copy of ${job.from}`]);
          const peaks = job.kind === 'music' ? Uint8Array.of(1, 2, 3) : new Uint8Array(0);
          folder.made.set(copy, { ...factsOf(job.key, job.kind === 'music' ? peaks : null), from: job.from });
          resolve({ bytes: copy, frames: 480_000, channels: 2, lufs: -20, truePeakDb: -3, peaks });
        },
      });
    }),
  };
  const copies = new SoundCopies(files, folder, maker, async (source) => ({ hash: keyOf('a'), source: source instanceof Blob ? source : new Blob([source]) }), (sound, reason) => refused.push([sound.id, reason]), parallel);
  return { copies, folder, runs, reads, refused, stats, held, bytes };
}

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 20; turn++) await vi.advanceTimersByTimeAsync(0);
};

async function commentsOf(file: Blob): Promise<string[]> {
  const bytes = new Uint8Array(await file.slice(0, 128 * 1024).arrayBuffer());
  const head = readPage(bytes, 0);
  const tags = head && readPage(bytes, head.end);
  const packet = tags && packetsOfPage(tags, null).packets[0];
  return (packet && readOpusComments(packet)) ?? [];
}

const RAIN: SoundRecord = record('rain');
const SONG: SoundRecord = record('song', 'music');

beforeEach(() => {
  vi.stubGlobal('self', globalThis);
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('copies in the folder', () => {
  it('a tagged file is ready without converting', async () => {
    const { copies, folder, runs } = rig();
    folder.copies.set(SONG.filePath, { facts: factsOf(keyOf('b'), Uint8Array.of(9, 8, 7)), blob: new Blob(['x']) });
    copies.stateOf(SONG);
    await settle();
    copies.request([SONG], true);
    await settle();
    expect(copies.stateOf(SONG)).toEqual({ state: 'ready' });
    expect(copies.infoFor(SONG)).toMatchObject({ key: keyOf('b'), frames: 480_000 });
    expect(runs).toEqual([]);
  });

  it('a music sound\'s waveform comes from its file', async () => {
    const { copies, folder } = rig();
    folder.copies.set(SONG.filePath, { facts: factsOf(keyOf('b'), Uint8Array.of(9, 8, 7)), blob: new Blob(['x']) });
    copies.stateOf(SONG);
    await settle();
    expect(copies.peaksFor(SONG)).toEqual(Uint8Array.of(9, 8, 7));
  });

  it('nothing converts without the GM\'s choice, and the choice coming starts it', async () => {
    const { copies, folder, runs, reads } = rig();
    folder.choice = null;
    copies.request([RAIN], true);
    await settle();
    expect(reads).toEqual([]);
    expect(copies.stateOf(RAIN)).toEqual({ state: 'not-converted' });
    folder.choice = 'trash';
    copies.request([RAIN], true);
    await settle();
    expect(runs).toHaveLength(1);
  });

  it('a converted sound is stored with the choice and plays from the folder', async () => {
    const { copies, folder, runs, stats } = rig();
    folder.choice = 'keep';
    stats.set(SONG.filePath, { size: 7, mtime: 42 });
    copies.request([SONG], true);
    await settle();
    runs[0]?.finish();
    await settle();
    expect(folder.stores).toMatchObject([{ choice: 'keep', sourceStat: { size: 7, mtime: 42 } }]);
    expect(copies.stateOf(SONG)).toEqual({ state: 'ready' });
    expect(copies.peaksFor(SONG)).toEqual(Uint8Array.of(1, 2, 3));
    const blob = vi.spyOn(folder, 'blob');
    const bytes = await copies.bytes(keyOf('a'));
    expect(new TextDecoder().decode(await bytes.read(0, bytes.byteLength))).toBe('copy of song.ogg');
    expect(blob).toHaveBeenCalledWith(SONG.filePath);
  });

  it('the source is measured before it is read for converting', async () => {
    const { copies, folder, runs, stats } = rig();
    stats.set(RAIN.filePath, { size: 7, mtime: 42 });
    copies.request([RAIN], true);
    await settle();
    stats.set(RAIN.filePath, { size: 9, mtime: 99 });
    runs[0]?.finish();
    await settle();
    expect(folder.stores[0]?.sourceStat).toEqual({ size: 7, mtime: 42 });
  });

  it('players get the copy without Atlas\' comments', async () => {
    const { copies, folder } = rig();
    const file = await taggedCopy({ key: keyOf('c'), from: 'Secret name.wav' });
    folder.copies.set(RAIN.filePath, { facts: factsOf(keyOf('c')), blob: file });
    copies.stateOf(RAIN);
    await settle();
    const stored = await copies.storedBytes(keyOf('c'));
    const sent = new Uint8Array(await stored.read(0, stored.byteLength));
    expect(sent).toEqual(new Uint8Array(await (await forPlayers(file)).arrayBuffer()));
    const comments = await commentsOf(new Blob([sent]));
    expect(comments.filter((comment) => comment.startsWith('ATLAS_') && !comment.startsWith('ATLAS_SEEK='))).toEqual([]);
    expect(new TextDecoder().decode(sent)).not.toContain(keyOf('c'));
    const segments = await LiveSegments.ofStored(await copies.storedBytes(keyOf('c')));
    const parts = (await segments.batch(0)).parts.map((part) => new TextDecoder().decode(part.bytes)).join('');
    expect(parts).not.toContain('ATLAS_');
  });

  it('a whole copy goes to players under the id 0.13.1 gave it, as 0.13.1 sent it', async () => {
    const { copies, folder } = rig();
    const file = await taggedCopy({ key: keyOf('c') });
    folder.copies.set(RAIN.filePath, { facts: factsOf(keyOf('c')), blob: file });
    copies.stateOf(RAIN);
    await settle();
    const sent: Array<{ hash: string; bytes: Uint8Array | null }> = [];
    const refs = new SoundRefs({
      bytes: (key) => copies.storedBytes(key),
      growing: (key) => copies.growingOf(key),
      copyRef: async (copy, read) => {
        sent.push({ hash: copy.hash, bytes: await read() });
        return { ...copy, id: `id-${copy.hash}` };
      },
      segmentsRef: () => Promise.resolve(null),
    });
    await refs.ensure(keyOf('c'), ASSET_USES.audio, true);
    const players = new Uint8Array(await (await forPlayers(file)).arrayBuffer());
    expect(sent).toEqual([{ hash: await sha256Hex(players), bytes: players }]);
  });

  it('a store that cannot write refuses the sound as cannot-write and says so once', async () => {
    const { copies, folder, runs, refused } = rig();
    folder.failStore = new SoundImportError('cannot-write', 'disk full');
    copies.request([RAIN], true);
    await settle();
    runs[0]?.finish();
    await settle();
    expect(copies.stateOf(RAIN)).toEqual({ state: 'refused', reason: 'cannot-write' });
    copies.request([RAIN], true);
    await settle();
    expect(refused).toEqual([['rain', 'cannot-write']]);
    expect(runs).toHaveLength(1);
  });
});

describe('a file Atlas marked whose facts do not read', () => {
  it('is refused as damaged where the folder says so, and never converted', async () => {
    const { copies, folder, runs, reads, refused } = rig();
    folder.damaged.add(RAIN.filePath);
    copies.request([RAIN], true);
    await settle();
    expect(copies.stateOf(RAIN)).toEqual({ state: 'refused', reason: 'unreadable' });
    expect(refused).toEqual([['rain', 'unreadable']]);
    expect(reads).toEqual([]);
    expect(runs).toEqual([]);
  });

  it('is refused where only its bytes show it, and never handed to the copy maker', async () => {
    const { copies, runs, refused, bytes } = rig();
    const tagged = await taggedCopy({ key: keyOf('d') });
    bytes.set(RAIN.filePath, await withComments(tagged, (comment) => !comment.startsWith('ATLAS_SOURCE'), ['ATLAS_SOURCE=nope']));
    copies.request([RAIN], true);
    await settle();
    expect(copies.stateOf(RAIN)).toEqual({ state: 'refused', reason: 'unreadable' });
    expect(refused).toEqual([['rain', 'unreadable']]);
    expect(runs).toEqual([]);
  });

  it('a whole Atlas copy the folder missed plays as it is', async () => {
    const { copies, runs, bytes, folder } = rig();
    bytes.set(RAIN.filePath, await taggedCopy({ key: keyOf('e') }));
    copies.request([RAIN], true);
    await settle();
    expect(copies.stateOf(RAIN)).toEqual({ state: 'ready' });
    expect(copies.infoFor(RAIN)?.key).toBe(keyOf('e'));
    expect(runs).toEqual([]);
    expect(folder.stores).toEqual([]);
  });
});

describe('a file outside every linked folder', () => {
  it('is refused as such on the sound, without a notice, and never converted', async () => {
    const { copies, folder, runs, reads, refused } = rig();
    folder.outsidePaths.add(RAIN.filePath);
    vi.spyOn(folder, 'choiceFor').mockReturnValue(null);
    copies.request([RAIN], true);
    await settle();
    expect(copies.stateOf(RAIN)).toEqual({ state: 'refused', reason: 'outside-folder' });
    expect(refused).toEqual([]);
    expect(reads).toEqual([]);
    expect(runs).toEqual([]);
  });

  it('can be asked for once its folder is linked, without a restart', async () => {
    const { copies, folder, runs } = rig();
    folder.outsidePaths.add(RAIN.filePath);
    copies.request([RAIN], true);
    await settle();
    expect(copies.stateOf(RAIN).state).toBe('refused');
    folder.outsidePaths.delete(RAIN.filePath);
    copies.recheckOutside();
    copies.request([RAIN], true);
    await settle();
    expect(runs).toHaveLength(1);
  });
});

describe('what listeners read while they are told', () => {
  it('a listener that reads the same outside record runs a bounded number of times and never throws', async () => {
    const { copies, folder, stats } = rig();
    folder.outsidePaths.add(RAIN.filePath);
    const error = vi.mocked(console.error);
    let heard = 0;
    copies.onChanged(() => {
      heard++;
      copies.infoFor(RAIN);
      copies.stateOf(RAIN);
    });
    expect(() => copies.stateOf(RAIN)).not.toThrow();
    expect(copies.stateOf(RAIN)).toEqual({ state: 'refused', reason: 'outside-folder' });
    stats.set(RAIN.filePath, { size: 2, mtime: 2 });
    expect(() => copies.infoFor(RAIN)).not.toThrow();
    expect(copies.stateOf(RAIN)).toEqual({ state: 'refused', reason: 'outside-folder' });
    copies.request([RAIN], true);
    await settle();
    expect(heard).toBeLessThanOrEqual(2);
    expect(error).not.toHaveBeenCalled();
  });

  it('a listener that throws is reported, and the copy is ready all the same', async () => {
    const { copies, folder } = rig();
    folder.copies.set(SONG.filePath, { facts: factsOf(keyOf('b')), blob: new Blob(['x']) });
    copies.onChanged(() => {
      throw new Error('listener broke');
    });
    copies.stateOf(SONG);
    await settle();
    expect(copies.stateOf(SONG)).toEqual({ state: 'ready' });
    expect(vi.mocked(console.error)).toHaveBeenCalledWith('[Atlas] A listener of the sound copies failed', expect.objectContaining({ message: 'listener broke' }));
  });
});

describe('the background queue', () => {
  const big = (id: string): SoundRecord => record(id);

  it('background copies stop at a gigabyte in flight', async () => {
    const { copies, reads, stats, held } = rig({ parallel: 3 });
    const sounds = ['a', 'b', 'c'].map(big);
    for (const sound of sounds) {
      stats.set(sound.filePath, { size: 600 * MB, mtime: 1 });
      held.add(sound.filePath);
    }
    copies.request(sounds);
    await settle();
    expect(reads).toEqual([sounds[0]!.filePath, sounds[1]!.filePath]);
    const pressed = big('d');
    stats.set(pressed.filePath, { size: 600 * MB, mtime: 1 });
    copies.request([pressed], true);
    await settle();
    expect(reads).toContain(pressed.filePath);
    expect(copies.background()).toEqual({ done: 0, total: 3, paused: false });
  });

  it('a file that took too long to say what it is is never converted in the background, only when pressed', async () => {
    const { copies, folder, runs } = rig();
    folder.slow.add(RAIN.filePath);
    copies.request([RAIN, SONG]);
    await settle();
    expect(runs.map((run) => run.job.from)).toEqual(['song.ogg']);
    expect(copies.stateOf(RAIN)).toEqual({ state: 'not-converted' });
    const factsOf = vi.spyOn(folder, 'factsOf');
    copies.request([RAIN]);
    await settle();
    expect(factsOf).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(UNKNOWN_RETRY_MS);
    copies.request([RAIN]);
    await settle();
    expect(factsOf).toHaveBeenCalledTimes(1);
    expect(runs).toHaveLength(1);
    copies.request([RAIN], true);
    await settle();
    expect(runs.map((run) => run.job.from)).toEqual(['song.ogg', 'rain.ogg']);
  });

  it('a burst of requests for an unknown file reads it once', async () => {
    const { copies, folder } = rig();
    folder.slow.add(RAIN.filePath);
    copies.request([RAIN]);
    await settle();
    await vi.advanceTimersByTimeAsync(UNKNOWN_RETRY_MS);
    const factsOf = vi.spyOn(folder, 'factsOf').mockReturnValue(new Promise(() => undefined));
    for (let request = 0; request < 5; request++) copies.request([RAIN]);
    await settle();
    expect(factsOf).toHaveBeenCalledTimes(1);
  });

  it('a copy that replaced its source under the same name stays ready through the store', async () => {
    const { copies, runs, stats } = rig();
    stats.set(RAIN.filePath, { size: 7, mtime: 1 });
    copies.request([RAIN], true);
    await settle();
    runs[0]?.finish();
    await settle();
    stats.set(RAIN.filePath, { size: 99, mtime: 2 });
    expect(copies.stateOf(RAIN)).toEqual({ state: 'ready' });
    expect(copies.infoFor(RAIN)).not.toBeNull();
  });

  it('pausing holds the background, never a press', async () => {
    const { copies, reads, runs } = rig({ parallel: 1 });
    copies.pauseBackground(true);
    copies.request([RAIN]);
    await settle();
    expect(reads).toEqual([]);
    expect(copies.background()).toEqual({ done: 0, total: 1, paused: true });
    copies.request([SONG], true);
    await settle();
    expect(reads).toEqual([SONG.filePath]);
    copies.pauseBackground(false);
    runs[0]?.finish();
    await settle();
    expect(reads).toEqual([SONG.filePath, RAIN.filePath]);
    runs[1]?.finish();
    await settle();
    expect(copies.background()).toBeNull();
  });
});

describe('a kept original beside its own copy, in the GM\'s folder', () => {
  it('is never converted again when its copy\'s header read took too long, and plays from its copy once it reads', async () => {
    vi.stubGlobal('window', globalThis);
    const location = new FakeSoundLocation();
    location.put('Inn/Tavern.mp3', new Blob(['MP3']));
    location.put('Inn/Tavern.opus', await taggedCopy({ key: keyOf('a'), from: 'Tavern.mp3' }));
    const roots = new SoundRoots({
      shared: () => ({ music: { type: 'external' } }),
      setShared: () => undefined,
      onSharedChange: () => () => undefined,
      local: (kind) => (kind === 'music' ? '/Music' : null),
      setLocal: () => undefined,
      localOriginals: () => 'keep',
      setLocalOriginals: () => undefined,
      vaultBase: () => null,
      realPath: async (path) => path,
    });
    const library = new SoundLibrary({ roots, open: () => location, probeSeconds: async () => null });
    const stored: StoredSound[] = [{ id: 'tavern', name: 'Tavern', tags: [], createdAt: 1, modifiedAt: 1, audioPath: externalAudioPath('music', 'Inn/Tavern.mp3'), audioSize: 3, kind: 'music' }];
    const rewrites: StoredSound[] = [];
    const folder = new LibraryCopyFolder(() => library, {
      whenLoaded: () => Promise.resolve(),
      rewrite: (change) => {
        for (const sound of stored) {
          const next = change(sound);
          if (next) rewrites.push(next);
        }
        return rewrites.length > 0;
      },
    }, () => 5, 1000);
    await library.reread('music');
    await library.settle('music', ['Inn']);
    await library.settle('music', ['Inn']);
    const copyRecord: SoundRecord = { id: 'copy', name: 'Tavern', kind: 'music', filePath: externalAudioPath('music', 'Inn/Tavern.opus') };
    await folder.factsOf(copyRecord);
    expect(library.isCopied('music', 'Inn/Tavern.mp3'), 'the copy is known').toBe(true);

    const readRange = location.readRange.bind(location);
    let stuck = true;
    vi.spyOn(location, 'readRange').mockImplementation((path, start, end) => (stuck && path === 'Inn/Tavern.opus' ? NEVER : readRange(path, start, end)));
    let made = 0;
    const maker = {
      run: async (job: SoundImportJob): Promise<SoundImportResult> => {
        made++;
        return { bytes: await taggedCopy({ key: job.key, from: 'Tavern.mp3' }), frames: 144_000, channels: 1, lufs: -20, truePeakDb: -3, peaks: null };
      },
    };
    const files: SoundFileAccess = {
      statOf: ({ filePath, audioSize }) => library.statOfFile(filePath, audioSize),
      read: ({ filePath, audioSize }) => library.readFile(filePath, audioSize),
      pathNow: ({ filePath, audioSize }) => library.pathNow(filePath, audioSize),
    };
    const copies = new SoundCopies(files, folder, maker, async (source) => ({ hash: keyOf('a'), source: source instanceof Blob ? source : new Blob([source]) }), () => undefined, 3);
    const tavern: SoundRecord = { id: 'tavern', name: 'Tavern', kind: 'music', filePath: externalAudioPath('music', 'Inn/Tavern.mp3'), audioSize: 3 };

    expect(copies.stateOf(tavern).state).toBe('not-converted');
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    copies.request([tavern], true);
    await settle();
    expect(made, 'nothing is converted').toBe(0);
    expect(location.files.has('Inn/Tavern 2.opus')).toBe(false);
    expect(location.changes).toEqual([]);
    expect(rewrites).toEqual([]);

    stuck = false;
    await vi.advanceTimersByTimeAsync(UNKNOWN_RETRY_MS);
    copies.request([tavern]);
    await settle();
    expect(copies.stateOf(tavern).state).toBe('ready');
    location.reads.length = 0;
    await copies.bytes(keyOf('a'));
    expect(location.reads).toEqual(['Inn/Tavern.opus']);
    expect(made).toBe(0);
    expect(location.files.has('Inn/Tavern 2.opus')).toBe(false);
    library.destroy();
    copies.dispose();
  });
});
