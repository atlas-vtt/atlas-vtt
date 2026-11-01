import { describe, expect, it } from 'vitest';
import type { LayerPlay, MusicPlay, SoundInfo, TableSound } from '@/app/sound/soundTypes';
import { desiredSound, layerVoiceId, musicVoiceId, type DesiredVoice } from '@/app/sound/engine/desiredSound';
import { dbToGain, SOUND_RATE } from '@/app/sound/engine/soundMath';
import { listOrder, musicSpanAt } from '@/app/sound/engine/soundTimeline';

const SECOND = 1000;
const HOUR = 3600 * SECOND;

function sound(key: string, seconds: number, extra: Partial<SoundInfo> = {}): SoundInfo {
  return { key, frames: seconds * SOUND_RATE, gainDb: 0, ...extra };
}

function layer(info: SoundInfo, extra: Partial<LayerPlay> = {}): LayerPlay {
  return { sound: info, startAt: 0, gainDb: 0, fade: { at: 0, ms: 0 }, ...extra };
}

function music(tracks: SoundInfo[], extra: Partial<MusicPlay> = {}): MusicPlay {
  return { tracks, seed: 7, shuffle: false, startAt: 0, gainDb: 0, fade: { at: 0, ms: 0 }, ...extra };
}

function table(extra: Partial<TableSound> = {}): TableSound {
  return { revision: 1, silenced: false, silenceFade: { at: 0, ms: 0 }, music: null, outgoing: [], layers: [], outgoingLayers: [], ...extra };
}

function only(state: TableSound, at: number): DesiredVoice {
  const voice = desiredSound(state, at).voices[0];
  if (!voice) throw new Error('no voice');
  return voice;
}

describe('where a layer stands', () => {
  it('goes round the whole sound where it names no loop', () => {
    const state = table({ layers: [layer(sound('rain', 10))] });
    expect(only(state, 4 * SECOND).frame).toBe(4 * SOUND_RATE);
    expect(only(state, 14 * SECOND).frame).toBe(4 * SOUND_RATE);
    expect(only(state, 10 * SECOND).frame).toBe(0);
  });

  it('plays the part before the loop once, then goes round the loop', () => {
    const loop = { startFrame: 2 * SOUND_RATE, endFrame: 6 * SOUND_RATE };
    const state = table({ layers: [layer(sound('wind', 10, { loop }))] });
    expect(only(state, SECOND).frame).toBe(SOUND_RATE);
    expect(only(state, 5 * SECOND).frame).toBe(5 * SOUND_RATE);
    expect(only(state, 6 * SECOND).frame).toBe(2 * SOUND_RATE);
    expect(only(state, 9 * SECOND).frame).toBe(5 * SOUND_RATE);
    expect(only(state, 10 * SECOND).frame).toBe(2 * SOUND_RATE);
  });

  it('ignores a loop that cannot be played', () => {
    const state = table({ layers: [layer(sound('bad', 10, { loop: { startFrame: 500, endFrame: 400 } }))] });
    expect(only(state, 12 * SECOND).frame).toBe(2 * SOUND_RATE);
  });

  it('stands at frame 0 and says when it begins, before it begins', () => {
    const state = table({ layers: [layer(sound('rain', 10), { startAt: 5 * SECOND, fade: { at: 5 * SECOND, ms: SECOND } })] });
    const voice = only(state, 4 * SECOND);
    expect(voice.frame).toBe(0);
    expect(voice.startsInMs).toBe(SECOND);
    expect(voice.gain).toBe(0);
  });

  it('holds exact whole-sample positions over three hours', () => {
    const lengths = [11.37, 7.013, 61.5];
    const states = lengths.map((seconds) => {
      const frames = Math.round(seconds * SOUND_RATE);
      return { frames, state: table({ layers: [layer({ key: 'x', frames, gainDb: 0 })] }) };
    });
    for (let at = 0; at <= 3 * HOUR; at += 137_111) {
      for (const { frames, state } of states) {
        const expected = Math.floor((at * SOUND_RATE) / SECOND) % frames;
        expect(only(state, at).frame).toBe(expected);
      }
    }
  });
});

