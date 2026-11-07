import { beforeAll, describe, expect, it } from 'vitest';
import type { TableSound } from '@/app/sound/soundTypes';
import { EMPTY_MIX } from '@/app/soundDirector/soundMix';
import { applyDueListChange } from '@/app/soundDirector/trackEnd';
import { withListChange } from '@/app/soundDirector/musicList';
import { largestStep, layerOf, loadFixtures, longestSilence, memoryBytes, musicOf, render, rmsAt, secondsToFrames, sineAt, tableOf, type Fixtures } from './soundHarness';

const NORMAL_STEP = 0.25 * Math.sin((2 * Math.PI * 220) / 48000);
const MUTE = { musicDb: -Infinity, ambienceDb: 0, masterDb: 0 };

function dbBetween(a: number, b: number): number {
  return Math.abs(20 * Math.log10(a / b));
}

/** The phase difference in radians, wrapped to the shorter way round. */
function phaseGap(a: number, b: number): number {
  const gap = Math.abs(a - b) % (2 * Math.PI);
  return gap > Math.PI ? 2 * Math.PI - gap : gap;
}

function framesOfPhase(radians: number, frequency = 220): number {
  return (radians / (2 * Math.PI * frequency)) * 48000;
}

describe('going from one mood to another', () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    fixtures = await loadFixtures();
  });

  function moods(): { first: TableSound; second: TableSound } {
    const shared = layerOf(fixtures.tone220);
    const first = tableOf({ music: musicOf([fixtures.tone330]), layers: [shared] });
    const second = tableOf({
      revision: 2,
      music: musicOf([fixtures.long], { startAt: 3000, fade: { at: 3000, ms: 2000 } }),
      outgoing: [musicOf([fixtures.tone330], { fade: { at: 3000, ms: 2000 } })],
      layers: [shared],
    });
    return { first, second };
  }

  it('never dips a layer both moods share, nor touches its waveform', async () => {
    const { first, second } = moods();
    // Music off: what remains is the shared layer alone.
    const samples = await render(first, fixtures, {
      seconds: 8,
      options: { levels: MUTE },
      at: [[3, (player): void => player.setState(second)]],
    });
    const level = rmsAt(samples, secondsToFrames(1), secondsToFrames(1));
    let worst = 0;
    for (let at = 1; at < 7.5; at += 0.05) worst = Math.max(worst, dbBetween(rmsAt(samples, secondsToFrames(at), 2400), level));
    const step = largestStep(samples, secondsToFrames(0.5), samples.length);
    console.log(`shared layer through a crossfade: worst change ${worst.toFixed(3)} dB, largest step ${(step / NORMAL_STEP).toFixed(2)} x normal`);
    expect(worst).toBeLessThan(0.1);
    expect(step).toBeLessThanOrEqual(2 * NORMAL_STEP);
  });

  it('crossfades with no silence and no bulge in power', async () => {
    const { first, second } = moods();
    const samples = await render({ ...first, layers: [] }, fixtures, {
      seconds: 8,
      at: [[3, (player): void => player.setState({ ...second, layers: [] })]],
    });
    const before = rmsAt(samples, secondsToFrames(2), secondsToFrames(0.5));
    let lowest = Infinity;
    let highest = 0;
    for (let at = 2.5; at < 7.5; at += 0.05) {
      const level = rmsAt(samples, secondsToFrames(at), 2400);
      lowest = Math.min(lowest, level);
      highest = Math.max(highest, level);
    }
    const silence = longestSilence(samples, secondsToFrames(0.5), samples.length);
    console.log(`crossfade: level ${(20 * Math.log10(lowest / before)).toFixed(2)} to ${(20 * Math.log10(highest / before)).toFixed(2)} dB around before, silence ${silence} frames`);
    expect(silence).toBeLessThanOrEqual(1);
    expect(20 * Math.log10(lowest / before)).toBeGreaterThan(-1.5);
    expect(20 * Math.log10(highest / before)).toBeLessThan(1.5);
  });

  it('starts the fade when the state says, not before', async () => {
    const { first, second } = moods();
    const samples = await render({ ...first, layers: [] }, fixtures, {
      seconds: 6,
      at: [[3, (player): void => player.setState({ ...second, layers: [] })]],
    });
    expect(sineAt(samples, secondsToFrames(2.4), 24_000, 220).amplitude).toBeLessThan(0.002);
    expect(sineAt(samples, secondsToFrames(5), secondsToFrames(0.5), 220).amplitude).toBeGreaterThan(0.2);
  });

  it('turns back from a fade that is interrupted, without a jump', async () => {
    const play = layerOf(fixtures.tone220);
    const leaving = tableOf({ outgoingLayers: [{ ...play, fade: { at: 2000, ms: 4000 } }] });
    const back = tableOf({ layers: [{ ...play, fade: { at: 3000, ms: 1000 } }] });
    const samples = await render(tableOf({ layers: [play] }), fixtures, {
      seconds: 7,
      at: [[2, (player): void => player.setState(leaving)], [3, (player): void => player.setState(back)]],
    });
    const step = largestStep(samples, secondsToFrames(1), samples.length);
    const end = sineAt(samples, secondsToFrames(6), secondsToFrames(0.5), 220).amplitude;
    console.log(`interrupted fade: largest step ${(step / NORMAL_STEP).toFixed(2)} x normal, back at ${end.toFixed(3)}`);
    expect(step).toBeLessThanOrEqual(2 * NORMAL_STEP);
    expect(end).toBeGreaterThan(0.2);
  });

  it('goes on to the next track with no gap', async () => {
    // Two keys of one tone, whole cycles: a join that loses or repeats a frame would show as a step.
    const second = { ...fixtures.tone220, key: 'tone220b' };
    const files = new Map(fixtures.files);
    files.set('tone220b', fixtures.files.get('tone220') ?? new Uint8Array());
    const samples = await render(tableOf({ music: musicOf([fixtures.tone220, second]) }), { ...fixtures, files }, { seconds: 7 });
    const silence = longestSilence(samples, secondsToFrames(0.5), samples.length);
    const step = largestStep(samples, secondsToFrames(0.5), samples.length);
    console.log(`next track: silence ${silence} frames, largest step ${(step / NORMAL_STEP).toFixed(2)} x normal`);
    expect(silence).toBeLessThanOrEqual(1);
    expect(step).toBeLessThanOrEqual(2 * NORMAL_STEP);
  });
});

