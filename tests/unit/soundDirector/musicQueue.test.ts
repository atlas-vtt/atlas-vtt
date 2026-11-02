import { describe, expect, it } from 'vitest';
import { parseSoundState } from '@/app/online/protocol/sound.ts';
import { wireState } from '@/app/online/gm/sound/soundWire.ts';
import { desiredSound } from '@/app/sound/engine/desiredSound';
import { fadeInGain, fadeOutGain } from '@/app/sound/engine/soundMath';
import { musicSpanAt, playFrameAt } from '@/app/sound/engine/soundTimeline';
import type { MusicRepeat, SoundInfo, TableSound } from '@/app/sound/soundTypes';
import { moodOf } from '@/app/soundLibrary/moodFile';
import { loadLastMix, saveLastMix } from '@/app/soundDirector/deviceFacts';
import { startMusic } from '@/app/soundDirector/liveEdits';
import { mixDiffersFrom } from '@/app/soundDirector/mixChange';
import { BACK_TO_PREVIOUS_MS, listView, musicPosition, nextTrack, playTrack, previousTrack, seekMusic, skipTrack, soundingMusic, soundingTrack } from '@/app/soundDirector/musicList';
import { notePlayed } from '@/app/soundDirector/playedTracks';
import { clearComing, EMPTY_MIX, mixAsMood, moveTrack, pressMood, removeTrack, setRepeat, setShuffle, withStopStillMeant, type SoundMix } from '@/app/soundDirector/soundMix';
import { EMPTY_TABLE_SOUND, STOP_AFTER_FADE_MS, TRACK_JOIN_MS } from '@/app/soundDirector/tableSound';
import { applyDueListChange } from '@/app/soundDirector/trackEnd';

const RATE = 48_000;
const AHEAD_MS = 1000;
const track = (key: string, seconds = 60): SoundInfo => ({ key, frames: seconds * RATE, gainDb: 0 });
const keys = (tracks: readonly SoundInfo[]): string[] => tracks.map((one) => one.key);
const LIST = [track('a', 60), track('b', 40), track('c', 50), track('d', 30), track('e', 20)];
const TIMING = { now: 0, leadMs: 0, fadeMs: 0 };

function playing(tracks: SoundInfo[], shuffle = false, repeat?: MusicRepeat, seed = 7): SoundMix {
  return { ...EMPTY_MIX, table: startMusic(EMPTY_TABLE_SOUND, tracks, shuffle, 0, seed, 0, 0, 0, repeat) };
}

/** The GM's pulse, four times a second, up to `until`. */
function pulse(mix: SoundMix, from: number, until: number, crossfadeMs = 0): SoundMix {
  let held = mix;
  for (let now = from; now <= until; now += 250) held = applyDueListChange(held, now, AHEAD_MS, { crossfadeMs });
  return held;
}

const sounding = (table: TableSound, now: number): string | undefined => soundingTrack(table, now)?.key;

/** What a page given only this state plays, track by track. */
function heardFrom(table: TableSound, from: number, until: number, stepMs = 1000): string[] {
  const heard: string[] = [];
  for (let now = from; now <= until; now += stepMs) {
    const key = sounding(table, now);
    if (key !== undefined && heard.at(-1) !== key) heard.push(key);
  }
  return heard;
}

