import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { cdp, commands, page, userEvent } from 'vitest/browser';
import { MusicWave } from '../../src/app/react/components/dm-screen/sound/musicWave';
import { OpusCache, opusCacheDatabaseName } from '../../src/app/sound/codec/opusCache';
import { PEAK_BUCKETS } from '../../src/app/sound/codec/soundPeaks';
import { readSoundPeaks } from '../../src/app/sound/codec/soundPeaksClient';
import { prepareSource } from '../../src/app/soundDirector/sourcePrepare';
import { DARK, openSoundTab, seedMoods, SOUNDS, type SoundTab } from './sound/soundTabHarness';

vi.mock('../../src/app/react/components/dm-screen/DMStatblocksPane', async () => {
  const { createElement } = await import('react');
  return { DMStatblocksPane: () => createElement('div', { className: 'atlas-dm-statblocks-section' }) };
});
vi.mock('../../src/app/react/components/dm-screen/useDMScreenStatblocks', () => ({ useDMScreenStatblocks: () => ({ statblocks: new Map(), loading: false }) }));

interface Measured {
  frames: number;
  p50: number;
  p95: number;
  worst: number;
  longTasks: number;
  longestTask: number;
  commits: number;
  /** Share of wall time the main thread worked, script alone and all of it, with the frame's busy work taken out. */
  scriptShare: number;
  taskShare: number;
}

interface CdpMetrics {
  metrics: Array<{ name: string; value: number }>;
}

async function mainThreadTime(): Promise<{ script: number; task: number }> {
  const session = cdp();
  await session.send('Performance.enable');
  const { metrics } = (await session.send('Performance.getMetrics')) as CdpMetrics;
  const value = (name: string): number => metrics.find((metric) => metric.name === name)?.value ?? 0;
  return { script: value('ScriptDuration'), task: value('TaskDuration') };
}

/** A frame's worth of other work beside the sound: what a busy map view costs the main thread. */
function busyWork(ms: number): void {
  const end = performance.now() + ms;
  let spin = 0;
  while (performance.now() < end) spin += Math.sqrt(spin + 1);
  (window as Window & { spin?: number }).spin = spin;
}