describe('a music list', () => {
  const tracks = [sound('a', 100), sound('b', 50), sound('c', 200)];

  it('goes through the tracks in order, and starts over', () => {
    const state = table({ music: music(tracks) });
    const at = (ms: number): [string, number] => {
      const voice = only(state, ms);
      return [voice.span.sound.key, voice.frame];
    };
    expect(at(10 * SECOND)).toEqual(['a', 10 * SOUND_RATE]);
    expect(at(120 * SECOND)).toEqual(['b', 20 * SOUND_RATE]);
    expect(at(160 * SECOND)).toEqual(['c', 10 * SOUND_RATE]);
    expect(at(351 * SECOND)).toEqual(['a', SOUND_RATE]);
  });

  it('holds one track as a loop, with its loop frames', () => {
    const loop = { startFrame: SOUND_RATE, endFrame: 3 * SOUND_RATE };
    const state = table({ music: music([sound('one', 5, { loop })]) });
    expect(only(state, 3.5 * SECOND).frame).toBe(1.5 * SOUND_RATE);
    expect(only(state, 3 * HOUR).span.endPlayFrame).toBeNull();
  });

  it('gives every client the same shuffle, and another order per seed and pass', () => {
    const many = Array.from({ length: 12 }, (_, index) => sound(`t${index}`, 10));
    const order = (seed: number, pass: number): number[] => listOrder(many.length, seed, true, pass);
    expect(order(5, 0)).toEqual(order(5, 0));
    expect(order(5, 0)).not.toEqual(order(6, 0));
    expect(order(5, 0)).not.toEqual(order(5, 1));
    expect([...order(5, 3)].sort((a, b) => a - b)).toEqual(many.map((_, index) => index));
  });

  it('never plays a track twice in a row where passes meet', () => {
    for (const count of [2, 3, 4, 9]) {
      for (let seed = 0; seed < 50; seed++) {
        for (let pass = 1; pass < 60; pass++) {
          expect(listOrder(count, seed, true, pass)[0]).not.toBe(listOrder(count, seed, true, pass - 1)[count - 1]);
        }
      }
    }
  });

  it('keeps the positions in a shuffled list whole across three hours', () => {
    const play = music([sound('a', 91), sound('b', 123), sound('c', 77), sound('d', 201)], { shuffle: true, seed: 99 });
    let frame = 0;
    const end = 3 * 3600 * SOUND_RATE;
    let last = '';
    while (frame < end) {
      const span = musicSpanAt(play, frame);
      if (!span || span.endPlayFrame === null) throw new Error('no span');
      expect(span.startPlayFrame).toBe(frame);
      expect(span.sound.key).not.toBe(last);
      last = span.sound.key;
      frame = span.endPlayFrame;
    }
  });

  it('is not moved by when it is asked: late join and steady play agree', () => {
    const play = music([sound('a', 91), sound('b', 123), sound('c', 77)], { shuffle: true, startAt: 5000 });
    const state = table({ music: play });
    for (let at = 5000; at < 2 * HOUR; at += 987_654) {
      const first = only(state, at);
      expect(only(state, at)).toEqual(first);
      expect(first.frame).toBeLessThan(first.span.sound.frames);
    }
  });
});

