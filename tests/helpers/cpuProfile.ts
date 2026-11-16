import { cdp } from 'vitest/browser';

interface ProfileNode { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }
interface Profile { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] }

/** Where a function lives, short: `name (file:line)`. */
function nameOf({ functionName, url, lineNumber }: ProfileNode['callFrame']): string {
  const file = url.replace(/^.*\/src\//, '').replace(/\?.*$/, '');
  return `${functionName || '(anonymous)'} (${file}:${lineNumber + 1})`;
}

/**
 * Runs `work` under the browser's CPU profiler and returns the functions it spent the most time
 * in, by self time and by total time (each sample counted once per function on its stack), in ms.
 */
export async function profileCpu(work: () => Promise<void> | void, top = 25): Promise<{ self: [string, number][]; total: [string, number][] }> {
  const session = cdp();
  await session.send('Profiler.enable');
  await session.send('Profiler.setSamplingInterval', { interval: 100 });
  await session.send('Profiler.start');
  await work();
  const { profile } = await session.send('Profiler.stop') as { profile: Profile };
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const self = new Map<string, number>();
  const total = new Map<string, number>();
  profile.samples.forEach((id, i) => {
    const ms = (profile.timeDeltas[i] ?? 0) / 1000;
    const node = byId.get(id)!;
    const own = nameOf(node.callFrame);
    self.set(own, (self.get(own) ?? 0) + ms);
    const seen = new Set<string>();
    for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) {
      const name = nameOf(byId.get(at)!.callFrame);
      if (seen.has(name)) continue;
      seen.add(name);
      total.set(name, (total.get(name) ?? 0) + ms);
    }
  });
  const sorted = (map: Map<string, number>): [string, number][] => [...map].filter(([name]) => !/^\((idle|program|root|garbage collector)\)/.test(name)).sort((a, b) => b[1] - a[1]).slice(0, top).map(([name, ms]) => [name, Math.round(ms * 10) / 10]);
  return { self: sorted(self), total: sorted(total) };
}
