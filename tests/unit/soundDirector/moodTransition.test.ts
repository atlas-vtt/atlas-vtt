import { describe, expect, it } from 'vitest';
import { desiredSound } from '@/app/sound/engine/desiredSound';
import type { Mood, SoundInfo, TableSound } from '@/app/sound/soundTypes';
import { moodTransition } from '@/app/soundDirector/moodTransition';
import { addLayer, removeLayer, setLayerLevel, setLayerMuted, setMusicLevel, setMusicMuted, toggleSilence } from '@/app/soundDirector/liveEdits';
import { musicPosition, nextTrack, playTrack, skipTrack, withListChange } from '@/app/soundDirector/musicList';
import { applyDueListChange, EMPTY_MIX, joinReady, mixAsMood, pressMood, removeTrack, setShuffle } from '@/app/soundDirector/soundMix';
import { EMPTY_TABLE_SOUND } from '@/app/soundDirector/tableSound';

const RATE = 48000;

function info(key: string, seconds = 60): SoundInfo {
  return { key, frames: seconds * RATE, gainDb: 0 };
}

const SOUNDS = new Map(['rain', 'wind', 'fire', 'a', 'b', 'c'].map((id) => [id, info(id)]));

function mood(partial: Partial<Mood>): Mood {
  return { id: 'm', name: 'm', order: 1, fadeSeconds: 4, music: 'keep', layers: [], ...partial };
}

const roles = (state: TableSound, now: number): Record<string, string> =>
  Object.fromEntries(desiredSound(state, now).voices.map((voice) => [voice.id.split(':').slice(0, 1).join('') + ':' + voice.span.sound.key, voice.role]));

