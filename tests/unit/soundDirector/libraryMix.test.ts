import { describe, expect, it } from 'vitest';
import type { SoundInfo } from '@/app/sound/soundTypes';
import { applySoonest, mixHolding, playNext, playNow } from '@/app/soundDirector/libraryMix';
import { desiredSound } from '@/app/sound/engine/desiredSound';
import { musicPosition, nextTrack, seekMusic, soundingMusic, withListChange } from '@/app/soundDirector/musicList';
import { addTrack, EMPTY_MIX, type MixTiming, type SoundMix } from '@/app/soundDirector/soundMix';
import { SEEK_FADE_MS } from '@/app/soundDirector/tableSound';

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

describe('seekMusic', () => {
  it('moves the track sounding, and what played leaves on a short fade', () => {
    const mix = playing('a');
    const now = 10_000;
    const table = seekMusic(mix.table, 30 * FRAMES_PER_SECOND, now);
    const play = table.music!;
    expect(musicPosition(play, now)?.frame).toBe(30 * FRAMES_PER_SECOND);
    expect(musicPosition(play, now + 1000)?.frame).toBe(31 * FRAMES_PER_SECOND);
    expect(play.fade).toEqual({ at: play.startAt, ms: 0 });
    expect(play.gainDb).toBe(mix.table.music?.gainDb);
    expect(table.outgoing).toEqual([{ ...mix.table.music, fade: { at: now, ms: SEEK_FADE_MS } }]);
    // Coming in, and at its level at once: a level change would keep the old voice's fade.
    const voice = desiredSound(table, now).voices.find((one) => one.startAt === play.startAt);
    expect(voice?.role).toBe('in');
    expect(voice?.fadeGain).toBe(1);
  });

  it('stays in the track sounding, in a list that goes on in its order', () => {
    const { table: start } = playing('a', 'b', 'c');
    const inSecond = (start.music?.startAt ?? 0) + 70_000;
    const table = seekMusic(start, 45 * FRAMES_PER_SECOND, inSecond);
    const position = musicPosition(table.music!, inSecond);
    expect(position?.track.key).toBe('b');
    expect(position?.frame).toBe(45 * FRAMES_PER_SECOND);
    expect(position?.next?.key).toBe('c');
  });

  it('keeps inside the track, and leaves a play that has not begun alone', () => {
    const { table } = playing('a');
    const now = 10_000;
    expect(musicPosition(seekMusic(table, 1e12, now).music!, now)?.frame).toBe(60 * FRAMES_PER_SECOND - 1);
    expect(musicPosition(seekMusic(table, -5, now).music!, now)?.frame).toBe(0);
    expect(seekMusic(table, 100, (table.music?.startAt ?? 0) - 1)).toBe(table);
    expect(seekMusic(EMPTY_MIX.table, 100, now)).toBe(EMPTY_MIX.table);
  });
});

describe('Play next', () => {
  it('starts the music where none plays', () => {
    const mix = playNext(EMPTY_MIX, [track('a')], -6, timing(0));
    expect(sounding(mix, 1000)).toBe('a');
    expect(mix.table.music?.gainDb).toBe(-6);
  });

  it('puts a track right after the one sounding, without cutting it', () => {
    const mix = playNext(playing('a', 'b', 'c'), [track('n')], 0, timing(1000));
    expect(mix.table.music?.tracks.map((one) => one.key)).toEqual(['a', 'b', 'c']);
    expect(sounding(mix, 2000)).toBe('a');
    expect(nextTrack(mix.table, 2000, mix.listChange)?.key).toBe('n');
    const taken = withListChange(mix.table, mix.listChange!, 60_050);
    expect(sounding({ ...mix, table: taken }, 60_100)).toBe('n');
    expect(taken.music?.tracks.map((one) => one.key)).toEqual(['a', 'n', 'b', 'c']);
  });

  it('moves a track already on the list', () => {
    const mix = playNext(playing('a', 'b', 'c'), [track('c')], 0, timing(1000));
    expect(mix.listChange?.tracks.map((one) => one.key)).toEqual(['a', 'c', 'b']);
  });

  it('leaves the track sounding alone', () => {
    const mix = playing('a', 'b');
    expect(playNext(mix, [track('a')], 0, timing(1000))).toBe(mix);
  });

  it('holds on a shuffled list too', () => {
    const base = playing('a', 'b', 'c', 'd', 'e');
    const shuffled: SoundMix = { ...base, table: { ...base.table, music: { ...base.table.music!, shuffle: true } } };
    const mix = playNext(shuffled, [track('n')], 0, timing(1000));
    expect(mix.listChange?.next).toBe('n');
    const ends = musicPosition(shuffled.table.music!, 1000)!.endsAt;
    expect(sounding({ ...mix, table: withListChange(mix.table, mix.listChange!, ends) }, ends + 10)).toBe('n');
  });
});

