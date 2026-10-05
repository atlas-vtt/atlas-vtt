import '../setup/obsidianDom';
import { afterEach, expect, it, vi } from 'vitest';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { FogCanvasCompositor } from '../../src/app/pixi/fog/FogCanvasCompositor';
import { FogCoverageCache } from '../../src/app/fog/FogCoverageCache';
import type { FogRectangleFill } from '../../src/app/types/fogTypes';

vi.mock('../../src/app/fog/fogCoverage', { spy: true });
const build = vi.mocked(fogCoverage);
const owned: FogCanvasCompositor[] = [];
const paint: FogRectangleFill = { id: 'paint', kind: 'fog', type: 'rectangle', timestamp: 1,
  x: 0, y: 0, width: 64, height: 64, isErasing: false };
const first = { paint };
const second = { ...first, erase: { ...paint, id: 'erase', timestamp: 2, x: 16, y: 16, width: 16, height: 16, isErasing: true } };

function compositor(cache?: FogCoverageCache, mapKey?: () => string | null): FogCanvasCompositor {
  const c = new FogCanvasCompositor({ x: 0, y: 0, width: 128, height: 128 }, 0.5, cache, mapKey);
  owned.push(c);
  return c;
}

afterEach(() => {
  for (const c of owned.splice(0)) c.destroy();
  vi.clearAllMocks();
});

it('reuses unchanged coverage across previews and bounds-only redraws', () => {
  const c = compositor();
  c.composite(first);
  c.composite(first, second.erase);
  c.composite(first);
  c.updateBounds({ x: -32, y: -32, width: 256, height: 256 });
  c.composite(first);
  expect(build).toHaveBeenCalledTimes(1);
});

it('offers the previous coverage for a fresh append but rebuilds previously observed undo/redo snapshots', () => {
  const c = compositor();
  c.composite(first);
  c.composite(second);
  expect(build.mock.calls[1]?.[1]).toBeDefined();
  c.composite(first);
  expect(build.mock.calls[2]?.[1]).toBeUndefined();
  c.composite(second);
  expect(build.mock.calls[3]?.[1]).toBeUndefined();
  c.composite(second);
  expect(build).toHaveBeenCalledTimes(4);
});

it('forgets observed snapshots when the compositor is reset for another map', () => {
  const c = compositor();
  c.composite(first);
  c.composite(second);
  c.reset();
  c.composite(first);
  expect(build.mock.calls[2]?.[1]).toBeUndefined();
  c.composite(second);
  expect(build.mock.calls[3]?.[1]).toBeDefined();
});

it('shares coverage read before the compositor and preserves it while clearing old map pixels', () => {
  const cache = new FogCoverageCache();
  let mapKey = 'a';
  const c = compositor(cache, () => mapKey);
  c.composite(first);
  mapKey = 'b';
  const next = cache.get(second, mapKey);
  c.clearCanvas();
  expect(c.composite(second)).toBe(true);
  expect(cache.get(second, mapKey)).toBe(next);
  expect(build).toHaveBeenCalledTimes(2);
  expect(build.mock.calls[1]?.[1]).toBeUndefined();
});

it('keeps valid membership after an invalid preview or a failed canvas draw', () => {
  const cache = new FogCoverageCache();
  const c = compositor(cache);
  const committed = cache.get(first);
  expect(c.composite(first, { ...paint, timestamp: Number.NaN })).toBe(false);
  expect(cache.get(first)).toBe(committed);
  expect(committed?.covers({ x: 100, y: 100 })).toBe(false);
  const context = c.getCanvas().getContext('2d')!;
  const fill = vi.spyOn(context, 'fill').mockImplementationOnce(() => { throw new Error('Drawing failed'); });
  expect(c.composite(first)).toBe(false);
  expect(cache.get(first)).toBe(committed);
  fill.mockRestore();
  expect(c.composite(first)).toBe(true);
  expect(build).toHaveBeenCalledTimes(1);
});
