import { act } from '@testing-library/react';
import React, { Profiler } from 'react';
import { cdp, commands } from 'vitest/browser';

/** What one moment of the page cost: React's commits, the main thread's long tasks and the frames drawn meanwhile. */
export interface Cost {
  label: string;
  ms: number;
  commits: number;
  /** React's own time in those commits (`actualDuration`), summed and at worst. */
  reactMs: number;
  worstCommitMs: number;
  phases: Record<string, number>;
  longTasks: number[];
  /** The functions that took the most of the main thread, by their own time. */
  hot: string[];
}

/** Counts every commit of what it wraps. */
export class CommitCounter {
  count = 0;
  total = 0;
  worst = 0;
  phases: Record<string, number> = {};

  wrap(node: React.ReactNode): React.ReactElement {
    return React.createElement(Profiler, { id: 'page', onRender: (_id, phase, actual) => {
      this.count++;
      this.phases[phase] = (this.phases[phase] ?? 0) + 1;
      this.total += actual;
      this.worst = Math.max(this.worst, actual);
    } }, node);
  }

  reset(): void {
    this.count = 0;
    this.total = 0;
    this.worst = 0;
    this.phases = {};
  }
}

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  hitCount?: number;
  children?: number[];
}

interface Profile {
  nodes: ProfileNode[];
  samples?: number[];
  timeDeltas?: number[];
}

/** Self time by function, the largest first: what a CPU profile says the moment was spent on. */
function hottest(profile: Profile, top: number): string[] {
  const byNode = new Map(profile.nodes.map((node) => [node.id, node]));
  const self = new Map<string, number>();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let index = 0; index < samples.length; index++) {
    const node = byNode.get(samples[index]!);
    if (!node) continue;
    const { functionName, url, lineNumber } = node.callFrame;
    if (functionName === '(idle)' || functionName === '(program)') continue;
    const file = url.replace(/^.*\//, '').replace(/\?.*$/, '');
    const name = `${functionName || '(anonymous)'} ${file}:${lineNumber + 1}`;
    self.set(name, (self.get(name) ?? 0) + (deltas[index + 1] ?? deltas[index] ?? 0) / 1000);
  }
  const selfLines = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([name, ms]) => `${ms.toFixed(1)} ms ${name}`);
  return [...selfLines, ...inclusive(profile, byNode, top)];
}

/** Time spent in and under each function of Atlas' own code (recursion counted once): which component or helper a moment went to. */
function inclusive(profile: Profile, byNode: ReadonlyMap<number, ProfileNode>, top: number): string[] {
  const own = new Map<number, number>();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let index = 0; index < samples.length; index++) own.set(samples[index]!, (own.get(samples[index]!) ?? 0) + (deltas[index + 1] ?? 0) / 1000);
  const parentOf = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parentOf.set(child, node.id);
  const total = new Map<string, number>();
  for (const [id, ms] of own) {
    const seen = new Set<string>();
    for (let at: number | undefined = id; at !== undefined; at = parentOf.get(at)) {
      const { functionName, url, lineNumber } = byNode.get(at)!.callFrame;
      if (!url.includes('/src/app/') || functionName === '') continue;
      const name = `${functionName} ${url.replace(/^.*\//, '').replace(/\?.*$/, '')}:${lineNumber + 1}`;
      if (seen.has(name)) continue;
      seen.add(name);
      total.set(name, (total.get(name) ?? 0) + ms);
    }
  }
  return [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([name, ms]) => `  incl ${ms.toFixed(1)} ms ${name}`);
}

/** Runs `work` under a CPU profile and a long-task watch, and says what it cost. */
export async function measured(label: string, commits: CommitCounter, work: () => Promise<void>): Promise<Cost> {
  const session = cdp();
  await session.send('Profiler.enable');
  await session.send('Profiler.setSamplingInterval', { interval: 200 });
  const long: number[] = [];
  const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) long.push(entry.duration); });
  observer.observe({ type: 'longtask', buffered: false });
  commits.reset();
  await session.send('Profiler.start');
  const started = performance.now();
  await work();
  const ms = performance.now() - started;
  const { profile } = await session.send('Profiler.stop') as { profile: Profile };
  observer.disconnect();
  return { label, ms, commits: commits.count, reactMs: commits.total, worstCommitMs: commits.worst, phases: { ...commits.phases }, longTasks: long, hot: hottest(profile, 8) };
}

/** Frame times while `move` runs once a frame until it says it is done. */
export async function frameTimes(move: (frame: number) => boolean): Promise<number[]> {
  const frames: number[] = [];
  await new Promise<void>((resolve) => {
    let last = performance.now();
    let frame = 0;
    const step = (now: number): void => {
      frames.push(now - last);
      last = now;
      if (move(frame++)) window.requestAnimationFrame(step);
      else resolve();
    };
    window.requestAnimationFrame(step);
  });
  frames.shift();
  return frames.sort((a, b) => a - b);
}

export const quantile = (sorted: readonly number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;

export const nextFrames = async (count = 2): Promise<void> => {
  await act(async () => {
    for (let index = 0; index < count; index++) await new Promise((resolve) => window.requestAnimationFrame(resolve));
  });
};

const lines: string[] = [];

/** Every cost reported, by its label: what a test's budgets are held to once all is written down. */
export const reported = new Map<string, Cost>();

/** Writes what was measured beside the shots, as a passing browser test prints nothing. */
export async function report(file: string, cost: Cost | string): Promise<void> {
  if (typeof cost !== 'string') reported.set(cost.label, cost);
  const line = typeof cost === 'string' ? cost : [
    `[${cost.label}] ${cost.ms.toFixed(0)} ms, ${cost.commits} commits ${JSON.stringify(cost.phases)}, React ${cost.reactMs.toFixed(0)} ms (worst ${cost.worstCommitMs.toFixed(1)}),`,
    `long tasks ${cost.longTasks.length} (worst ${Math.max(0, ...cost.longTasks).toFixed(0)}, total ${cost.longTasks.reduce((a, b) => a + b, 0).toFixed(0)})`,
    ...cost.hot.map((hot) => `    ${hot}`),
  ].join('\n');
  lines.push(line);
  await commands.writeFile(file, lines.join('\n'));
}
