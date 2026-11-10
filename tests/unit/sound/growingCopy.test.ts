import { describe, expect, it } from 'vitest';
import { GrowingCopy, type GrowingPages } from '@/app/sound/codec/growingCopy';
import { writeOpusHead } from '@/app/sound/codec/opusFormat';
import { SEEK_INTERVAL_FRAMES } from '@/app/sound/codec/seekTable';
import type { SoundInfo, TableSound } from '@/app/sound/soundTypes';
import { withCurrentInfos } from '@/app/soundDirector/liveEdits';
import { EMPTY_TABLE_SOUND } from '@/app/soundDirector/tableSound';

const PRE_SKIP = 312;
const SECOND = 48_000;

/** Pages of one second each, `bytes` long, from `fromSecond` on. */
function pages(fromSecond: number, seconds: number, byteOffset: number, bytes = 10): GrowingPages {
  const body = new Uint8Array(seconds * bytes).map((_, index) => (byteOffset + index) % 251);
  return {
    bytes: body,
    pages: Array.from({ length: seconds }, (_, index) => ({ byte: byteOffset + index * bytes, granule: PRE_SKIP + (fromSecond + index) * SECOND })),
    endGranule: PRE_SKIP + (fromSecond + seconds) * SECOND,
    estimatedFrames: 600 * SECOND,
    lufs: -18,
    truePeakDb: -2,
  };
}

const copy = (): GrowingCopy => new GrowingCopy({ head: writeOpusHead(2, PRE_SKIP), estimatedFrames: 600 * SECOND });

describe('a copy while it is made', () => {
  it('reads what is written, as one stream, with a seek entry every few seconds', async () => {
    const growing = copy();
    growing.add(pages(0, 8, 0));
    growing.add(pages(8, 4, 80));
    expect(growing.frames).toBe(12 * SECOND);
    expect(growing.byteLength).toBe(120);
    expect([...(await growing.read(75, 85))]).toEqual(Array.from({ length: 10 }, (_, index) => (75 + index) % 251));
    expect([...(await growing.read(110, 999))]).toHaveLength(10);
    const sound = growing.sound();
    expect(sound.audioStart).toBe(0);
    expect(sound.preSkip).toBe(PRE_SKIP);
    expect(sound.seek.map((entry) => entry.granule)).toEqual([PRE_SKIP, PRE_SKIP + 5 * SECOND, PRE_SKIP + 10 * SECOND]);
    expect(sound.seek[1]!.granule - sound.seek[0]!.granule).toBe(SEEK_INTERVAL_FRAMES);
    growing.add(pages(12, 1, 120));
    expect(sound.byteLength).toBe(130);
  });

  it('waits for what is not written yet, and a failure reaches whoever waits', async () => {
    const growing = copy();
    growing.add(pages(0, 2, 0));
    let reached = false;
    const later = growing.reach(PRE_SKIP + 5 * SECOND).then(() => { reached = true; });
    await Promise.resolve();
    expect(reached).toBe(false);
    growing.add(pages(2, 3, 20));
    await later;
    expect(reached).toBe(true);
    const never = growing.reach(PRE_SKIP + 60 * SECOND);
    growing.fail(new Error('refused'));
    await expect(never).rejects.toThrow('refused');
    await expect(growing.read(0, 10)).rejects.toThrow('refused');
  });

  it('lets everything waiting read what there is once it ends', async () => {
    const growing = copy();
    growing.add(pages(0, 2, 0));
    const past = growing.reach(PRE_SKIP + 60 * SECOND);
    growing.end();
    await past;
    expect(growing.done).toBe(true);
  });
});

describe('the table, as the copies say', () => {
  const growing: SoundInfo = { key: 'k', frames: 600 * SECOND, gainDb: -2, growing: true };
  const table: TableSound = { ...EMPTY_TABLE_SOUND, music: { tracks: [growing, { key: 'other', frames: SECOND * 90, gainDb: 0 }], seed: 1, shuffle: false, startAt: 0, gainDb: -3, fade: { at: 0, ms: 0 } } };

  it('takes a copy made whole, and changes nothing where nothing did', () => {
    const whole: SoundInfo = { key: 'k', frames: 598 * SECOND, gainDb: -1.4 };
    const next = withCurrentInfos(table, (key) => (key === 'k' ? whole : null));
    expect(next.music?.tracks[0]).toBe(whole);
    expect(next.music?.tracks[1]).toBe(table.music?.tracks[1]);
    expect(next.music?.gainDb).toBe(-3);
    expect(next.revision).toBe(table.revision + 1);
    expect(withCurrentInfos(next, (key) => (key === 'k' ? { ...whole } : null))).toBe(next);
  });
});

describe('what a copy being made tells the table', () => {
  it('nothing before its first minute, then a gain that moves only by whole steps', async () => {
    const { growingInfo, grownGain } = await import('@/app/soundDirector/growingCopies');
    const growing = copy();
    let told = grownGain(growing, pages(0, 30, 0), null);
    expect(told).toBeNull();
    expect(growingInfo('k', growing, told, {})).toBeNull();
    told = grownGain(growing, pages(30, 31, 300), told);
    // To -20 LUFS from -18 is -2 dB; to -1 dBTP from -2 would allow +1: the lower wins.
    expect(told).toBe(-2);
    expect(growingInfo('k', growing, told, {})).toEqual({ key: 'k', frames: 600 * SECOND, gainDb: told, growing: true });
    const quieter = { ...pages(61, 1, 610), lufs: -18.2 };
    expect(grownGain(growing, quieter, told)).toBe(told);
    const muchQuieter = { ...pages(62, 1, 620), lufs: -19 };
    expect(grownGain(growing, muchQuieter, told)).toBe(-1);
  });
});
