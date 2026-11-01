import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { cdp, commands, page, userEvent } from 'vitest/browser';
import { DARK, openSoundTab, seedMoods, type SoundTab } from './sound/soundTabHarness';

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

    const report = [
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
});