describe('the list shows the order it plays', () => {
  it('under shuffle shows the pass really playing, and follows when a new pass begins', () => {
    const { table } = playing(LIST, true);
    const totalMs = LIST.reduce((sum, one) => sum + one.frames, 0) / (RATE / 1000);
    const firstPass = listView(table, null, 10);
    expect(firstPass.current).toBe(firstPass.tracks[0]?.key);
    expect(keys(firstPass.tracks)).not.toEqual(keys(LIST));
    expect(heardFrom(table, 10, totalMs - 10)).toEqual(keys(firstPass.tracks));
    const secondPass = listView(table, null, totalMs + 10);
    expect(heardFrom(table, totalMs + 10, 2 * totalMs - 10)).toEqual(keys(secondPass.tracks));
    expect(keys(secondPass.tracks)).not.toEqual(keys(firstPass.tracks));
  });

  it('says what plays at every clock, by the same read the sound goes by', () => {
    const { table } = playing(LIST, true);
    for (let now = 10; now < 400_000; now += 3000) {
      const view = listView(table, null, now);
      expect(view.current).toBe(sounding(table, now));
      expect(view.tracks.some((one) => one.key === view.current)).toBe(true);
    }
  });

  it('under shuffle keeps the order through a press and through a crossfade', () => {
    const { table } = playing(LIST, true);
    const order = keys(listView(table, null, 10).tracks);
    const pressed = playTrack(table, order[3]!, 1000, 0);
    expect(keys(listView(pressed, null, 2000).tracks)).toEqual(order);
    expect(sounding(pressed, 2000)).toBe(order[3]);
    const faded = pulse({ ...EMPTY_MIX, table }, 0, 300_000, 4000);
    expect(heardFrom(faded.table, 300_000, 300_000).length).toBe(1);
  });

  it('a shuffled change shows the track sounding first, and what follows as it will play', () => {
    const mix = setShuffle(playing(LIST), true);
    expect(mix.table.music?.shuffle).toBe(false);
    const view = listView(mix.table, mix.listChange, 10_000);
    expect(view.current).toBe('a');
    expect(view.tracks[0]?.key).toBe('a');
    expect(nextTrack(mix.table, 10_000, mix.listChange)?.key).toBe(view.tracks[1]?.key);
  });
});

describe('time left', () => {
  it('is what remains of the pass, or of the list that ends, and of the track held', () => {
    const { table } = playing(LIST);
    expect(listView(table, null, 10_000).leftFrames).toBe((50 + 40 + 50 + 30 + 20) * RATE);
    const off = playing(LIST, false, 'off').table;
    expect(listView(off, null, 10_000).leftFrames).toBe((50 + 40 + 50 + 30 + 20) * RATE);
    const one = playing(LIST, false, 'one').table;
    expect(listView(one, null, 10_000).leftFrames).toBe(50 * RATE);
    const single = playing([track('a')]).table;
    expect(listView(single, null, 10_000).leftFrames).toBe(50 * RATE);
  });

  it('takes the overlaps of a crossfade off', () => {
    const { table } = playing(LIST);
    expect(listView(table, null, 10_000, 4000).leftFrames).toBe((50 + 40 + 50 + 30 + 20 - 4 * 4) * RATE);
  });
});

describe('moving a track', () => {
  it('waits for the track’s end and never cuts it; the list and Then show it at once', () => {
    const mix = playing(LIST);
    const moved = moveTrack(mix, 'e', 1);
    expect(moved.table).toBe(mix.table);
    expect(keys(listView(moved.table, moved.listChange, 10_000).tracks)).toEqual(['a', 'e', 'b', 'c', 'd']);
    expect(nextTrack(moved.table, 10_000, moved.listChange)?.key).toBe('e');
    const before = pulse(moved, 0, 58_000);
    expect(before.table).toBe(mix.table);
    const after = pulse(before, 58_000, 59_500);
    expect(after.listChange).toBeNull();
    expect(after.table.music?.startAt).toBe(60_000 - TRACK_JOIN_MS);
    expect(sounding(after.table, 60_000 - TRACK_JOIN_MS - 1)).toBe('a');
    expect(sounding(after.table, 60_100)).toBe('e');
    expect(heardFrom(after.table, 60_100, 60_000 + 139_000)).toEqual(['e', 'b', 'c', 'd']);
  });

  it('of the track sounding, goes on from its new place', () => {
    const moved = moveTrack(playing(LIST), 'a', 3);
    const after = pulse(moved, 0, 59_500);
    expect(keys(after.table.music!.tracks)).toEqual(['b', 'c', 'd', 'a', 'e']);
    expect(sounding(after.table, 60_100)).toBe('e');
  });

  it('is refused while shuffled, and a move back leaves nothing waiting', () => {
    const shuffled = playing(LIST, true);
    expect(moveTrack(shuffled, 'e', 0)).toBe(shuffled);
    const mix = playing(LIST);
    expect(moveTrack(moveTrack(mix, 'e', 1), 'e', 4).listChange).toBeNull();
  });

  it('keeps how the list ends', () => {
    expect(moveTrack(playing(LIST, false, 'one'), 'e', 1).listChange?.repeat).toBe('one');
  });
});

