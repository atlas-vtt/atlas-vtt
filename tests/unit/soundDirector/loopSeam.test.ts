import { describe, expect, it } from 'vitest';
import { parseSoundState } from '@/app/online/protocol/sound.ts';
import { wireState } from '@/app/online/gm/sound/soundWire.ts';
import type { SoundInfo } from '@/app/sound/soundTypes';
import { addLayer, startMusic } from '@/app/soundDirector/liveEdits';
import { applyDueLoopSeams } from '@/app/soundDirector/loopSeam';
import { musicPosition, seekMusic } from '@/app/soundDirector/musicList';
import { EMPTY_MIX, type SoundMix } from '@/app/soundDirector/soundMix';
import { EMPTY_TABLE_SOUND, TRACK_JOIN_MS } from '@/app/soundDirector/tableSound';

const RATE = 48_000;
const AHEAD_MS = 1000;
const CROSSFADE_MS = 4000;
/** 60 s, going round between 0:10 and 0:40. */
const LOOPED: SoundInfo = { key: 'a', frames: 60 * RATE, gainDb: 0, loop: { startFrame: 10 * RATE, endFrame: 40 * RATE } };

const music = (tracks: SoundInfo[]): SoundMix => ({ ...EMPTY_MIX, table: startMusic(EMPTY_TABLE_SOUND, tracks, false, 0, 7, 0, 0, 0) });

function pulse(mix: SoundMix, from: number, until: number, crossfadeMs = CROSSFADE_MS): SoundMix {
  let held = mix;
  for (let now = from; now <= until; now += 250) held = applyDueLoopSeams(held, now, AHEAD_MS, { leadMs: 0, crossfadeMs });
  return held;
}

describe('loop seams', () => {
  it('play from the start to the loop out, then hand over to the loop in over the crossfade', () => {
    expect(pulse(music([LOOPED]), 0, 34_000).table.music?.startAt).toBe(0);
    const { table } = pulse(music([LOOPED]), 0, 35_500);
    expect(table.music).toMatchObject({ startAt: 36_000, fromFrame: 10 * RATE, fade: { at: 36_000, ms: CROSSFADE_MS } });
    expect(table.outgoing).toHaveLength(1);
    expect(table.outgoing[0]).toMatchObject({ startAt: 0, fade: { at: 36_000, ms: CROSSFADE_MS } });
    // Once it has begun, the new play stands a second into the loop a second on.
    expect(musicPosition(table.music!, 37_000)?.frame).toBe(11 * RATE);
  });

  it('go round every loop length less the fade, and drop what has faded out', () => {
    const { table } = pulse(music([LOOPED]), 0, 62_000);
    // The second seam: 26 s after the first (30 s of loop, of which 4 s overlap).
    expect(table.music?.startAt).toBe(62_000);
    expect(table.outgoing.map((play) => play.fade.at)).toEqual([62_000]);
  });

  it('crossfade no longer than half the loop, nor shorter than a join', () => {
    const short: SoundInfo = { ...LOOPED, loop: { startFrame: 10 * RATE, endFrame: 12 * RATE } };
    expect(pulse(music([short]), 0, 12_000).table.music?.fade.ms).toBe(1000);
    expect(pulse(music([LOOPED]), 0, 39_900, 0).table.music?.fade.ms).toBe(TRACK_JOIN_MS);
  });

  it('leave a sound without loop points and a list of several tracks alone', () => {
    const whole: SoundInfo = { key: 'b', frames: 60 * RATE, gainDb: 0 };
    expect(pulse(music([whole]), 0, 70_000).table.outgoing).toEqual([]);
    expect(pulse(music([LOOPED, whole]), 0, 70_000).table.outgoing).toEqual([]);
  });

  it('crossfade a track that goes round whole into its own start, where it has a crossfade of its own', () => {
    const whole: SoundInfo = { key: 'b', frames: 60 * RATE, gainDb: 0, crossfadeMs: 6000 };
    const { table } = pulse(music([whole]), 0, 54_000);
    expect(table.music).toMatchObject({ startAt: 54_000, fromFrame: 0, fade: { at: 54_000, ms: 6000 } });
    expect(table.outgoing[0]?.fade).toEqual({ at: 54_000, ms: 6000 });
    expect(musicPosition(table.music!, 55_000)?.frame).toBe(RATE);
    expect(pulse(music([{ ...whole, crossfadeMs: 0 }]), 0, 70_000).table.outgoing).toEqual([]);
    expect(pulse(music([{ ...whole, growing: true }]), 0, 70_000).table.outgoing).toEqual([]);
  });

  it('wait for a change of the list or a stop after the track, which take over at its end', () => {
    const mix = music([LOOPED]);
    expect(pulse({ ...mix, stopAfter: 'a' }, 0, 39_000).table.outgoing).toEqual([]);
  });

  it('hand layers over too', () => {
    const table = addLayer(EMPTY_TABLE_SOUND, LOOPED, 0, 0, 0, 0);
    const after = pulse({ ...EMPTY_MIX, table }, 0, 36_000).table;
    expect(after.layers[0]).toMatchObject({ startAt: 36_000, fromFrame: 10 * RATE });
    expect(after.outgoingLayers[0]?.fade).toEqual({ at: 36_000, ms: CROSSFADE_MS });
  });

  it('reach players with where the new play begins', () => {
    const { table } = pulse(music([LOOPED]), 0, 36_000);
    const parsed = parseSoundState(JSON.parse(JSON.stringify(wireState(table, (key) => ({ key: `${key}${'0'.repeat(64)}`.slice(0, 64) })))));
    expect(parsed?.music?.fromFrame).toBe(10 * RATE);
  });

  it('tell players where a track that starts at its loop in begins, as they never hear of the choice', () => {
    const atLoopIn: SoundInfo = { ...LOOPED, startAtLoopIn: true };
    const wire = (table: typeof EMPTY_TABLE_SOUND): ReturnType<typeof parseSoundState> => parseSoundState(JSON.parse(JSON.stringify(wireState(table, (key) => ({ key: `${key}${'0'.repeat(64)}`.slice(0, 64) })))));
    expect(wire(music([atLoopIn]).table)?.music?.fromFrame).toBe(10 * RATE);
    expect(wire(addLayer(EMPTY_TABLE_SOUND, atLoopIn, 0, 0, 0, 0))?.layers[0]?.fromFrame).toBe(10 * RATE);
    expect(wire(music([LOOPED]).table)?.music?.fromFrame).toBeUndefined();
  });

  it('let a seek reach before the loop in', () => {
    const { table } = pulse(music([LOOPED]), 0, 36_000);
    const sought = seekMusic(table, 2 * RATE, 40_000);
    expect(sought.music?.fromFrame).toBe(0);
    expect(musicPosition(sought.music!, 40_000)?.frame).toBe(2 * RATE);
  });
});
