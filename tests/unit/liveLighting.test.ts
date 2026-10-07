import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DarknessRaster, ExploredImage } from '../../src/app/pixi/lighting/playerDarkness/darknessRaster';
import { DARKNESS_INTERVAL_MS, SightFrames } from '../../src/app/pixi/lighting/playerDarkness/sightFrames';
import { character, exploredImage, lightingFromStore, MAP, scene, wall, type Scene } from './lightingFixtures';

const walled = (heroX = 140): Scene => scene({ ambient: 1 }, {
  tokens: { hero: character('hero', heroX, 400, { vision: { enabled: true } }), goblin: character('goblin', 800, 400) },
  walls: { w: wall('w', { x: 503, y: -10 }, { x: 503, y: 810 }) },
});

const night = (): Scene => scene({ ambient: 0, exploredMemory: true }, { tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }) } });

const darkAt = (raster: DarknessRaster, x: number, y: number): boolean =>
  raster.dark[Math.floor(y / raster.cellSize) * raster.cols + Math.floor(x / raster.cellSize)] === 1;

const allDark = (raster: DarknessRaster): boolean => raster.dark.every((cell) => cell === 1);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('the sight frames of a view', () => {
  it('keeps the raster while its inputs are the same objects', () => {
    const frames = new SightFrames(() => {});
    const lighting = lightingFromStore(walled(), MAP)!;
    const first = frames.raster(lighting, null, MAP, undefined, 0).raster;
    expect(frames.raster(lighting, null, MAP, undefined, 500).raster).toBe(first);
    expect(darkAt(first, 300, 400)).toBe(false);
    expect(darkAt(first, 800, 400)).toBe(true);
    frames.dispose();
  });

  it('works the darkness out at most every interval, calling back when it is due', () => {
    const due = vi.fn();
    const frames = new SightFrames(due);
    const first = frames.raster(lightingFromStore(walled(), MAP)!, null, MAP, undefined, 0).raster;
    const moved = lightingFromStore(walled(600), MAP)!;
    expect(frames.raster(moved, null, MAP, undefined, 50).raster).toBe(first);
    vi.advanceTimersByTime(DARKNESS_INTERVAL_MS - 50);
    expect(due).toHaveBeenCalledTimes(1);
    const later = frames.raster(moved, null, MAP, undefined, DARKNESS_INTERVAL_MS).raster;
    expect(later).not.toBe(first);
    expect(darkAt(later, 800, 400)).toBe(false);
    frames.dispose();
  });

  it('darkens at once, without waiting, when the view\'s sight stops being the scene\'s, and lights at once when it is again', () => {
    const frames = new SightFrames(() => {});
    const lighting = lightingFromStore(walled(), MAP)!;
    frames.raster(lighting, null, MAP, undefined, 0);
    expect(allDark(frames.raster({ ...lighting, ready: false }, null, MAP, undefined, 10).raster)).toBe(true);
    const again = frames.raster(lightingFromStore(walled(600), MAP)!, null, MAP, undefined, 20).raster;
    expect(darkAt(again, 800, 400)).toBe(false);
    frames.dispose();
  });

  it('decodes the scene\'s explored memory once: pending until it arrives, then shown', async () => {
    const memory: ExploredImage = exploredImage(MAP, (x) => x > 700);
    const decode = vi.fn(async (): Promise<ExploredImage> => memory);
    const due = vi.fn();
    const frames = new SightFrames(due, decode);
    const lighting = lightingFromStore(night(), MAP)!;
    const waiting = frames.raster(lighting, 'data:image/png;base64,AA', MAP, undefined, 0);
    expect(waiting.exploredPending).toBe(true);
    expect(allDark(waiting.raster)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(due).toHaveBeenCalled();
    const shown = frames.raster(lighting, 'data:image/png;base64,AA', MAP, undefined, 1);
    expect(shown.exploredPending).toBe(false);
    expect(darkAt(shown.raster, 900, 400)).toBe(false);
    expect(decode).toHaveBeenCalledTimes(1);
    // Forgetting the memory takes effect at once, within the interval.
    expect(darkAt(frames.raster(lighting, null, MAP, undefined, 2).raster, 900, 400)).toBe(true);
    frames.dispose();
  });

  it('lets the last memory stand in while a newer mask of the same scene decodes', async () => {
    const memories: Record<string, ExploredImage> = { 'data:a': exploredImage(MAP, (x) => x > 700), 'data:b': exploredImage(MAP, (x) => x > 600) };
    const frames = new SightFrames(() => {}, async (mask) => memories[mask]!);
    const lighting = lightingFromStore(night(), MAP)!;
    frames.raster(lighting, 'data:a', MAP, undefined, 0);
    await vi.advanceTimersByTimeAsync(0);
    const meanwhile = frames.raster(lighting, 'data:b', MAP, undefined, DARKNESS_INTERVAL_MS);
    expect(meanwhile.exploredPending).toBe(false);
    expect(darkAt(meanwhile.raster, 900, 400)).toBe(false);
    frames.dispose();
  });

  it('lets no memory decoded before stand in once the scene loads anew', async () => {
    const memories: Record<string, ExploredImage> = { 'data:a': exploredImage(MAP, (x) => x > 700), 'data:b': exploredImage(MAP, () => false) };
    let finish: (() => void) | null = null;
    const decode = vi.fn((mask: string) => new Promise<ExploredImage>((resolve) => { finish = () => resolve(memories[mask]!); }));
    const frames = new SightFrames(() => {}, decode);
    const lighting = lightingFromStore(night(), MAP)!;
    frames.raster(lighting, 'data:a', MAP, undefined, 0);
    finish!();
    await vi.advanceTimersByTimeAsync(0);
    expect(darkAt(frames.raster(lighting, 'data:a', MAP, undefined, DARKNESS_INTERVAL_MS).raster, 900, 400)).toBe(false);
    frames.restart();
    const reloaded = frames.raster(lighting, 'data:b', MAP, undefined, DARKNESS_INTERVAL_MS + 1);
    expect(reloaded.exploredPending).toBe(true);
    expect(allDark(reloaded.raster)).toBe(true);
    frames.dispose();
  });

  it('counts a mask that cannot be decoded as no memory: players see less, never more', async () => {
    const frames = new SightFrames(() => {}, () => Promise.reject(new Error('broken')));
    const lighting = lightingFromStore(night(), MAP)!;
    frames.raster(lighting, 'data:broken', MAP, undefined, 0);
    await vi.advanceTimersByTimeAsync(0);
    const after = frames.raster(lighting, 'data:broken', MAP, undefined, 1);
    expect(after.exploredPending).toBe(false);
    expect(darkAt(after.raster, 900, 400)).toBe(true);
    frames.dispose();
  });

  it('lets no memory stand in after an edit that may have forgotten areas', async () => {
    const memories: Record<string, ExploredImage> = { 'data:a': exploredImage(MAP, (x) => x > 700), 'data:b': exploredImage(MAP, () => false) };
    const frames = new SightFrames(() => {}, async (mask) => memories[mask]!);
    const lighting = lightingFromStore(night(), MAP)!;
    frames.raster(lighting, 'data:a', MAP, undefined, 0);
    await vi.advanceTimersByTimeAsync(0);
    frames.forgetExplored();
    expect(frames.raster(lighting, 'data:b', MAP, undefined, 1).exploredPending).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    const after = frames.raster(lighting, 'data:b', MAP, undefined, 2);
    expect(after.exploredPending).toBe(false);
    expect(darkAt(after.raster, 900, 400)).toBe(true);
    frames.dispose();
  });

  it('decodes nothing while the view shows no explored memory', () => {
    const decode = vi.fn(async (): Promise<ExploredImage> => exploredImage(MAP, () => true));
    const frames = new SightFrames(() => {}, decode);
    const state = night();
    const lighting = lightingFromStore({ ...state, lighting: { ...state.lighting, exploredMemory: false } }, MAP)!;
    expect(frames.raster(lighting, 'data:a', MAP, undefined, 0).exploredPending).toBe(false);
    expect(decode).not.toHaveBeenCalled();
    frames.dispose();
  });

  it('calls back for nothing once disposed', async () => {
    const due = vi.fn();
    const frames = new SightFrames(due);
    frames.raster(lightingFromStore(walled(), MAP)!, null, MAP, undefined, 0);
    frames.raster(lightingFromStore(walled(600), MAP)!, null, MAP, undefined, 10);
    frames.dispose();
    await vi.advanceTimersByTimeAsync(DARKNESS_INTERVAL_MS);
    expect(due).not.toHaveBeenCalled();
  });
});