describe('moodTransition', () => {
  it('keeps a layer both moods share, in its place, and only moves its level', () => {
    const first = moodTransition(EMPTY_TABLE_SOUND, mood({ layers: [{ sound: 'rain', levelDb: -6 }, { sound: 'wind', levelDb: -6 }] }), SOUNDS, 1000);
    const second = moodTransition(first, mood({ layers: [{ sound: 'rain', levelDb: -12 }, { sound: 'fire', levelDb: 0 }] }), SOUNDS, 9000);
    const rain = second.layers.find((play) => play.sound.key === 'rain');
    expect(rain?.startAt).toBe(first.layers[0]?.startAt);
    expect(rain?.gainDb).toBe(-12);
    expect(roles(second, 9100)['layer:rain']).toBe('level');
    expect(roles(second, 9100)['layer:fire']).toBe('in');
    expect(roles(second, 9100)['layer:wind']).toBe('out');
    expect(second.outgoingLayers.map((play) => play.sound.key)).toEqual(['wind']);
    expect(second.revision).toBe(first.revision + 1);
  });

  it('never lets a kept layer dip: its fade gain stays whole through the change', () => {
    const first = moodTransition(EMPTY_TABLE_SOUND, mood({ layers: [{ sound: 'rain', levelDb: 0 }] }), SOUNDS, 0);
    const second = moodTransition(first, mood({ layers: [{ sound: 'rain', levelDb: 0 }] }), SOUNDS, 8000);
    for (const at of [8000, 8500, 10000, 12000]) {
      expect(desiredSound(second, at).voices[0]?.fadeGain).toBe(1);
    }
  });

  it('crossfades music over the mood’s fade, at equal power', () => {
    const first = moodTransition(EMPTY_TABLE_SOUND, mood({ music: { tracks: ['a'], shuffle: false, levelDb: 0 } }), SOUNDS, 0);
    const second = moodTransition(first, mood({ music: { tracks: ['b'], shuffle: false, levelDb: 0 }, fadeSeconds: 2 }), SOUNDS, 10000);
    expect(second.music?.tracks[0]?.key).toBe('b');
    expect(second.music?.fade).toEqual({ at: second.music?.startAt, ms: 2000 });
    expect(second.outgoing[0]?.tracks[0]?.key).toBe('a');
    const middle = desiredSound(second, 11050).voices;
    const power = middle.reduce((sum, voice) => sum + voice.fadeGain ** 2, 0);
    expect(power).toBeCloseTo(1, 5);
  });

  it('keeps music playing that the next mood also lists, whatever its order when shuffled', () => {
    const first = moodTransition(EMPTY_TABLE_SOUND, mood({ music: { tracks: ['a', 'b'], shuffle: true, levelDb: 0 } }), SOUNDS, 0);
    const second = moodTransition(first, mood({ music: { tracks: ['b', 'a'], shuffle: true, levelDb: -6 } }), SOUNDS, 9000);
    expect(second.music?.startAt).toBe(first.music?.startAt);
    expect(second.music?.gainDb).toBe(-6);
    expect(second.outgoing).toEqual([]);
  });

  it("leaves the music alone on 'keep' and fades it out on 'none'", () => {
    const first = moodTransition(EMPTY_TABLE_SOUND, mood({ music: { tracks: ['a'], shuffle: false, levelDb: 0 } }), SOUNDS, 0);
    expect(moodTransition(first, mood({ music: 'keep' }), SOUNDS, 9000).music).toBe(first.music);
    const none = moodTransition(first, mood({ music: 'none' }), SOUNDS, 9000);
    expect(none.music).toBeNull();
    expect(none.outgoing).toHaveLength(1);
    expect(desiredSound(none, 15000).voices).toEqual([]);
  });

  it('brings back what is still fading out when pressed back at once, in its place', () => {
    const tavern = mood({ layers: [{ sound: 'rain', levelDb: 0 }], music: { tracks: ['a'], shuffle: false, levelDb: 0 } });
    const first = moodTransition(EMPTY_TABLE_SOUND, tavern, SOUNDS, 0);
    const away = moodTransition(first, mood({ layers: [{ sound: 'fire', levelDb: 0 }], music: { tracks: ['b'], shuffle: false, levelDb: 0 } }), SOUNDS, 9000);
    const back = moodTransition(away, tavern, SOUNDS, 9500);
    expect(back.layers[0]?.startAt).toBe(first.layers[0]?.startAt);
    expect(back.music?.startAt).toBe(first.music?.startAt);
    expect(back.outgoingLayers.map((play) => play.sound.key)).toEqual(['fire']);
    expect(back.outgoing.map((play) => play.tracks[0]?.key)).toEqual(['b']);
  });

  it('starts what is ready and skips what is not, and a press ends a Silence', () => {
    const silenced = toggleSilence(moodTransition(EMPTY_TABLE_SOUND, mood({ layers: [{ sound: 'rain', levelDb: 0 }] }), SOUNDS, 0), 100);
    const state = moodTransition(silenced, mood({ layers: [{ sound: 'rain', levelDb: 0 }, { sound: 'unknown', levelDb: 0 }] }), SOUNDS, 9000);
    expect(state.layers).toHaveLength(1);
    expect(state.silenced).toBe(false);
  });

  it('drops what has finished fading, so the state stays small over a session', () => {
    let state = EMPTY_TABLE_SOUND;
    for (let press = 0; press < 40; press++) {
      state = moodTransition(state, mood({ layers: [{ sound: press % 2 ? 'rain' : 'wind', levelDb: 0 }], music: { tracks: [press % 2 ? 'a' : 'b'], shuffle: false, levelDb: 0 } }), SOUNDS, press * 60000);
    }
    expect(state.outgoing.length).toBeLessThanOrEqual(1);
    expect(state.outgoingLayers.length).toBeLessThanOrEqual(1);
  });
});

