import { afterEach, describe, expect, it, vi } from 'vitest';
import { DARKNESS_INTERVAL_MS } from '../../src/app/pixi/lighting/playerDarkness/sightFrames';
import { fixtureLighting, lightingFromStore, scene, character, wall } from '../unit/lightingFixtures';
import { fakeView, framesFor, loadMap } from './apiFakes';

const MAP = { width: 1000, height: 500 };
const walled = (heroX: number) => lightingFromStore(scene({ ambient: 1 }, {
  tokens: { hero: character('hero', heroX, 250, { vision: { enabled: true } }) },
  walls: { w: wall('w', { x: 500, y: -10 }, { x: 500, y: 510 }) },
}), MAP)!;

afterEach(() => { vi.useRealTimers(); });

describe('sight frames by view', () => {
  it('keeps one frames per view, restarted whenever the view loads a map', () => {
    const view = fakeView('v1');
    loadMap(view);
    const byView = framesFor();
    const frames = byView.of(view);
    expect(byView.of(view)).toBe(frames);
    const first = frames.raster(walled(140), null, MAP, 384, 0).raster;
    view.atlasStore.setState({ isMapLoading: true });
    expect(frames.raster(walled(800), null, MAP, 384, 10).raster).not.toBe(first);
  });

  it('closing a view ends its frames: no due call, no store subscription, new frames afterwards', async () => {
    vi.useFakeTimers();
    const view = fakeView('v1');
    loadMap(view);
    const byView = framesFor();
    const due = vi.fn();
    byView.onDue(view, due);
    const frames = byView.of(view);
    frames.raster(walled(140), null, MAP, 384, Date.now());
    frames.raster(walled(800), null, MAP, 384, Date.now() + 10);
    const restart = vi.spyOn(frames, 'restart');
    byView.close('v1');
    await vi.advanceTimersByTimeAsync(DARKNESS_INTERVAL_MS);
    view.atlasStore.setState({ isMapLoading: true });
    expect(due).not.toHaveBeenCalled();
    expect(restart).not.toHaveBeenCalled();
    expect(byView.of(view)).not.toBe(frames);
    byView.dispose();
  });

  it('keeps a raster per cell count, so callers asking for different ones get what they asked for', () => {
    const view = fakeView('v1');
    const frames = framesFor().of(view);
    const lighting = fixtureLighting({ ready: true });
    expect(frames.raster(lighting, null, MAP, 384, 0).raster.cols).toBe(125);
    expect(frames.raster(lighting, null, MAP, 16, 1).raster.cols).toBe(16);
    expect(frames.raster(lighting, null, MAP, 384, 2).raster.cols).toBe(125);
  });
});