describe('a clock that moved', () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    fixtures = await loadFixtures();
  });

  it.each([
    ['a loop', 'tone220', 0.301],
    ['windows, which holds what it has already scheduled', 'long', 0.301],
    ['anything, far off', 'tone220', 5.001],
  ] as const)('corrects %s without a click', async (_name, key, seconds) => {
    let shift = 0;
    const samples = await render(tableOf({ layers: [layerOf(key === 'long' ? fixtures.long : fixtures.tone220)] }), fixtures, {
      seconds: 30,
      tableShift: () => shift,
      at: [[2, (): void => {
        shift = seconds * 1000;
      }]],
    });
    const step = largestStep(samples, secondsToFrames(0.5), samples.length);
    const silence = longestSilence(samples, secondsToFrames(0.5), samples.length);
    const before = sineAt(samples, secondsToFrames(1), secondsToFrames(1), 220);
    const after = sineAt(samples, secondsToFrames(28.5), secondsToFrames(1), 220);
    const moved = framesOfPhase(phaseGap(before.phase, after.phase));
    // The sine's phase moves by the shift modulo its cycle.
    const wanted = framesOfPhase(phaseGap(0, (2 * Math.PI * 220 * seconds) % (2 * Math.PI)));
    console.log(`clock moved ${seconds} s, ${key}: largest step ${(step / NORMAL_STEP).toFixed(2)} x normal, silence ${silence} frames, phase moved ${moved.toFixed(1)} frames of ${wanted.toFixed(1)}`);
    expect(silence).toBeLessThanOrEqual(1);
    expect(step).toBeLessThanOrEqual(2 * NORMAL_STEP);
    expect(Math.abs(moved - wanted)).toBeLessThan(2);
  });
});