describe('live edits', () => {
  const start = moodTransition(EMPTY_TABLE_SOUND, mood({ layers: [{ sound: 'rain', levelDb: 0 }], music: { tracks: ['a', 'b', 'c'], shuffle: false, levelDb: 0 } }), SOUNDS, 0);

  it('refuses the same sound twice and a ninth layer', () => {
    expect(addLayer(start, info('rain'), 0, 1000, 4000)).toBe(start);
    let full = start;
    for (let i = 0; i < 7; i++) full = addLayer(full, info(`l${i}`), 0, 1000, 4000);
    expect(full.layers).toHaveLength(8);
    expect(addLayer(full, info('ninth'), 0, 1000, 4000)).toBe(full);
  });

  it('adds with a fade in and removes with a fade out', () => {
    const added = addLayer(start, info('wind'), -3, 1000, 2000);
    const wind = added.layers.find((play) => play.sound.key === 'wind');
    expect(wind?.fade.at).toBe(wind?.startAt);
    const removed = removeLayer(added, 'wind', 5000, 2000);
    expect(removed.layers.map((play) => play.sound.key)).toEqual(['rain']);
    expect(removed.outgoingLayers[0]?.fade).toEqual({ at: 5000, ms: 2000 });
  });

  it('moves level and mute of what sounds without restarting it', () => {
    const louder = setLayerLevel(start, 'rain', -9, 5000);
    expect(louder.layers[0]?.startAt).toBe(start.layers[0]?.startAt);
    expect(desiredSound(louder, 5001).voices.find((voice) => voice.channel === 'ambience')?.role).toBe('level');
    const muted = setLayerMuted(louder, 'rain', true, 6000);
    expect(desiredSound(muted, 6001).voices.find((voice) => voice.channel === 'ambience')?.gain).toBe(0);
    expect(setLayerMuted(muted, 'rain', false, 7000).layers[0]?.muted).toBeUndefined();
    const musicMuted = setMusicMuted(setMusicLevel(start, -6, 5000), true, 6000);
    expect(desiredSound(musicMuted, 6001).voices.find((voice) => voice.channel === 'music')?.gain).toBe(0);
  });

  it('a fader moved during a fade in is read as a level change and never restarts the voice', () => {
    const moved = setMusicLevel(start, -6, 100);
    expect(moved.music?.startAt).toBe(start.music?.startAt);
    expect(moved.music?.fade.at).not.toBe(moved.music?.startAt);
  });

  it('Silence holds every place, and the second press lands where it would have been', () => {
    const silent = toggleSilence(start, 10000);
    expect(desiredSound(silent, 12000).silence.gain).toBe(0);
    const back = toggleSilence(silent, 300000);
    expect(back.layers[0]?.startAt).toBe(start.layers[0]?.startAt);
    expect(desiredSound(back, 400000).voices[0]?.frame).toBe(desiredSound(start, 400000).voices[0]?.frame);
    expect(desiredSound(back, 400000).silence.gain).toBe(1);
  });

  it('skips to the track the row names as next, whatever the list’s order', () => {
    const shuffled = moodTransition(EMPTY_TABLE_SOUND, mood({ music: { tracks: ['a', 'b', 'c'], shuffle: true, levelDb: 0 } }), SOUNDS, 0);
    for (const state of [start, shuffled]) {
      const next = nextTrack(state, 1000);
      const skipped = skipTrack(state, 1000);
      expect(musicPosition(skipped.music!, 1100)?.track.key).toBe(next?.key);
      expect(skipped.outgoing.length).toBe(1);
    }
  });

  it('plays a track of the list now, and the list goes on from it', () => {
    const played = playTrack(start, 'c', 1000);
    expect(musicPosition(played.music!, 1100)?.track.key).toBe('c');
    expect(musicPosition(played.music!, 1100)?.next?.key).toBe('a');
  });

  it('takes a changed list in at the end of the current track, never cutting it', () => {
    const changed = { ...EMPTY_MIX, table: start, listChange: { tracks: [...(start.music?.tracks ?? []), info('d')], shuffle: false } };
    const early = applyDueListChange(changed, 10000, 1000);
    expect(early).toBe(changed);
    const endsAt = musicPosition(start.music!, 10000)!.endsAt;
    const due = applyDueListChange(changed, endsAt - 500, 1000);
    expect(due.listChange).toBeNull();
    expect(due.table.music?.startAt).toBe(endsAt);
    expect(due.table.outgoing[0]?.fade.at).toBe(endsAt);
    expect(musicPosition(due.table.music!, endsAt + 10)?.track.key).toBe('b');
    expect(due.table.music?.tracks.map((track) => track.key)).toContain('d');
  });

  it('a shuffle switched on waits for the track’s end and does not begin with the track just heard', () => {
    const mix = setShuffle({ ...EMPTY_MIX, table: start }, true);
    expect(mix.table).toBe(start);
    const endsAt = musicPosition(start.music!, 0)!.endsAt;
    const next = withListChange(start, mix.listChange!, endsAt);
    expect(next.music?.shuffle).toBe(true);
    expect(musicPosition(next.music!, endsAt + 10)?.track.key).not.toBe('a');
  });

  it('removing the track that plays moves on at once; the last one ends the music', () => {
    const timing = { now: 1000, leadMs: 50, fadeMs: 4000 };
    const mix = { ...EMPTY_MIX, table: start };
    const gone = removeTrack(mix, 'a', timing, 'a');
    expect(musicPosition(gone.table.music!, 1100)?.track.key).toBe('b');
    expect(gone.listChange).toBeNull();
    const other = removeTrack(mix, 'c', timing, 'a');
    expect(other.table).toBe(start);
    expect(other.listChange?.tracks.map((track) => track.key)).toEqual(['a', 'b']);
  });
});

