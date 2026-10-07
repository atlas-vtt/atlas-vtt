import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { differingBytes, fallbackPictures, lightingPictures, type Pictures } from '../helpers/visibilityPictureScene';
import { pictureScenes } from '../helpers/visibilityPictureScenes';

const route = vi.hoisted(() => ({ full: false, fullCalls: 0 }));

vi.mock('../../src/app/vision/visibility', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/vision/visibility')>();
  const full = await import('../oracles/visibilityBaseline/visibility');
  return {
    ...actual,
    computeVisibility: (...args: Parameters<typeof actual.computeVisibility>) => {
      if (!route.full) return actual.computeVisibility(...args);
      route.fullCalls++;
      return full.computeVisibility(...args);
    },
  };
});

/** Builds the pictures with the sweep under test, or with the full sweep; fresh renderers, builders and engines each time. */
async function through<T>(full: boolean, make: () => Promise<T>): Promise<T> {
  route.full = full;
  const before = route.fullCalls;
  try {
    return await make();
  } finally {
    if (full) expect(route.fullCalls).toBeGreaterThan(before);
    route.full = false;
  }
}

function compare(mine: Pictures, theirs: Pictures): string[] {
  const differ: string[] = [];
  for (const [name, frame] of mine.frames) {
    const n = differingBytes(frame, theirs.frames.get(name)!);
    if (n) differ.push(`${name}: ${n} bytes`);
  }
  if (differingBytes(mine.memory, theirs.memory)) differ.push('explored memory');
  if (mine.mask !== theirs.mask) differ.push('saved mask');
  if (differingBytes(mine.thumbnail, theirs.thumbnail)) differ.push('thumbnail');
  return differ;
}

describe('pictures drawn from the culled sweep', { timeout: 600_000 }, () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(pictureScenes().map((scene) => [scene.name, scene] as const))('draws the same frames, memory, saved mask and thumbnail on %s', async (_, scene) => {
    for (const resolution of [1, 2]) {
      const mine = await through(false, () => lightingPictures(scene, resolution));
      const theirs = await through(true, () => lightingPictures(scene, resolution));
      expect(mine.mask).not.toBeNull();
      expect(compare(mine, theirs), `resolution ${resolution}`).toEqual([]);
    }
  });

  it.each(pictureScenes().map((scene) => [scene.name, scene] as const))('draws the same line-of-sight fallback on %s', async (_, scene) => {
    for (const preference of ['webgl', 'canvas'] as const) {
      const mine = await through(false, () => fallbackPictures(scene, preference));
      const theirs = await through(true, () => fallbackPictures(scene, preference));
      if (mine === null || theirs === null) {
        console.info(`line-of-sight fallback on ${scene.name}: PIXI's ${preference} renderer could not start here`);
        continue;
      }
      expect(mine.map((frame, i) => differingBytes(frame, theirs[i]!))).toEqual(mine.map(() => 0));
    }
  });
});
