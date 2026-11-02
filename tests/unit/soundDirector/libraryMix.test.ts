import { describe, expect, it } from 'vitest';
import type { SoundInfo } from '@/app/sound/soundTypes';
import { applySoonest, mixHolding, playNext, playNow } from '@/app/soundDirector/libraryMix';
import { musicPosition, nextTrack, soundingMusic, withListChange } from '@/app/soundDirector/musicList';
import { addTrack, EMPTY_MIX, type MixTiming, type SoundMix } from '@/app/soundDirector/soundMix';

const FRAMES_PER_SECOND = 48_000;
const track = (key: string, seconds = 60): SoundInfo => ({ key, frames: seconds * FRAMES_PER_SECOND, gainDb: 0 });
const timing = (now: number): MixTiming => ({ now, leadMs: 50, fadeMs: 1000 });

function playing(...keys: string[]): SoundMix {
  let mix = EMPTY_MIX;
  for (const key of keys) mix = addTrack(mix, track(key), -3, timing(0));
  if (!mix.listChange || !mix.table.music) return mix;
  return { ...mix, table: { ...mix.table, music: { ...mix.table.music, tracks: mix.listChange.tracks } }, listChange: null };
}

const sounding = (mix: SoundMix, now: number): string | undefined => {
  const play = soundingMusic(mix.table, now);
  return play ? musicPosition(play, now)?.track.key : undefined;
};

describe('Play next', () => {
  it('starts the music where none plays', () => {
    const mix = playNext(EMPTY_MIX, track('a'), -6, timing(0));
    expect(sounding(mix, 1000)).toBe('a');
    expect(mix.table.music?.gainDb).toBe(-6);
  });

  it('puts a track right after the one sounding, without cutting it', () => {
    const mix = playNext(playing('a', 'b', 'c'), track('n'), 0, timing(1000));
    expect(mix.table.music?.tracks.map((one) => one.key)).toEqual(['a', 'b', 'c']);
    expect(sounding(mix, 2000)).toBe('a');
    expect(nextTrack(mix.table, 2000, mix.listChange)?.key).toBe('n');
    const taken = withListChange(mix.table, mix.listChange!, 60_050);
    expect(sounding({ ...mix, table: taken }, 60_100)).toBe('n');
    expect(taken.music?.tracks.map((one) => one.key)).toEqual(['n', 'b', 'c', 'a']);
  });

  it('moves a track already on the list', () => {
    const mix = playNext(playing('a', 'b', 'c'), track('c'), 0, timing(1000));
    expect(mix.listChange?.tracks.map((one) => one.key)).toEqual(['a', 'c', 'b']);
  });

  it('leaves the track sounding alone', () => {
    const mix = playing('a', 'b');
    expect(playNext(mix, track('a'), 0, timing(1000))).toBe(mix);
  });

  it('holds on a shuffled list too', () => {
    const base = playing('a', 'b', 'c', 'd', 'e');
    const shuffled: SoundMix = { ...base, table: { ...base.table, music: { ...base.table.music!, shuffle: true } } };
    const mix = playNext(shuffled, track('n'), 0, timing(1000));
    expect(mix.listChange?.next).toBe('n');
    const ends = musicPosition(shuffled.table.music!, 1000)!.endsAt;
    expect(sounding({ ...mix, table: withListChange(mix.table, mix.listChange!, ends) }, ends + 10)).toBe('n');
  });
});

describe('Play now', () => {
  it('crossfades to the track, and the list goes on from it', () => {
    const mix = playNow(playing('a', 'b', 'c'), track('n'), 0, timing(1000));
    expect(sounding(mix, 1100)).toBe('n');
    expect(mix.table.outgoing).toHaveLength(1);
    expect(mix.table.music?.tracks.map((one) => one.key)).toEqual(['n', 'b', 'c', 'a']);
    expect(mix.listChange).toBeNull();
  });

  it('leaves the track sounding alone', () => {
    const mix = playing('a', 'b');
    expect(playNow(mix, track('a'), 0, timing(1000))).toBe(mix);
  });

  it('keeps a change that was waiting', () => {
    const waiting = playNext(playing('a', 'b'), track('x'), 0, timing(500));
    const mix = playNow(waiting, track('n'), 0, timing(1000));
    expect(mix.table.music?.tracks.map((one) => one.key)).toContain('x');
  });
});

describe('a track that waited for its copy', () => {
  it('plays when it comes, and is asked for once', () => {
    const start: SoundMix = { ...playing('a', 'b'), soonest: { sound: 'n-id', at: 'now' } };
    expect(applySoonest(start, new Map(), timing(1000))).toBe(start);
    const mix = applySoonest(start, new Map([['n-id', track('n')]]), timing(1000));
    expect(sounding(mix, 1100)).toBe('n');
    expect(mix.soonest).toBeUndefined();
  });

  it('follows the one sounding when it comes', () => {
    const start: SoundMix = { ...playing('a', 'b'), soonest: { sound: 'n-id', at: 'next' } };
    const mix = applySoonest(start, new Map([['n-id', track('n')]]), timing(1000));
    expect(nextTrack(mix.table, 1000, mix.listChange)?.key).toBe('n');
  });
});

it('says what a mix holds, whether its copy is here or not', () => {
  const ids: Record<string, string> = { a: 'id-a', l: 'id-l' };
  const base = playing('a');
  const mix: SoundMix = {
    ...base,
    table: { ...base.table, layers: [{ sound: track('l'), startAt: 0, gainDb: 0, fade: { at: 0, ms: 0 } }] },
    waitingMusic: { tracks: ['id-w'], shuffle: false, levelDb: 0 },
    waitingLayers: [{ sound: 'id-x', levelDb: 0 }],
  };
  const holding = mixHolding(mix, 1000, (key) => ids[key] ?? null);
  expect([...holding.tracks]).toEqual([['id-a', 'a'], ['id-w', null]]);
  expect([...holding.layers]).toEqual([['id-l', 'l'], ['id-x', null]]);
});