describe('fades', () => {
  it('brings a play in with equal power and at its level', () => {
    const state = table({ layers: [layer(sound('rain', 10), { gainDb: -6, startAt: 1000, fade: { at: 1000, ms: 2000 } })] });
    const halfway = only(state, 2000);
    expect(halfway.role).toBe('in');
    expect(halfway.fadeGain).toBeCloseTo(Math.SQRT1_2, 6);
    expect(halfway.gain).toBeCloseTo(dbToGain(-6) * Math.SQRT1_2, 6);
    expect(only(state, 3000).gain).toBeCloseTo(dbToGain(-6), 6);
  });

  it('holds the same power through a crossfade', () => {
    const coming = music([sound('new', 100)], { startAt: 10_000, fade: { at: 10_000, ms: 4000 } });
    const going = music([sound('old', 100)], { fade: { at: 10_000, ms: 4000 } });
    const state = table({ music: coming, outgoing: [going] });
    for (const at of [10_000, 10_500, 12_000, 13_500]) {
      const [a, b] = desiredSound(state, at).voices;
      expect((a?.gain ?? 0) ** 2 + (b?.gain ?? 0) ** 2).toBeCloseTo(1, 6);
    }
  });

  it('drops a leaving play once its fade is over', () => {
    const state = table({ outgoingLayers: [layer(sound('old', 5), { fade: { at: 1000, ms: 1000 } })] });
    expect(desiredSound(state, 1500).voices).toHaveLength(1);
    expect(desiredSound(state, 2000).voices).toHaveLength(0);
  });

  it('takes a level change for a level change, not an entrance', () => {
    const shared = layer(sound('rain', 10), { startAt: 0, gainDb: -3, fade: { at: 60_000, ms: 4000 } });
    const voice = only(table({ layers: [shared] }), 61_000);
    expect(voice.role).toBe('level');
    expect(voice.gain).toBeCloseTo(dbToGain(-3), 6);
  });

  it('applies the sound\'s own gain and mute', () => {
    const state = table({ layers: [layer(sound('rain', 10, { gainDb: -6 }), { gainDb: 6 })] });
    expect(only(state, 100).gain).toBeCloseTo(1, 6);
    const muted = table({ layers: [layer(sound('rain', 10), { muted: true })] });
    expect(only(muted, 100).gain).toBe(0);
    expect(only(muted, 100).frame).toBe(4800);
  });

  it('gives the same voice the same id through a change of state', () => {
    const play = layer(sound('rain', 10), { startAt: 500 });
    expect(only(table({ layers: [play] }), 800).id).toBe(layerVoiceId(play));
    expect(only(table({ outgoingLayers: [{ ...play, fade: { at: 1000, ms: 500 } }] }), 800).id).toBe(layerVoiceId(play));
    const list = music([sound('a', 9)], { startAt: 3 });
    expect(only(table({ music: list }), 800).id).toBe(musicVoiceId(list));
  });

  it('lists a layer once, even in both the old and the new list', () => {
    const play = layer(sound('rain', 10));
    expect(desiredSound(table({ layers: [play], outgoingLayers: [{ ...play, fade: { at: 1, ms: 1000 } }] }), 500).voices).toHaveLength(1);
  });
});

describe('a state that makes no sense', () => {
  it('is silence or a bounded gain, never a value a param throws on', () => {
    expect(dbToGain(Number.NaN)).toBe(0);
    expect(dbToGain(-Infinity)).toBe(0);
    expect(dbToGain(Infinity)).toBe(100);
    expect(dbToGain(1000)).toBe(100);
  });
});

describe('silence', () => {
  it('fades everything and lands where it would have been', () => {
    const play = layer(sound('rain', 10));
    const going = table({ layers: [play], silenced: true, silenceFade: { at: 1000, ms: 1000 } });
    expect(desiredSound(going, 1500).silence.gain).toBeCloseTo(Math.SQRT1_2, 6);
    expect(only(going, 1500).gain).toBeCloseTo(Math.SQRT1_2, 6);
    const silent = desiredSound(going, 5000);
    expect(silent.silence.gain).toBeCloseTo(0, 9);
    expect(only(going, 5000).frame).toBe(5 * SOUND_RATE);
    const back = table({ layers: [play], silenced: false, silenceFade: { at: 11_000, ms: 1000 } });
    expect(only(back, 12_000).frame).toBe(2 * SOUND_RATE);
    expect(desiredSound(back, 10_000).silence.gain).toBe(0);
    expect(desiredSound(back, 12_000).silence.gain).toBeCloseTo(1, 9);
  });

  it('is open in a state that never was silenced', () => {
    expect(desiredSound(table(), 0).silence.gain).toBe(1);
    expect(desiredSound(table(), 123_456).silence.gain).toBe(1);
  });
});