async function measure(tab: SoundTab, seconds: number, busyMs: number): Promise<Measured> {
  const long: number[] = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) long.push(entry.duration);
  });
  observer.observe({ entryTypes: ['longtask'] });
  tab.commits.count = 0;
  const times: number[] = [];
  const started = await mainThreadTime();
  let busyTotal = 0;
  const wall = performance.now();
  await new Promise<void>((resolve) => {
    const end = performance.now() + seconds * 1000;
    let last = performance.now();
    const frame = (now: number): void => {
      times.push(now - last);
      last = now;
      const before = performance.now();
      busyWork(busyMs);
      busyTotal += performance.now() - before;
      if (now < end) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
  const elapsed = (performance.now() - wall) / 1000;
  const ended = await mainThreadTime();
  const busySeconds = busyTotal / 1000;
  observer.disconnect();
  times.sort((a, b) => a - b);
  return {
    frames: times.length,
    p50: times[Math.floor(times.length / 2)] ?? 0,
    p95: times[Math.floor(times.length * 0.95)] ?? 0,
    worst: times.at(-1) ?? 0,
    longTasks: long.length,
    longestTask: Math.max(0, ...long),
    commits: tab.commits.count,
    scriptShare: (ended.script - started.script - busySeconds) / elapsed,
    taskShare: (ended.task - started.task - busySeconds) / elapsed,
  };
}

const row = (name: string, cost: Measured): string =>
  `${name}: ${cost.frames} frames, p50 ${cost.p50.toFixed(1)} ms, p95 ${cost.p95.toFixed(1)} ms, worst ${cost.worst.toFixed(1)} ms, long tasks ${cost.longTasks} (longest ${cost.longestTask.toFixed(0)} ms), commits ${cost.commits}, main thread besides the busy work: script ${(cost.scriptShare * 100).toFixed(2)} %, all tasks ${(cost.taskShare * 100).toFixed(2)} %`;

/** Prints what a table's sound costs the main thread beside other work. Run by hand; it asserts only what must never be broken. */
describe('what the sound costs a frame', () => {
  it('music and layers beside a busy frame', async () => {
    await page.viewport(1280, 820);
    const viewport = document.body.createDiv();
    viewport.style.cssText = 'position: absolute; top: 0; left: 0; width: 1280px; height: 820px; contain: strict; overflow: hidden';
    const tab = await openSoundTab(DARK, viewport);
    seedMoods(tab);
    tab.director.shelf.request([...tab.records.values()]);
    await expect.poll(() => [...tab.records.values()].every((record) => tab.director.shelf.stateOf(record).state === 'ready'), { timeout: 60_000, interval: 100 }).toBe(true);
    await expect.poll(() => document.querySelectorAll('[data-sound-mood]').length).toBe(11);
    const seconds = Number(import.meta.env.VITE_SOUND_COST_SECONDS ?? 15);

    const idle = await measure(tab, seconds, 0);
    const baseline = await measure(tab, seconds, 8);
    await userEvent.keyboard('1');
    for (const name of ['Rain', 'Wind in the reeds']) {
      const record = tab.records.get(name);
      if (record) tab.director.desk.addSound(record);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const playing = await measure(tab, seconds, 8);
    const quiet = await measure(tab, seconds, 0);

    // A fader held and moved for as long as it can be: every move writes through to the gain.
    const key = tab.director.snapshot().mix.table.layers[0]?.sound.key ?? '';
    let db = -3;
    const held = window.setInterval(() => {
      db = db <= -20 ? -3 : db - 0.5;
      act(() => tab.director.desk.setLayerLevel(key, db));
    }, 16);
    const fader = await measure(tab, 5, 0);
    window.clearInterval(held);

    // A 400 MB source on its way to the importer, as a three-hour file is.
    const big = new ArrayBuffer(400 * 1024 * 1024);
    const longTasks: number[] = [];
    const watcher = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    watcher.observe({ entryTypes: ['longtask'] });
    const preparing = performance.now();
    await prepareSource(big);
    const prepared = performance.now() - preparing;
    await new Promise((resolve) => setTimeout(resolve, 200));
    watcher.disconnect();

    const report = [
      `400 MB source hashed and wrapped off the main thread: ${prepared.toFixed(0)} ms, long tasks ${longTasks.length}${longTasks.length > 0 ? ` (longest ${Math.max(...longTasks).toFixed(0)} ms)` : ''}`,
      `sound lifecycle ${tab.director.snapshot().lifecycle}, layers ${tab.director.snapshot().mix.table.layers.length}, waiting for bytes ${tab.director.snapshot().waitingKeys.length}`,
      row('tab open, nothing playing, nothing else', idle),
      row('tab open, nothing playing, 8 ms busy', baseline),
      row('music + layers, 8 ms busy', playing),
      row('music + layers, nothing else', quiet),
      row('a fader held and moving', fader),
    ].join('\n');
    await commands.writeFile('__screenshots__/sound-tab/cost.txt', report);
    expect(playing.commits, 'commits while only time passes').toBeLessThan(seconds * 2);
    tab.unmount();
    viewport.remove();
  });

  it('meters and the waveform beside music and eight layers', async () => {
    await page.viewport(1713, 1067);
    const viewport = document.body.createDiv();
    viewport.style.cssText = 'position: absolute; top: 0; left: 0; width: 1713px; height: 1067px; contain: strict; overflow: hidden';
    const tab = await openSoundTab(DARK, viewport);
    seedMoods(tab);
    tab.director.shelf.request([...tab.records.values()]);
    await expect.poll(() => [...tab.records.values()].every((record) => tab.director.shelf.stateOf(record).state === 'ready'), { timeout: 120_000, interval: 100 }).toBe(true);
    await expect.poll(() => document.querySelectorAll('[data-sound-mood]').length).toBe(11);
    await userEvent.keyboard('1');
    for (const [name, { kind }] of Object.entries(SOUNDS)) {
      const record = tab.records.get(name);
      if (record && kind === 'ambience') act(() => { tab.director.desk.addSound(record); });
    }
    await expect.poll(() => tab.director.snapshot().mix.table.layers.length, { timeout: 30_000 }).toBe(8);
    const seconds = Number(import.meta.env.VITE_SOUND_COST_SECONDS ?? 15);
    const session = cdp();
    const reopen = async (): Promise<void> => {
      act(() => tab.store.getState().setDMScreenPage('statblocks'));
      await new Promise((resolve) => setTimeout(resolve, 100));
      act(() => tab.store.getState().setDMScreenPage('sound'));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    };

    // Without meters: the same page and sound, the loop stopped after its one reading.
    await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await reopen();
    const without = await measure(tab, seconds, 8);
    const withoutQuiet = await measure(tab, seconds, 0);
    await session.send('Emulation.setEmulatedMedia', { features: [] });
    await reopen();
    const meters = await measure(tab, seconds, 8);
    const metersQuiet = await measure(tab, seconds, 0);

    const levels = new Map<string, number>();
    const reading = performance.now();
    for (let i = 0; i < 1000; i++) tab.director.readMeters(levels);
    const readMs = (performance.now() - reading) / 1000;

    // One canvas of a card's width, as a track's waveform draws.
    const canvas = viewport.createEl('canvas');
    canvas.style.cssText = 'width: 480px; height: 62px; color: white';
    const wave = new MusicWave(canvas, viewport.createEl('canvas'));
    const peaks = new Uint8Array(PEAK_BUCKETS).map((_, index) => (index * 7) % 255);
    const painting = performance.now();
    let lastPeaks = peaks;
    for (let i = 0; i < 100; i++) {
      lastPeaks = peaks.slice();
      wave.show(lastPeaks, 0.3);
    }
    const paintMs = (performance.now() - painting) / 100;
    const boundary = performance.now();
    for (let i = 0; i < 1000; i++) wave.show(lastPeaks, (i % 100) / 100);
    const boundaryMs = (performance.now() - boundary) / 1000;

    // The whole sound through the worker, for a track of a minute.
    const road = tab.records.get('Road to Wolfhaven');
    const info = road && tab.director.shelf.infoOf(road);
    const copy = await (await new OpusCache(window.indexedDB, opusCacheDatabaseName(tab.appId), () => 1e12).blob(info?.key ?? ''))?.arrayBuffer();
    const working = performance.now();
    const read = await readSoundPeaks(new Blob([copy ?? new ArrayBuffer(0)]), info?.frames ?? 1);
    const peaksMs = performance.now() - working;

    // What analysers ask of the audio thread: a minute of ten voices, rendered with and without them.
    const render = async (analysers: boolean): Promise<number> => {
      const context = new OfflineAudioContext(2, 48000 * 60, 48000);
      for (let i = 0; i < 10; i++) {
        const voice = context.createOscillator();
        const gain = context.createGain();
        voice.frequency.value = 110 * (i + 1);
        voice.connect(gain).connect(context.destination);
        voice.start();
        if (analysers) {
          const analyser = context.createAnalyser();
          analyser.fftSize = 1024;
          gain.connect(analyser);
        }
      }
      const started = performance.now();
      await context.startRendering();
      return performance.now() - started;
    };
    const plain = await render(false);
    const tapped = await render(true);
    const plainAgain = await render(false);
    const tappedAgain = await render(true);

    const report = [
      `music + 8 layers, ${tab.director.snapshot().mix.table.layers.length} layers, lifecycle ${tab.director.snapshot().lifecycle}`,
      row('meters stopped, 8 ms busy', without),
      row('meters running, 8 ms busy', meters),
      row('meters stopped, nothing else', withoutQuiet),
      row('meters running, nothing else', metersQuiet),
      `one reading of ${levels.size} strips: ${readMs.toFixed(3)} ms`,
      `a waveform painted twice at 480 x 62: ${paintMs.toFixed(3)} ms; moving the played boundary: ${boundaryMs.toFixed(4)} ms`,
      `peaks of ${((info?.frames ?? 0) / 48000).toFixed(0)} s of music in a worker: ${peaksMs.toFixed(0)} ms, ${read.length} bytes kept`,
      `a minute of ten voices offline: without analysers ${plain.toFixed(0)} and ${plainAgain.toFixed(0)} ms, with ten analysers ${tapped.toFixed(0)} and ${tappedAgain.toFixed(0)} ms`,
    ].join('\n');
    await commands.writeFile('__screenshots__/sound-tab/meter-cost.txt', report);
    expect(metersQuiet.commits, 'commits while only meters move').toBeLessThan(seconds * 2);
    tab.unmount();
    viewport.remove();
  }, 240_000);
});
