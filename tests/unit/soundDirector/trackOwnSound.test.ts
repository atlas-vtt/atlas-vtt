import { describe, expect, it } from 'vitest';
import type { SoundInfo } from '@/app/sound/soundTypes';
import { joinFadeMs } from '@/app/soundDirector/listPlace';
import { musicPosition, seekMusic } from '@/app/soundDirector/musicList';
import { startMusic, withCurrentInfos } from '@/app/soundDirector/liveEdits';
import { EMPTY_MIX } from '@/app/soundDirector/soundMix';
import { EMPTY_TABLE_SOUND } from '@/app/soundDirector/tableSound';
import { applyDueListChange } from '@/app/soundDirector/trackEnd';

const RATE = 48_000;
const track = (key: string, extra: Partial<SoundInfo> = {}): SoundInfo => ({ key, frames: 60 * RATE, gainDb: 0, ...extra });

describe("a track's own crossfade", () => {
  it('overrides the setting for the join out of that track', () => {
    expect(joinFadeMs(track('a'), track('b'), 4000)).toBe(4000);
    expect(joinFadeMs(track('a', { crossfadeMs: 8000 }), track('b'), 4000)).toBe(8000);
    expect(joinFadeMs(track('a', { crossfadeMs: 0 }), track('b'), 4000)).toBe(0);
  });

  it('crossfades where the setting is a gapless join', () => {
    let mix = { ...EMPTY_MIX, table: startMusic(EMPTY_TABLE_SOUND, [track('a', { crossfadeMs: 6000 }), track('b')], false, 0, 7, 0, 0, 0) };
    for (let now = 0; now <= 55_000; now += 250) mix = applyDueListChange(mix, now, 1000, { crossfadeMs: 0 });
    expect(mix.table.music?.fade).toEqual({ at: 54_000, ms: 6000 });
  });
});

describe('a track that starts at its loop in', () => {
  const loop = { startFrame: 20 * RATE, endFrame: 40 * RATE };
  const held = (extra: Partial<SoundInfo>): ReturnType<typeof startMusic> => startMusic(EMPTY_TABLE_SOUND, [track('a', { loop, ...extra })], false, 0, 7, 0, 0, 0);

  it('begins there where it plays on its own, and goes round in its loop', () => {
    expect(musicPosition(held({}).music!, 1000)?.frame).toBe(RATE);
    const table = held({ startAtLoopIn: true });
    expect(musicPosition(table.music!, 1000)?.frame).toBe(21 * RATE);
    expect(musicPosition(table.music!, 21_000)?.frame).toBe(21 * RATE);
  });

  it('still lets a seek reach before the loop in', () => {
    const sought = seekMusic(held({ startAtLoopIn: true }), 2 * RATE, 5000);
    expect(musicPosition(sought.music!, 5000)?.frame).toBe(2 * RATE);
  });

  it('keeps its place when the switch or the loop in changes while it plays', () => {
    const table = held({ startAtLoopIn: true });
    const moved = withCurrentInfos(table, () => track('a', { loop: { startFrame: 10 * RATE, endFrame: 40 * RATE } }));
    expect(musicPosition(moved.music!, 1000)?.frame).toBe(21 * RATE);
  });
});