describe('removing the track sounding', () => {
  const timing = { now: 70_000, leadMs: 0, fadeMs: 1000 };

  it('goes on to what followed it, not back to the top of the list', () => {
    const { table } = removeTrack(playing(LIST), 'b', timing, 'b');
    expect(sounding(table, 70_001)).toBe('c');
    expect(keys(table.music!.tracks)).toEqual(['a', 'c', 'd', 'e']);
  });

  it('the last goes round to the first, or ends a list that stops at its end', () => {
    expect(sounding(removeTrack(playing(LIST), 'e', { ...timing, now: 190_000 }, 'e').table, 190_001)).toBe('a');
    expect(removeTrack(playing(LIST, false, 'off'), 'e', { ...timing, now: 190_000 }, 'e').table.music).toBeNull();
  });
});

describe('clearing what’s coming', () => {
  it('keeps the current track and drops the rest', () => {
    const mix: SoundMix = { ...playing(LIST), waitingMusic: { tracks: ['later'], shuffle: false, levelDb: 0 }, soonest: { sounds: ['later'], at: 'next' } };
    const cleared = clearComing(mix, 10_000);
    expect(cleared.table).toBe(mix.table);
    expect(keys(cleared.listChange!.tracks)).toEqual(['a']);
    expect(cleared.waitingMusic).toBeNull();
    expect(cleared.soonest).toBeUndefined();
    expect(keys(listView(cleared.table, cleared.listChange, 10_000).tracks)).toEqual(['a']);
    expect(sounding(cleared.table, 30_000)).toBe('a');
    expect(nextTrack(cleared.table, 10_000, cleared.listChange)?.key).toBe('a');
  });

  it('then the track goes round on its seam, as a list of one does', () => {
    const after = pulse(clearComing(playing(LIST), 10_000), 0, 59_500);
    expect(keys(after.table.music!.tracks)).toEqual(['a']);
    for (const now of [60_100, 120_000, 3_600_000]) expect(sounding(after.table, now)).toBe('a');
    expect(desiredSound(after.table, 3_600_000).voices[0]?.span.endPlayFrame).toBeNull();
  });

  it('on a list that stops at its end stops after the current track', () => {
    const after = pulse(clearComing(playing(LIST, false, 'off'), 10_000), 0, 60_500);
    expect(after.table.music).toBeNull();
  });
});

describe('repeat one', () => {
  const held = (mix: SoundMix): SoundMix => pulse(setRepeat(mix, 'one'), 0, 59_500);

  it('holds the one track for good at every clock, on the state alone', () => {
    const { table } = held(playing(LIST));
    for (let now = 60_100; now < 10 * 3_600_000; now += 777_777) {
      expect(sounding(table, now)).toBe('a');
      expect(desiredSound(table, now).voices.filter((voice) => voice.fadeGain > 0).map((voice) => voice.span.sound.key)).toEqual(['a']);
    }
    expect(musicPosition(table.music!, 70_000)?.next).toBeNull();
    expect(table.music?.repeat).toBe('one');
  });

  it('turned on mid-track changes nothing that sounds, and the position carries on', () => {
    const mix = playing(LIST);
    const on = setRepeat(mix, 'one');
    expect(on.table).toBe(mix.table);
    expect(nextTrack(on.table, 30_000, on.listChange)?.key).toBe('a');
    expect(musicPosition(on.table.music!, 30_000)?.frame).toBe(30 * RATE);
    const after = pulse(on, 0, 58_500);
    expect(after.table).toBe(mix.table);
  });

  it('turned off carries on at its position and goes on to the next at the track’s end', () => {
    const one = held(playing(LIST));
    const wrap = 60_000 - TRACK_JOIN_MS + 3 * 60_000;
    const off = setRepeat(one, undefined);
    expect(off.table).toBe(one.table);
    expect(musicPosition(off.table.music!, wrap - 30_000)?.frame).toBe(30 * RATE);
    expect(nextTrack(off.table, wrap - 30_000, off.listChange)?.key).toBe('b');
    const after = pulse(off, wrap - 30_000, wrap - 500);
    expect(after.listChange).toBeNull();
    expect(sounding(after.table, wrap - TRACK_JOIN_MS - 1)).toBe('a');
    expect(sounding(after.table, wrap + 100)).toBe('b');
    expect(after.table.music?.repeat).toBeUndefined();
    expect(heardFrom(after.table, wrap + 100, wrap + 125_000)).toEqual(['b', 'c', 'd', 'e']);
  });

  it('takes no crossfade going round, however long one is set', () => {
    const { table } = pulse(setRepeat(playing(LIST), 'one'), 0, 59_500, 12_000);
    expect(table.music?.fade.ms).toBe(TRACK_JOIN_MS);
    const later = pulse({ ...EMPTY_MIX, table }, 60_000, 400_000, 12_000);
    expect(later.table).toBe(table);
  });

  it('under shuffle holds the track that was sounding', () => {
    const mix = playing(LIST, true);
    const order = keys(listView(mix.table, null, 10).tracks);
    const { table } = pulse(setRepeat(mix, 'one'), 0, 60_000);
    const first = order[0]!;
    expect(sounding(table, LIST.find((one) => one.key === first)!.frames / (RATE / 1000) + 100)).toBe(first);
  });

  it('a press and a skip hold the track they go to', () => {
    const { table } = held(playing(LIST));
    const pressed = playTrack(table, 'c', 100_000, 0);
    expect(heardFrom(pressed, 100_100, 800_000, 7000)).toEqual(['c']);
    const skipped = skipTrack(table, 100_000, 0);
    expect(heardFrom(skipped, 100_100, 800_000, 7000)).toEqual(['b']);
  });

  it('a list of one takes it at once as far as anyone can hear: the same endless span', () => {
    const all = playing([track('a')]);
    const one = pulse(setRepeat(all, 'one'), 0, 59_500);
    expect(musicSpanAt(one.table.music!, 48_000)?.endPlayFrame).toBeNull();
    expect(sounding(one.table, 600_000)).toBe('a');
  });
});

