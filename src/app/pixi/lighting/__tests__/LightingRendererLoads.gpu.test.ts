import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebGLRenderer } from 'pixi.js';
import { ExploredTexture } from '../ExploredTexture';
import { saveExploredMask } from '../exploredMaskSaving';
import { SIZE, SAVE_DELAY, createHarness, maskCoverageAt, resetContext, tokens, visionToken, type Harness } from './rendererHarness';

/** A memory saved elsewhere that has seen a small square around a point of the map. */
function maskSeeing(renderer: WebGLRenderer, x: number, y: number): string {
  const elsewhere = new ExploredTexture(renderer, { width: SIZE, height: SIZE });
  const corner = (dx: number, dy: number): { x: number; y: number } => ({ x: x + dx, y: y + dy });
  elsewhere.add({ polygons: [[corner(-10, -10), corner(10, -10), corner(10, 10), corner(-10, 10)]], clip: null });
  const mask = saveExploredMask(elsewhere.toCanvas());
  elsewhere.destroy();
  return mask;
}

describe('LightingRenderer explored memory loads', () => {
  let harness: Harness | null = null;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('createEl', (tag: string, options?: { attr?: Record<string, string> }): HTMLElement => {
      const el = document.createElement(tag);
      for (const [name, value] of Object.entries(options?.attr ?? {})) el.setAttribute(name, value);
      return el;
    });
  });

  afterEach(() => {
    harness?.dispose();
    harness = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('drops a load that finishes after the map switched, so the next scene keeps only its own memory', async () => {
    harness = await createHarness({ holdFirstDecode: true });
    const { lighting, change, redAt, setExploredMask, releaseFirstDecode, settle } = harness;

    lighting.beforeMapUnload();
    // Scene B has no saved mask and has seen a disc around (200, 200); scene A's mask covers everything.
    change({ mapPath: 'b.atlasmap', exploredMask: null, ...tokens(visionToken(200, 200, 5)) });
    releaseFirstDecode();
    await settle();

    expect(redAt(20, 20)).toBe(0);
    expect(redAt(200, 200)).toBe(255);
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(setExploredMask).toHaveBeenCalledTimes(1);
    const saved = setExploredMask.mock.calls[0]![0] as string;
    expect(await maskCoverageAt(saved, 20, 20)).toBe(0);
    expect(await maskCoverageAt(saved, 200, 200)).toBeGreaterThan(200);
  });

  it('never saves a texture whose saved mask failed to load, and retries on the next update', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    harness = await createHarness({ patch: tokens(visionToken(100)), failFirstDecode: true });
    const { state, change, setExploredMask, redAt, settle } = harness;
    await settle();
    expect(error).toHaveBeenCalledOnce();

    // The retry loads the saved mask, which ends the hold on saves.
    change({ objects: { ...state.objects, tokens: { t: visionToken(110) } } });
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(setExploredMask).not.toHaveBeenCalled();
    await settle();
    expect(redAt(100, 100)).toBe(255);

    change({ objects: { ...state.objects, tokens: { t: visionToken(120) } } });
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(setExploredMask).toHaveBeenCalledTimes(1);
  });

  it('says it took nothing in while the context is lost, and adds to what it holds once it is back', async () => {
    harness = await createHarness({ patch: { exploredMask: null, ...tokens(visionToken(60, 128, 5)) } });
    const { renderer, lighting, redAt, settle, tick } = harness;
    await settle();
    expect(redAt(60, 128)).toBe(255);
    expect(redAt(200, 128)).toBe(0);
    const seenElsewhere = maskSeeing(renderer, 200, 128);

    await resetContext(renderer, () => expect(lighting.takeExplored(seenElsewhere, false)).toBe(false));
    tick();
    await settle();
    expect(redAt(200, 128)).toBe(0);

    expect(lighting.takeExplored(seenElsewhere, false)).toBe(true);
    await settle();
    expect(redAt(200, 128)).toBe(255);
  });

  it('holds saves from the moment the context is lost, until the reload is done', async () => {
    harness = await createHarness({ patch: tokens(visionToken(100)) });
    const { renderer, state, change, setExploredMask, redAt, settle, tick } = harness;
    await settle();

    await resetContext(renderer, () => {
      change({ objects: { ...state.objects, tokens: { t: visionToken(120) } } });
      vi.advanceTimersByTime(SAVE_DELAY);
      expect(setExploredMask).not.toHaveBeenCalled();
    });
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(setExploredMask).not.toHaveBeenCalled();
    // The next frame starts the reload; what the moved token sees is recorded, but not saved before the mask is back.
    tick();
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(setExploredMask).not.toHaveBeenCalled();
    await settle();
    expect(redAt(100, 100)).toBe(255);
  });
});