describe('a mix and what waits for its copy', () => {
  const known = (): boolean => true;

  it('names what has no copy yet, and leaves out what was deleted', () => {
    const ready = new Map([['rain', info('rain')]]);
    const mix = pressMood(EMPTY_MIX, mood({ layers: [{ sound: 'rain', levelDb: 0 }, { sound: 'wind', levelDb: -3 }, { sound: 'gone', levelDb: 0 }], music: { tracks: ['a'], shuffle: true, levelDb: -6 } }), { collectionId: 'c', id: 'm' }, ready, (id) => id !== 'gone', 0, 50);
    expect(mix.table.layers).toHaveLength(1);
    expect(mix.waitingLayers).toEqual([{ sound: 'wind', levelDb: -3 }]);
    expect(mix.waitingMusic).toEqual({ tracks: ['a'], shuffle: true, levelDb: -6 });
  });

  it('a layer joins on its own fade, a first track starts the music', () => {
    const mix = pressMood(EMPTY_MIX, mood({ layers: [{ sound: 'wind', levelDb: -3 }], music: { tracks: ['a'], shuffle: false, levelDb: -6 } }), null, new Map(), known, 0, 50);
    const joined = joinReady(mix, new Map([['wind', info('wind')], ['a', info('a')]]), { now: 30000, leadMs: 50, fadeMs: 4000 });
    expect(joined.waitingLayers).toEqual([]);
    expect(joined.waitingMusic).toBeNull();
    expect(joined.table.layers[0]?.gainDb).toBe(-3);
    expect(joined.table.layers[0]?.startAt).toBe(30050);
    expect(joined.table.music?.gainDb).toBe(-6);
  });

  it('a late track joins the list at the current track’s end', () => {
    const mix = pressMood(EMPTY_MIX, mood({ music: { tracks: ['a', 'b'], shuffle: false, levelDb: 0 } }), null, new Map([['a', info('a')]]), known, 0, 50);
    expect(mix.waitingMusic?.tracks).toEqual(['b']);
    const joined = joinReady(mix, new Map([['a', info('a')], ['b', info('b')]]), { now: 5000, leadMs: 50, fadeMs: 4000 });
    expect(joined.table).toBe(mix.table);
    expect(joined.listChange?.tracks.map((track) => track.key)).toEqual(['a', 'b']);
    expect(joined.waitingMusic).toBeNull();
  });

  it('changes nothing while nothing became ready', () => {
    const mix = pressMood(EMPTY_MIX, mood({ layers: [{ sound: 'wind', levelDb: -3 }] }), null, new Map(), known, 0, 50);
    expect(joinReady(mix, new Map(), { now: 1, leadMs: 50, fadeMs: 1 })).toBe(mix);
  });

  it('saves what is heard, waiting sounds too, and no muted layer', () => {
    const table = setLayerMuted(moodTransition(EMPTY_TABLE_SOUND, mood({ layers: [{ sound: 'rain', levelDb: -3 }, { sound: 'wind', levelDb: -9 }], music: { tracks: ['a'], shuffle: false, levelDb: -6 } }), SOUNDS, 0), 'wind', true, 100);
    const mix = { ...EMPTY_MIX, table, waitingLayers: [{ sound: 'fire', levelDb: -1 }] };
    expect(mixAsMood(mix, (key) => key, 5, 1000)).toEqual({
      fadeSeconds: 5,
      music: { tracks: ['a'], shuffle: false, levelDb: -6 },
      layers: [{ sound: 'rain', levelDb: -3 }, { sound: 'fire', levelDb: -1 }],
    });
    expect(mixAsMood({ ...EMPTY_MIX }, (key) => key, 5, 1000).music).toBe('none');
  });
});

describe('a long mix does not repeat', () => {
  it('layers of different lengths drift apart: no two stand at the same place again for a long time', () => {
    const state = moodTransition(EMPTY_TABLE_SOUND, mood({ layers: [{ sound: 'x', levelDb: 0 }, { sound: 'y', levelDb: 0 }] }), new Map([['x', info('x', 61)], ['y', info('y', 97)]]), 0);
    const places = (at: number): string => desiredSound(state, at).voices.map((voice) => voice.frame).join();
    const seen = new Set<string>();
    for (let second = 1; second < 3600; second += 7) seen.add(places(second * 1000));
    expect(seen.size).toBe(Math.ceil(3599 / 7));
  });
});