describe('repeat off', () => {
  it('is silent past the end of the list on a page given only the state', () => {
    const { table } = playing(LIST, false, 'off');
    expect(heardFrom(table, 10, 199_990)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(desiredSound(table, 199_990).voices).toHaveLength(1);
    for (const now of [200_000, 300_000, 10 * 3_600_000]) {
      expect(desiredSound(table, now).voices).toEqual([]);
      expect(sounding(table, now)).toBeUndefined();
    }
    const playFrame = playFrameAt(0, 200_000);
    expect(musicSpanAt(table.music!, playFrame)).toBeNull();
  });

  it('ends the music on the GM’s side, as if stopped, so the card leaves', () => {
    const mix: SoundMix = { ...playing(LIST, false, 'off'), waitingMusic: { tracks: ['later'], shuffle: false, levelDb: 0 } };
    const still = pulse(mix, 0, 199_750);
    expect(still.table.music).not.toBeNull();
    const after = pulse(still, 200_000, 200_250);
    expect(after.table.music).toBeNull();
    expect(after.waitingMusic).toBeNull();
    expect(after.table.outgoing).toEqual([]);
  });

  it('turned on in the middle plays to the end of this pass from the track’s end on', () => {
    const on = setRepeat(playing(LIST), 'off');
    const after = pulse(on, 70_000, 99_500);
    expect(after.table.music?.repeat).toBe('off');
    expect(heardFrom(after.table, 100_100, 300_000)).toEqual(['c', 'd', 'e']);
    expect(sounding(after.table, 200_000)).toBeUndefined();
  });

  it('turned on a list’s last track, or on a list of one, ends it at that track’s end and not a round later', () => {
    expect(pulse(setRepeat(playing([track('a')]), 'off'), 1000, 60_000).table.music).toBeNull();
    expect(pulse(setRepeat(playing([track('a'), track('b', 1)]), 'off'), 60_200, 61_000).table.music).toBeNull();
  });

  it('goes on past a pass the list had already gone round, stopping at the end of the one it stands in', () => {
    const on = setRepeat(playing(LIST), 'off');
    const after = pulse(on, 220_000, 259_500);
    expect(after.table.music?.repeat).toBe('off');
    expect(heardFrom(after.table, 260_100, 500_000)).toEqual(['b', 'c', 'd', 'e']);
    expect(sounding(after.table, 400_000)).toBeUndefined();
  });

  it('a skip at the end of such a list ends it, and the list shows no Then', () => {
    const { table } = playing([track('a'), track('b')], false, 'off');
    expect(nextTrack(table, 70_000)).toBeNull();
    expect(skipTrack(table, 70_000, 0).music).toBeNull();
  });
});

describe('a mood and its repeat', () => {
  const idOf = (key: string): string => key;
  const ready = new Map(LIST.map((one) => [one.key, one]));

  it('saves the mode, a change waiting included, and unset reads as all', () => {
    expect(mixAsMood(playing(LIST), idOf, 4, 10).music).not.toHaveProperty('repeat');
    expect(mixAsMood(playing(LIST, false, 'one'), idOf, 4, 10).music).toMatchObject({ repeat: 'one' });
    expect(mixAsMood(setRepeat(playing(LIST), 'off'), idOf, 4, 10).music).toMatchObject({ repeat: 'off' });
  });

  it('pressing it restores the mode', () => {
    const entered = pressMood(EMPTY_MIX, { fadeSeconds: 0, music: { tracks: ['a', 'b'], shuffle: false, levelDb: 0, repeat: 'one' }, layers: [] }, null, ready, () => true, 0, 0);
    expect(entered.table.music?.repeat).toBe('one');
    expect(heardFrom(entered.table, 10, 500_000, 9000)).toEqual(['a']);
  });

  it('a list both moods share goes on, and takes the mode at its track’s end', () => {
    const mix = playing([LIST[0]!, LIST[1]!]);
    const pressed = pressMood(mix, { fadeSeconds: 0, music: { tracks: ['a', 'b'], shuffle: false, levelDb: 0, repeat: 'off' }, layers: [] }, null, ready, () => true, 10_000, 0);
    expect(pressed.table.music?.startAt).toBe(mix.table.music?.startAt);
    expect(pressed.listChange?.repeat).toBe('off');
    const after = pulse(pressed, 10_000, 59_500);
    expect(after.table.music?.repeat).toBe('off');
    expect(heardFrom(after.table, 60_100, 200_000)).toEqual(['b']);
  });

  it('a file keeps it, and what is no mode reads as unset', () => {
    const stored = (repeat: unknown): ReturnType<typeof moodOf> => moodOf({ id: 'm', name: 'm', order: 1, music: { tracks: ['a'], shuffle: false, levelDb: 0, repeat }, layers: [] });
    expect(stored('one')?.music).toMatchObject({ repeat: 'one' });
    expect(stored('off')?.music).toMatchObject({ repeat: 'off' });
    expect(stored('sideways')?.music).not.toHaveProperty('repeat');
    expect(stored(undefined)?.music).not.toHaveProperty('repeat');
  });

  it('the device’s last mix keeps it', () => {
    const memory = new Map<string, unknown>();
    const storage = { loadLocalStorage: (key: string) => memory.get(key) ?? null, saveLocalStorage: (key: string, value: unknown) => { memory.set(key, value); } };
    saveLastMix(storage as never, { mood: null, mix: { fadeSeconds: 2, music: { tracks: ['a'], shuffle: false, levelDb: 0, repeat: 'one' }, layers: [] } });
    expect(loadLastMix(storage as never)?.mix.music).toMatchObject({ repeat: 'one' });
  });

  it('a changed mode shows as a change of the mood', () => {
    const saved = { music: { tracks: ['a'], shuffle: false, levelDb: 0 }, layers: [] };
    expect(mixDiffersFrom(saved, { music: { ...saved.music, repeat: 'one' }, layers: [] }, () => true)).toBe(true);
    expect(mixDiffersFrom(saved, { music: saved.music, layers: [] }, () => true)).toBe(false);
  });
});

describe('what a page takes', () => {
  const soundOf = (key: string): { key: string; credit: null } => ({ key: `${key}${'0'.repeat(64)}`.slice(0, 64), credit: null });
  const state = (music: Partial<TableSound['music'] & object>): unknown => JSON.parse(JSON.stringify(wireState({ ...playing(LIST).table, music: { ...playing(LIST).table.music!, ...music } }, soundOf)));

  it('parses a state with the new fields, without them, and with what it does not know', () => {
    const parse = (value: unknown): TableSound['music'] => (parseSoundState(value) as TableSound | null)?.music ?? null;
    const plain = state({}) as { music: Record<string, unknown> };
    expect(plain.music).not.toHaveProperty('repeat');
    expect(plain.music).not.toHaveProperty('listFrame');
    expect(parse(plain)).not.toHaveProperty('repeat');
    const full = state({ repeat: 'one', listFrame: 96_000 });
    expect(parse(full)).toMatchObject({ repeat: 'one', listFrame: 96_000 });
    expect(parse({ ...plain, music: { ...plain.music, somethingNew: { a: 1 } } })).not.toHaveProperty('somethingNew');
  });

  it('reads a bad value in them as unset, and never refuses the state over it', () => {
    const plain = state({}) as { music: Record<string, unknown> };
    for (const bad of [{ repeat: 'sideways' }, { repeat: 1 }, { listFrame: -1 }, { listFrame: 1.5 }, { listFrame: 'x' }, { listFrame: 2 ** 60 }]) {
      const parsed = parseSoundState({ ...plain, music: { ...plain.music, ...bad } });
      expect(parsed?.music).not.toBeNull();
      expect(parsed?.music).not.toHaveProperty('repeat');
      expect(parsed?.music).not.toHaveProperty('listFrame');
    }
  });

  it('plays what the GM’s side would from a parsed state: a list taken up in the middle, held, or stopping', () => {
    const parsed = parseSoundState(state({ repeat: 'off', listFrame: 150 * RATE, startAt: 0, fade: { at: 0, ms: 0 } })) as unknown as TableSound;
    expect(parsed.music).not.toBeNull();
    expect(desiredSound(parsed, 10).voices).toHaveLength(1);
    expect(desiredSound(parsed, 51_000).voices).toEqual([]);
  });

  it('never carries a name, the GM’s stop or what played', () => {
    const mix: SoundMix = { ...playing(LIST), stopAfter: 'a' };
    const sent = JSON.stringify(wireState(mix.table, () => ({ key: 'f'.repeat(64), credit: null })));
    expect(sent).not.toContain('stopAfter');
    expect(sent).not.toContain('played');
    for (const { key } of LIST) expect(sent).not.toContain(`"${key}"`);
    expect(Object.keys(mix.table)).not.toContain('played');
  });
});

describe('stop after this track', () => {
  const armed = (mix: SoundMix, key = 'a'): SoundMix => ({ ...mix, stopAfter: key });

  it('stops at the track’s end on a short fade, with the rest of the list gone', () => {
    const before = pulse(armed(playing(LIST)), 0, 58_000);
    expect(before.table.music).not.toBeNull();
    const after = pulse(before, 58_250, 58_500);
    expect(after.table.music).toBeNull();
    expect(after.stopAfter).toBeNull();
    const fade = after.table.outgoing[0]!.fade;
    expect(fade.at + fade.ms).toBe(60_000);
    expect(fade.ms).toBeGreaterThan(STOP_AFTER_FADE_MS / 2);
    expect(fade.ms).toBeLessThanOrEqual(STOP_AFTER_FADE_MS);
    const page = desiredSound(after.table, 59_999);
    expect(page.voices[0]?.span.sound.key).toBe('a');
    expect(desiredSound(after.table, 60_000).voices).toEqual([]);
  });

  it('wins over a crossfade and a change waiting', () => {
    const mix = moveTrack(armed(playing(LIST)), 'c', 1);
    const after = pulse(mix, 0, 59_000, 12_000);
    expect(after.table.music).toBeNull();
    expect(after.listChange).toBeNull();
  });

  it('is not on the wire and leaves the state alone until then', () => {
    const mix = playing(LIST);
    expect(armed(mix).table).toBe(mix.table);
  });

  it('goes when a press replaces the track, and stays through what does not', () => {
    const mix = armed(playing(LIST));
    expect(withStopStillMeant(mix, 10_000)).toBe(mix);
    const moved = moveTrack(mix, 'e', 1);
    expect(withStopStillMeant(moved, 10_000).stopAfter).toBe('a');
    const pressed = { ...mix, table: playTrack(mix.table, 'c', 10_000, 0) };
    expect(withStopStillMeant(pressed, 10_001).stopAfter).toBeNull();
    const skipped = { ...mix, table: skipTrack(mix.table, 10_000, 0) };
    expect(withStopStillMeant(skipped, 10_001).stopAfter).toBeNull();
    const removed = removeTrack(mix, 'a', TIMING, 'a');
    expect(withStopStillMeant(removed, 1).stopAfter).toBeNull();
  });
});

describe('crossfade between tracks', () => {
  const crossfadeMs = 4000;
  const faded = (mix = playing(LIST), until = 59_000): SoundMix => pulse(mix, 0, until, crossfadeMs);

  it('writes what comes ahead of the track’s end, as a play coming in, with what ends leaving', () => {
    expect(pulse(playing(LIST), 0, 54_000, crossfadeMs).table.music?.startAt).toBe(0);
    const { table } = pulse(playing(LIST), 0, 55_000, crossfadeMs);
    expect(table.music?.startAt).toBe(56_000);
    expect(table.music?.fade).toEqual({ at: 56_000, ms: crossfadeMs });
    expect(table.outgoing).toHaveLength(1);
    expect(table.outgoing[0]?.fade).toEqual({ at: 56_000, ms: crossfadeMs });
    expect(sounding(table, 55_000)).toBe('a');
    expect(soundingMusic(table, 55_000)?.startAt).toBe(0);
    expect(sounding(table, 56_001)).toBe('b');
  });

  it('is equal power on a page given only the state, and the voices are right at both ends', () => {
    const { table } = faded();
    for (let now = 56_000; now <= 60_000; now += 100) {
      const voices = desiredSound(table, now).voices;
      expect(voices.map((voice) => voice.role).sort()).toEqual(now === 60_000 ? ['in'] : ['in', 'out']);
      const power = voices.reduce((sum, voice) => sum + voice.fadeGain ** 2, 0);
      expect(power).toBeCloseTo(1, 6);
    }
    const coming = desiredSound(table, 58_000).voices.find((voice) => voice.role === 'in');
    expect(coming?.span.sound.key).toBe('b');
    expect(coming?.frame).toBe(2 * RATE);
    expect(coming?.fadeGain).toBeCloseTo(fadeInGain(0.5), 6);
    const leaving = desiredSound(table, 58_000).voices.find((voice) => voice.role === 'out');
    expect(leaving?.span.sound.key).toBe('a');
    expect(leaving?.fadeGain).toBeCloseTo(fadeOutGain(0.5), 6);
  });

  it('never lets a page hear what the old list had next', () => {
    const { table } = faded();
    const leaving = table.outgoing[0]!;
    const atItsEnd = desiredSound({ ...table, music: null, outgoing: [leaving] }, 60_000);
    expect(atItsEnd.voices).toEqual([]);
  });

  it('runs one after another through a whole list, in its order, for good', () => {
    const { table } = pulse(playing(LIST), 0, 600_000, crossfadeMs);
    expect(table.music?.tracks).toEqual(LIST);
    expect(table.outgoing.length).toBeLessThanOrEqual(1);
    const first = pulse(playing(LIST), 0, 100_000, crossfadeMs).table;
    expect(sounding(first, 100_000)).toBe('c');
  });

  it('without the GM the state’s own timeline joins without a gap', () => {
    const { table } = faded();
    const music = table.music!;
    const span = musicSpanAt(music, 0)!;
    const after = musicSpanAt(music, span.endPlayFrame!)!;
    expect(after.startPlayFrame).toBe(span.endPlayFrame);
    expect(keys([span.sound, after.sound])).toEqual(['b', 'c']);
    expect(heardFrom(table, 60_100, 56_000 + 40_000 + 50_000 + 30_000 + 20_000 - 100)).toEqual(['b', 'c', 'd', 'e']);
  });

  it('under shuffle keeps the pass, and each track plays once in it', () => {
    const mix = playing(LIST, true);
    const order = keys(listView(mix.table, null, 10).tracks);
    let held = mix;
    const heard: string[] = [];
    for (let now = 0; now < 180_000; now += 250) {
      held = applyDueListChange(held, now, AHEAD_MS, { crossfadeMs });
      const key = sounding(held.table, now);
      if (key !== undefined && heard.at(-1) !== key) heard.push(key);
      expect(keys(listView(held.table, null, now).tracks)).toEqual(order);
    }
    expect(heard).toEqual(order);
  });

  it('a list that stops at its end stops there, with no crossfade into nothing', () => {
    // Four overlaps of 4 s take 16 s off the 200 s the tracks hold.
    const { table } = pulse(playing(LIST, false, 'off'), 0, 183_000, crossfadeMs);
    expect(table.music?.fade.ms).toBe(crossfadeMs);
    expect(sounding(table, 183_000)).toBe('e');
    const after = pulse({ ...EMPTY_MIX, table }, 183_250, 184_250, crossfadeMs);
    expect(after.table.music).toBeNull();
  });

  it('a list of one goes round on its seam', () => {
    const single = playing([track('a')]);
    expect(pulse(single, 0, 300_000, crossfadeMs)).toBe(single);
  });

  it('never takes over half of a short track', () => {
    const { table } = pulse(playing([track('a', 60), track('b', 4), track('c', 60)]), 0, 57_500, 12_000);
    expect(table.music?.fade.ms).toBe(2000);
    expect(table.music?.startAt).toBe(58_000);
  });

  it('a seek into the last moments shrinks it, and with no room left the state’s own join does it', () => {
    const late = pulse(playing(LIST), 58_750, 58_750, crossfadeMs);
    expect(late.table.music?.fade.ms).toBe(1200);
    expect(late.table.music?.startAt).toBe(58_800);
    const online = applyDueListChange(playing(LIST), 59_500, 2000, { leadMs: 1000, crossfadeMs });
    expect(online.table.music?.startAt).toBe(0);
  });

  it('a change waiting takes the crossfade too', () => {
    const moved = moveTrack(playing(LIST), 'e', 1);
    const { table } = pulse(moved, 0, 55_000, crossfadeMs);
    expect(table.music?.startAt).toBe(56_000);
    expect(sounding(table, 56_001)).toBe('e');
    expect(keys(table.music!.tracks)).toEqual(['a', 'e', 'b', 'c', 'd']);
    expect(listView(table, null, 57_000).current).toBe('e');
  });

  it('stays out of what is set to 0: nothing is written and the timeline joins', () => {
    const mix = playing(LIST);
    expect(pulse(mix, 0, 400_000, 0)).toBe(mix);
  });
});

describe('back', () => {
  const backTrack = (table: TableSound, now: number, leadMs: number): TableSound => {
    const previous = previousTrack(table, now);
    return previous ? playTrack(table, previous.key, now, leadMs) : seekMusic(table, 0, now);
  };

  it('in a track’s first seconds goes to the track before; later restarts this one', () => {
    const { table } = playing(LIST);
    const onB = 60_000 + BACK_TO_PREVIOUS_MS - 100;
    expect(sounding(backTrack(table, onB, 0), onB + 100)).toBe('a');
    const later = 60_000 + BACK_TO_PREVIOUS_MS + 100;
    const restarted = backTrack(table, later, 0);
    expect(sounding(restarted, later + 10)).toBe('b');
    expect(musicPosition(restarted.music!, later)?.frame).toBe(0);
  });

  it('on a list of one restarts', () => {
    const { table } = playing([track('a')]);
    const restarted = backTrack(table, 1000, 0);
    expect(musicPosition(restarted.music!, 1000)?.frame).toBe(0);
    expect(sounding(restarted, 1001)).toBe('a');
  });

  it('from the list’s first track goes to its last, in the order it plays; a list that stops there restarts', () => {
    const mix = playing(LIST, true);
    const order = keys(listView(mix.table, null, 10).tracks);
    expect(sounding(backTrack(mix.table, 1000, 0), 1100)).toBe(order.at(-1));
    const off = playing(LIST, false, 'off').table;
    const restarted = backTrack(off, 1000, 0);
    expect(sounding(restarted, 1001)).toBe('a');
    expect(musicPosition(restarted.music!, 1000)?.frame).toBe(0);
  });
});

describe('played', () => {
  it('holds each track once, the latest first, within its limit', () => {
    expect(notePlayed(notePlayed(notePlayed([], 'a'), 'b'), 'a')).toEqual(['a', 'b']);
    let many: string[] = [];
    for (let index = 0; index < 100; index++) many = notePlayed(many, `t${index}`);
    expect(many).toHaveLength(30);
    expect(many[0]).toBe('t99');
  });
});
