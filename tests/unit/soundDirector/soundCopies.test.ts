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