describe('Play now', () => {
  it('crossfades to the track, and the list goes on from it', () => {
    const mix = playNow(playing('a', 'b', 'c'), [track('n')], 0, timing(1000));
    expect(sounding(mix, 1100)).toBe('n');
    expect(mix.table.outgoing).toHaveLength(1);
    expect(mix.table.music?.tracks.map((one) => one.key)).toEqual(['n', 'b', 'c']);
    expect(mix.table.music?.fade.ms).toBe(1000);
    expect(mix.listChange).toBeNull();
  });

  it('leaves no trail of what was chosen before, also while a play is still in its lead', () => {
    let mix = playNow(playing('a'), [track('b')], 0, timing(1000));
    expect(mix.table.music?.tracks.map((one) => one.key)).toEqual(['b']);
    mix = playNow(mix, [track('c')], 0, timing(1010));
    expect(mix.table.music?.tracks.map((one) => one.key)).toEqual(['c']);
    expect(mixHolding(mix, 1011, (key) => key).tracks.size).toBe(1);
  });

  it('goes to a track of the list, which keeps the one it leaves', () => {
    const mix = playNow(playing('a', 'b', 'c'), [track('c')], 0, timing(1000));
    expect(sounding(mix, 1100)).toBe('c');
    expect(mix.table.music?.tracks.map((one) => one.key)).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('leaves the track sounding alone', () => {
    const mix = playing('a', 'b');
    expect(playNow(mix, [track('a')], 0, timing(1000))).toBe(mix);
  });

  it('keeps a change that was waiting', () => {
    const waiting = playNext(playing('a', 'b'), [track('x')], 0, timing(500));
    const mix = playNow(waiting, [track('n')], 0, timing(1000));
    expect(mix.table.music?.tracks.map((one) => one.key)).toContain('x');
  });
});

describe('a track that waited for its copy', () => {
  it('plays when it comes, and is asked for once', () => {
    const start: SoundMix = { ...playing('a', 'b'), soonest: { sounds: ['n-id'], at: 'now' } };
    expect(applySoonest(start, new Map(), timing(1000))).toBe(start);
    const mix = applySoonest(start, new Map([['n-id', track('n')]]), timing(1000));
    expect(sounding(mix, 1100)).toBe('n');
    expect(mix.soonest).toBeUndefined();
  });

  it('follows the one sounding when it comes', () => {
    const start: SoundMix = { ...playing('a', 'b'), soonest: { sounds: ['n-id'], at: 'next' } };
    const mix = applySoonest(start, new Map([['n-id', track('n')]]), timing(1000));
    expect(nextTrack(mix.table, 1000, mix.listChange)?.key).toBe('n');
  });
});

describe('a selection', () => {
  const selection = ['x', 'y', 'z'].map((key) => track(key));
  const listOf = (mix: SoundMix): string[] | undefined => (mix.listChange ?? mix.table.music)?.tracks.map((one) => one.key);
  const ready = (...keys: string[]): Map<string, SoundInfo> => new Map(keys.map((key) => [`${key}-id`, track(key)]));
  const ids = selection.map((one) => `${one.key}-id`);

  it('follows the one sounding in its own order, Play next', () => {
    const mix = playNext(playing('s', 'b'), selection, 0, timing(1000));
    expect(listOf(mix)).toEqual(['s', 'x', 'y', 'z', 'b']);
    expect(mix.table.music?.tracks.map((one) => one.key)).toEqual(['s', 'b']);
    expect(nextTrack(mix.table, 1000, mix.listChange)?.key).toBe('x');
  });

  it('starts in its own order where no music plays, with both presses', () => {
    for (const press of [playNext, playNow]) {
      const mix = press(EMPTY_MIX, selection, -6, timing(0));
      expect(listOf(mix)).toEqual(['x', 'y', 'z']);
      expect(mix.table.music?.gainDb).toBe(-6);
      expect(sounding(mix, 1000)).toBe('x');
    }
  });

  it('starts its first with the rest after it, Play now', () => {
    const mix = playNow(playing('s', 'b'), selection, 0, timing(1000));
    expect(sounding(mix, 1100)).toBe('x');
    expect(mix.table.music?.tracks.map((one) => one.key)).toEqual(['x', 'y', 'z', 'b']);
    expect(mix.table.outgoing).toHaveLength(1);
  });

  it('leaves the track sounding where it stands in it', () => {
    const next = playNext(playing('s', 'b'), [track('x'), track('s'), track('y')], 0, timing(1000));
    expect(listOf(next)).toEqual(['s', 'x', 'y', 'b']);
    const now = playNow(playing('s', 'b'), [track('s'), track('x')], 0, timing(1000));
    expect(sounding(now, 1100)).toBe('s');
    expect(now.table.outgoing).toEqual([]);
    expect(listOf(now)).toEqual(['s', 'x', 'b']);
  });

  it('keeps its order while its copies come one by one, Play next', () => {
    let mix: SoundMix = { ...playing('s', 'b'), soonest: { sounds: ids, at: 'next' } };
    mix = applySoonest(mix, ready('x'), timing(1000));
    expect(listOf(mix)).toEqual(['s', 'x', 'b']);
    mix = applySoonest(mix, ready('y'), timing(1000));
    expect(listOf(mix)).toEqual(['s', 'x', 'y', 'b']);
    expect(nextTrack(mix.table, 1000, mix.listChange)?.key).toBe('x');
    mix = applySoonest(mix, ready('z'), timing(1000));
    expect(listOf(mix)).toEqual(['s', 'x', 'y', 'z', 'b']);
    expect(mix.soonest).toBeUndefined();
  });

  it('keeps its order while its copies come one by one, Play now', () => {
    let mix: SoundMix = { ...playing('s', 'b'), soonest: { sounds: ids, at: 'now' } };
    // What comes before the first waits for it: the first is what was asked to sound.
    expect(applySoonest(mix, ready('z'), timing(1000))).toBe(mix);
    mix = applySoonest(mix, ready('x'), timing(1000));
    expect(sounding(mix, 1100)).toBe('x');
    mix = applySoonest(mix, ready('z'), timing(1200));
    expect(mix.soonest?.sounds).toEqual(['y-id', 'z-id']);
    mix = applySoonest(mix, ready('y', 'z'), timing(1200));
    expect(listOf(mix)).toEqual(['x', 'y', 'z', 'b']);
    expect(mix.soonest).toBeUndefined();
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
