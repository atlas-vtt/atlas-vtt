import type { LightReach, PrimedSight } from '../sight';
import { unpackReaches, unpackSight, type PrebuildReply, type PrebuildRequest } from './scenePrebuild';

/** What a prebuild traced, made for the main thread's caches: each light's reach in the request's order (null where a part failed) and each token's sight polygons. */
export interface PrebuiltScene {
  reaches: LightReach[] | null;
  sight: Map<string, PrimedSight>;
}

/** A request split over workers: the part each traces, and which of the request's lights and sources it holds. */
export interface PrebuildSplit {
  parts: PrebuildRequest[];
  lights: number[][];
  sources: number[][];
}

/** Sight without a range is swept as far as this for the estimate: it reaches across any map. */
const FAR = 4096;

/** How many sweeps a light takes compared with a plain one: an area light's outline and a reflection's shadow edges each take many. */
function lightWeight(light: PrebuildRequest['lights'][number], reflection: PrebuildRequest['reflection']): number {
  return (light.surface ? 4 : 1) * (reflection && !light.darkness ? 3 : 1);
}

/** About how much tracing `walls` walls and these lights and sources take, in wall-sweeps: what decides whether a scene is traced ahead. */
export function prebuildWork(walls: number, lights: PrebuildRequest['lights'], sources: PrebuildRequest['sources'], reflection: PrebuildRequest['reflection']): number {
  let sweeps = 0;
  for (const light of lights) sweeps += lightWeight(light, reflection);
  for (const source of sources) sweeps += 1 + source.senses.length;
  return walls * sweeps;
}

/**
 * `request` split into at most `count` parts of about equal work, each with all the walls: every
 * light and every source is traced on its own, so a part traces exactly what the whole would for
 * the lights and sources it holds. The work is guessed from the area each sweeps.
 */
export function splitPrebuild(request: PrebuildRequest, count: number): PrebuildSplit {
  const jobs = [
    ...request.lights.map((light, i) => ({ light: true, i, cost: light.dim ** 2 * lightWeight(light, request.reflection) })),
    ...request.sources.map((source, i) => ({ light: false, i, cost: Math.min(source.range, FAR) ** 2 * (1 + source.senses.length) })),
  ].sort((a, b) => b.cost - a.cost);
  const parts = Math.max(1, Math.min(count, jobs.length));
  const load = new Array<number>(parts).fill(0);
  const lights = Array.from({ length: parts }, (): number[] => []);
  const sources = Array.from({ length: parts }, (): number[] => []);
  for (const job of jobs) {
    const part = load.indexOf(Math.min(...load));
    load[part]! += job.cost;
    (job.light ? lights : sources)[part]!.push(job.i);
  }
  for (const list of [...lights, ...sources]) list.sort((a, b) => a - b);
  return {
    parts: lights.map((own, part) => ({ ...request, lights: own.map((i) => request.lights[i]!), sources: sources[part]!.map((i) => request.sources[i]!) })),
    lights,
    sources,
  };
}

/** The traces of all parts of `split` put together for `request`'s lights; null where no part answered. */
export function assemblePrebuild(request: PrebuildRequest, split: PrebuildSplit, replies: readonly (PrebuildReply | null)[]): PrebuiltScene | null {
  if (replies.every((reply) => !reply)) return null;
  const reaches: LightReach[] = [];
  let whole = true;
  const sight = new Map<string, PrimedSight>();
  replies.forEach((reply, part) => {
    const lights = split.lights[part]!;
    const traced = reply && unpackReaches(reply, lights.map((i) => request.lights[i]!), request.reflection);
    if (traced) lights.forEach((i, k) => { reaches[i] = traced[k]!; });
    else whole &&= lights.length === 0;
    if (reply) for (const [id, primed] of unpackSight(reply)) sight.set(id, primed);
  });
  return { reaches: whole ? reaches : null, sight };
}