describe('the listener\'s own levels', () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    fixtures = await loadFixtures();
  });

  it('moves a channel, at once and with no click, and leaves the other', async () => {
    const samples = await render(tableOf({ music: musicOf([fixtures.tone330]), layers: [layerOf(fixtures.tone220)] }), fixtures, {
      seconds: 6,
      at: [[3, (player): void => player.setLocalLevels({ musicDb: -Infinity, ambienceDb: -6, masterDb: 0 })]],
    });
    const before = sineAt(samples, secondsToFrames(1), secondsToFrames(1), 220).amplitude;
    const after = sineAt(samples, secondsToFrames(4), secondsToFrames(1), 220).amplitude;
    console.log(`local levels: ambience ${(20 * Math.log10(after / before)).toFixed(2)} dB for -6 dB, music left ${sineAt(samples, secondsToFrames(4), secondsToFrames(1), 330).amplitude.toFixed(5)}`);
    expect(20 * Math.log10(after / before)).toBeCloseTo(-6, 0);
    expect(sineAt(samples, secondsToFrames(4), secondsToFrames(1), 330).amplitude).toBeLessThan(0.001);
  });
});

describe('Silence', () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    fixtures = await loadFixtures();
  });

  it.each(['short', 'long'] as const)('fades a %s sound and lands where it would have been', async (which) => {
    const sound = which === 'short' ? fixtures.tone220 : fixtures.long;
    const play = layerOf(sound);
    const silent = tableOf({ layers: [play], silenced: true, silenceFade: { at: 2000, ms: 500 } });
    const back = tableOf({ layers: [play], silenced: false, silenceFade: { at: 6000, ms: 500 } });
    const samples = await render(tableOf({ layers: [play] }), fixtures, {
      seconds: 9,
      at: [[2, (player): void => player.setState(silent)], [6, (player): void => player.setState(back)]],
    });
    const before = sineAt(samples, secondsToFrames(1), secondsToFrames(0.5), 220);
    const after = sineAt(samples, secondsToFrames(7.5), secondsToFrames(0.5), 220);
    const gap = phaseGap(before.phase, after.phase);
    const quiet = rmsAt(samples, secondsToFrames(3), secondsToFrames(2.5));
    console.log(`Silence, ${which}: position off by ${framesOfPhase(gap).toFixed(1)} frames, amplitude ${before.amplitude.toFixed(3)} then ${after.amplitude.toFixed(3)}, during ${quiet.toExponential(1)}`);
    expect(quiet).toBeLessThan(1e-4);
    expect(framesOfPhase(gap)).toBeLessThan(1);
    expect(dbBetween(after.amplitude, before.amplitude)).toBeLessThan(0.2);
  });
});

describe('sound that is late', () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    fixtures = await loadFixtures();
  });

  it('joins at the right place, and holds nobody else up', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const bytes = fixtures.files.get('tone330');
    if (!bytes) throw new Error('missing');
    const resolve = (key: string): ReturnType<typeof memoryBytes> | Promise<ReturnType<typeof memoryBytes>> => {
      const file = fixtures.files.get(key);
      if (!file) throw new Error('no file');
      return key === 'tone330' ? held.then(() => memoryBytes(file)) : memoryBytes(file);
    };
    const state = tableOf({ layers: [layerOf(fixtures.tone220), layerOf(fixtures.tone330)] });
    const samples = await renderReleasing(state, fixtures, resolve, 2, release, 6);
    expect(sineAt(samples, secondsToFrames(1), secondsToFrames(0.5), 220).amplitude).toBeGreaterThan(0.2);
    expect(sineAt(samples, secondsToFrames(1), secondsToFrames(0.5), 330).amplitude).toBeLessThan(0.002);
    const joined = sineAt(samples, secondsToFrames(4), secondsToFrames(0.5), 330);
    expect(joined.amplitude).toBeGreaterThan(0.2);
    // Its sine, had it played from 0 with the first, has the phase of whole cycles of the loop: it starts at 0.
    const reference = await render(tableOf({ layers: [layerOf(fixtures.tone330)] }), fixtures, { seconds: 6 });
    const gap = phaseGap(joined.phase, sineAt(reference, secondsToFrames(4), secondsToFrames(0.5), 330).phase);
    console.log(`late bytes: joined ${framesOfPhase(gap, 330).toFixed(1)} frames from where a client on time stands`);
    expect(framesOfPhase(gap, 330)).toBeLessThan(1);
  });

  it('never makes the first thing play late for a join of its own', async () => {
    const samples = await render(tableOf({ layers: [layerOf(fixtures.tone220, { startAt: -1000 })] }), fixtures, { seconds: 2 });
    expect(sineAt(samples, secondsToFrames(0.1), secondsToFrames(0.4), 220).amplitude).toBeGreaterThan(0.2);
  });
});

