import { beforeAll, describe, expect, it } from 'vitest';
import type { Mood } from '@/app/sound/soundTypes';
import { toggleSilence } from '@/app/soundDirector/liveEdits';
import { moodTransition } from '@/app/soundDirector/moodTransition';
import { EMPTY_TABLE_SOUND } from '@/app/soundDirector/tableSound';
import { loadFixtures, render, rmsAt, secondsToFrames, sineAt, type Fixtures } from './soundHarness';

const WINDOW = 4800;

function mood(partial: Partial<Mood>): Mood {
  return { id: 'm', name: 'm', order: 1, fadeSeconds: 2, music: 'keep', layers: [], ...partial };
}

function amplitude(samples: Float32Array, seconds: number, frequency: number): number {
  return sineAt(samples, secondsToFrames(seconds), WINDOW, frequency).amplitude;
}

/**
 * What a press of a mood sounds like: the director's own states rendered by the real graph, on an
 * offline context, so nothing here is a model of the sound.
 */
describe('a mood press, rendered', () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    fixtures = await loadFixtures();
  });

  const sounds = (): ReadonlyMap<string, Fixtures['tone220']> => new Map([['low', fixtures.tone220], ['high', fixtures.tone330]]);

  it('never dips a layer both moods share, while what is new comes in beside it', async () => {
    const first = moodTransition(EMPTY_TABLE_SOUND, mood({ layers: [{ sound: 'low', levelDb: 0 }], fadeSeconds: 0.2 }), sounds(), 0);
    const second = moodTransition(first, mood({ layers: [{ sound: 'low', levelDb: 0 }, { sound: 'high', levelDb: 0 }] }), sounds(), 2000);
    const samples = await render(first, fixtures, { seconds: 7, at: [[2, (player) => player.setState(second)]] });
    const before = amplitude(samples, 1.8, 220);
    expect(before).toBeGreaterThan(0.05);
    for (const at of [2.1, 2.5, 3, 3.5, 4, 5, 6]) {
      const db = 20 * Math.log10(amplitude(samples, at, 220) / before);
      expect(Math.abs(db), `at ${at} s`).toBeLessThan(1);
    }
    expect(amplitude(samples, 1.8, 330)).toBeLessThan(before / 20);
    expect(amplitude(samples, 5, 330)).toBeGreaterThan(before / 2);
  });

  it('crossfades music over the mood’s fade without a hole', async () => {
    const first = moodTransition(EMPTY_TABLE_SOUND, mood({ music: { tracks: ['low'], shuffle: false, levelDb: 0 }, fadeSeconds: 0.2 }), sounds(), 0);
    const second = moodTransition(first, mood({ music: { tracks: ['high'], shuffle: false, levelDb: 0 }, fadeSeconds: 2 }), sounds(), 2000);
    const samples = await render(first, fixtures, { seconds: 6, at: [[2, (player) => player.setState(second)]] });
    const whole = rmsAt(samples, secondsToFrames(1.5), WINDOW);
    for (const at of [2.2, 2.6, 3, 3.4, 3.8, 4.5, 5.5]) {
      const db = 20 * Math.log10(rmsAt(samples, secondsToFrames(at), WINDOW) / whole);
      expect(Math.abs(db), `at ${at} s`).toBeLessThan(1.5);
    }
    expect(amplitude(samples, 5, 220)).toBeLessThan(0.01);
    expect(amplitude(samples, 1.5, 330)).toBeLessThan(0.01);
  });

  it('comes back from Silence where it would have been', async () => {
    const state = moodTransition(EMPTY_TABLE_SOUND, mood({ layers: [{ sound: 'low', levelDb: 0 }], fadeSeconds: 0.2 }), sounds(), 0);
    const silent = toggleSilence(state, 1000);
    const back = toggleSilence(silent, 3500);
    const steady = await render(state, fixtures, { seconds: 6.5 });
    const samples = await render(state, fixtures, {
      seconds: 6.5,
      at: [[1, (player) => player.setState(silent)], [3.5, (player) => player.setState(back)]],
    });
    expect(amplitude(samples, 3.2, 220)).toBeLessThan(0.002);
    const here = sineAt(samples, secondsToFrames(5.6), WINDOW, 220);
    const there = sineAt(steady, secondsToFrames(5.6), WINDOW, 220);
    expect(Math.abs(here.amplitude - there.amplitude)).toBeLessThan(0.01);
    const phase = Math.abs(here.phase - there.phase) % (2 * Math.PI);
    expect(Math.min(phase, 2 * Math.PI - phase)).toBeLessThan(0.1);
  });
});