async function renderReleasing(
  state: TableSound,
  fixtures: Fixtures,
  resolve: (key: string) => ReturnType<typeof memoryBytes> | Promise<ReturnType<typeof memoryBytes>>,
  releaseAt: number,
  release: () => void,
  seconds: number,
): Promise<Float32Array> {
  return render(state, fixtures, {
    seconds,
    options: { resolve },
    settle: false,
    at: [[releaseAt, (): void => release()]],
  });
}

describe('a list going on from track to track', () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    fixtures = await loadFixtures();
  });

  it('crossfades between tracks with no silence and no bulge, and what comes begins from its start', async () => {
    const first = tableOf({ music: musicOf([fixtures.tone330, fixtures.tone220]) });
    const second = applyDueListChange({ ...EMPTY_MIX, table: first }, 1500, 1000, { leadMs: 0, crossfadeMs: 1000 }).table;
    expect(second.music?.startAt).toBe(2000);
    const samples = await render(first, fixtures, { seconds: 4.5, at: [[1.5, (player): void => player.setState(second)]] });
    const before = rmsAt(samples, secondsToFrames(1), secondsToFrames(0.5));
    let lowest = Infinity;
    let highest = 0;
    for (let at = 1.5; at < 4; at += 0.05) {
      const level = rmsAt(samples, secondsToFrames(at), 2400);
      lowest = Math.min(lowest, level);
      highest = Math.max(highest, level);
    }
    console.log(`track crossfade: level ${(20 * Math.log10(lowest / before)).toFixed(2)} to ${(20 * Math.log10(highest / before)).toFixed(2)} dB around before`);
    expect(longestSilence(samples, secondsToFrames(0.5), samples.length)).toBeLessThanOrEqual(1);
    expect(20 * Math.log10(lowest / before)).toBeGreaterThan(-1.5);
    expect(20 * Math.log10(highest / before)).toBeLessThan(1.5);
    expect(sineAt(samples, secondsToFrames(1.45), secondsToFrames(0.5), 220).amplitude).toBeLessThan(0.002);
    expect(sineAt(samples, secondsToFrames(3.2), secondsToFrames(0.5), 330).amplitude).toBeLessThan(0.002);
    expect(sineAt(samples, secondsToFrames(3.2), secondsToFrames(0.5), 220).amplitude).toBeGreaterThan(0.2);
  });

  it('holds one track past its end when repeat one takes over, with no silence, and never reaches the next', async () => {
    const first = tableOf({ music: musicOf([fixtures.tone330, fixtures.tone220]) });
    const held = withListChange(first, { tracks: first.music!.tracks, shuffle: false, repeat: 'one' }, 3000);
    const samples = await render(first, fixtures, { seconds: 8, at: [[1.5, (player): void => player.setState(held)]] });
    expect(longestSilence(samples, secondsToFrames(0.5), samples.length)).toBeLessThanOrEqual(1);
    for (const at of [1, 3.2, 5, 7]) {
      expect(sineAt(samples, secondsToFrames(at), secondsToFrames(0.5), 330).amplitude).toBeGreaterThan(0.2);
      expect(sineAt(samples, secondsToFrames(at), secondsToFrames(0.5), 220).amplitude).toBeLessThan(0.002);
    }
  });

  it('goes silent past the end of a list that stops there, and stays so', async () => {
    const samples = await render(tableOf({ music: musicOf([fixtures.tone330], { repeat: 'off' }) }), fixtures, { seconds: 6 });
    expect(sineAt(samples, secondsToFrames(2), secondsToFrames(0.5), 330).amplitude).toBeGreaterThan(0.2);
    expect(rmsAt(samples, secondsToFrames(3.2), secondsToFrames(2))).toBeLessThan(0.001);
  });

  it('takes a list up in its middle: the frames behind it decide what plays', async () => {
    const samples = await render(tableOf({ music: musicOf([fixtures.tone330, fixtures.tone220], { listFrame: fixtures.tone330.frames }) }), fixtures, { seconds: 2 });
    expect(sineAt(samples, secondsToFrames(1), secondsToFrames(0.5), 220).amplitude).toBeGreaterThan(0.2);
    expect(sineAt(samples, secondsToFrames(1), secondsToFrames(0.5), 330).amplitude).toBeLessThan(0.002);
  });
});
