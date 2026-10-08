import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneLighting } from '../../../types/lightingTypes';
import type { LightingEngine } from '../engine/LightingEngine';
import { renderThroughEngine, type PixelReader } from '../engine/__tests__/gpuTestUtils';
import { SAVE_DELAY, SIZE, createHarness, tokens, until, visionToken, type Harness } from './rendererHarness';
import { LIGHTING_QUALITY, type LightingQuality } from '../../../lighting/lightingQuality';
import type { LightingWorld } from '../engine/LightingWorld';

/** A token at (100, 128) that sees 5 ft (70 px): the rest of the map is out of its sight. */
const nearSighted = tokens(visionToken(100, 128, 5));

describe('LightingRenderer scene options', () => {
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

  async function setup(lighting: Partial<SceneLighting>, patch: Record<string, unknown> = {}): Promise<Harness> {
    harness = await createHarness({ patch: { lighting: { enabled: true, ambient: 1, ...lighting }, ...patch } });
    await harness.settle();
    return harness;
  }

  function changeLighting(changes: Partial<SceneLighting>): void {
    const { state, change } = harness!;
    change({ lighting: { ...state.lighting, ...changes } });
  }

  /** The player's view of a white map, one screen pixel per world pixel. */
  function playerView(): PixelReader {
    const { lighting, renderer } = harness!;
    lighting.modeLayer.visible = true;
    const engine = (lighting as unknown as { engine: LightingEngine }).engine;
    engine.flush();
    return renderThroughEngine(engine, renderer, { size: SIZE, scale: 1, x: 0, y: 0 });
  }

  it('keeps the saved memory and never saves while explored memory is off', async () => {
    const { state, change, redAt, setExploredMask } = await setup({ exploredMemory: false }, nearSighted);
    await until(() => redAt(200, 200) > 250);
    change({ objects: { ...state.objects, tokens: { t: visionToken(120, 128, 5) } } });
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(setExploredMask).not.toHaveBeenCalled();
    expect(redAt(200, 200)).toBe(255);
  });

  it('records nothing while explored memory is off and resumes once it is back on', async () => {
    const { redAt, setExploredMask } = await setup({ exploredMemory: false }, { exploredMask: null, ...nearSighted });
    expect(redAt(100, 128)).toBe(0);
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(setExploredMask).not.toHaveBeenCalled();

    changeLighting({ exploredMemory: true });
    expect(redAt(100, 128)).toBe(255);
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(setExploredMask).toHaveBeenCalledTimes(1);
  });

  it('shows the unexplored colour instead of remembered areas while explored memory is off', async () => {
    const { redAt } = await setup({ exploredMemory: false, unexploredColor: '#336699' }, nearSighted);
    await until(() => redAt(200, 200) > 250);
    const [r, g, b] = playerView()(220, 220);
    expect(Math.abs(r - 0x33)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - 0x66)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 0x99)).toBeLessThanOrEqual(1);
  });

  it('sees everything the light shows and records nothing while token vision is off', async () => {
    const { lighting, redAt, setExploredMask } = await setup({}, { exploredMask: null, ...nearSighted });
    expect(playerView()(220, 220)[0]).toBe(0);
    lighting.modeLayer.visible = false;

    changeLighting({ tokenVision: false });
    expect(lighting.currentSight().all).toBe(true);
    expect(playerView()(220, 220)[0]).toBeGreaterThan(200);
    expect(redAt(220, 220)).toBe(0);
    vi.advanceTimersByTime(SAVE_DELAY);
    // Only what the token saw before token vision went off is saved.
    expect(setExploredMask).toHaveBeenCalledTimes(1);
  });

  it('records everything in sight as soon as the ambient light rises past the threshold', async () => {
    const { redAt } = await setup({ ambient: 0.1 }, { exploredMask: null, ...tokens(visionToken(100)) });
    expect(redAt(200, 200)).toBe(0);
    changeLighting({ ambient: 0.2 });
    expect(redAt(200, 200)).toBe(0);
    changeLighting({ ambient: 1 });
    expect(redAt(200, 200)).toBe(255);
  });

  it('records everything in sight only once the ambient light reaches the scene\'s threshold', async () => {
    const { redAt } = await setup({ ambient: 0.3, litThreshold: 0.5 }, { exploredMask: null, ...tokens(visionToken(100)) });
    expect(redAt(200, 200)).toBe(0);
    changeLighting({ litThreshold: 0.3 });
    expect(redAt(200, 200)).toBe(255);
  });

  it('draws darkvision as the scene\'s lighting says, at once and back again', async () => {
    const darkvision = { id: 't', x: 100, y: 128, vision: { enabled: true, senses: [{ id: 'darkvision', range: 60 }] } };
    const { lighting, renderer } = await setup({ ambient: 0 }, { exploredMask: null, objects: { walls: {}, lights: {}, tokens: { t: darkvision } } });
    const engine = (lighting as unknown as { engine: LightingEngine }).engine;
    lighting.modeLayer.visible = true;
    /** The players' picture of a blue-grey floor in the dark, 60 px from the token. */
    const seen = (): readonly [number, number, number] => {
      engine.flush();
      return renderThroughEngine(engine, renderer, { size: SIZE, scale: 1, x: 0, y: 0, tint: 0x6699cc, map: SIZE })(160, 128);
    };
    const chroma = (pixel: readonly number[]): number => Math.max(...pixel) - Math.min(...pixel);

    const grey = seen();
    expect(grey[1]).toBeGreaterThan(20);
    expect(chroma(grey)).toBeLessThan(12);

    changeLighting({ darkSightLook: 'colour' });
    const colour = seen();
    expect(colour[2] - colour[0]).toBeGreaterThan(20);

    changeLighting({ darkSightLook: 'grey', darkSightTint: '#40ff80' });
    const tinted = seen();
    expect(tinted[1]).toBeGreaterThan(tinted[0] + 15);

    const { state, change } = harness!;
    change({ lighting: { enabled: true, ambient: state.lighting.ambient } });
    expect(seen()).toEqual(grey);
  });

  it('follows its quality source: the world is built anew at the new quality, the memory and the sight stay', async () => {
    let current: LightingQuality = LIGHTING_QUALITY.high;
    const listeners = new Set<() => void>();
    harness = await createHarness({
      patch: { lighting: { enabled: true, ambient: 1 }, ...nearSighted },
      quality: { current: () => current, onChange: (listener) => (listeners.add(listener), () => listeners.delete(listener)) },
    });
    await harness.settle();
    const { lighting, redAt } = harness;
    const world = (): LightingWorld => (lighting as unknown as { engine: { world: LightingWorld } }).engine.world;
    const sight = lighting.currentSight();
    const remembered = redAt(200, 200);
    expect(world().cascades).not.toBeNull();
    current = LIGHTING_QUALITY.saver;
    for (const listener of listeners) listener();
    expect(world().cascades).toBeNull();
    expect(lighting.currentSight()).toBe(sight);
    expect(redAt(200, 200)).toBe(remembered);
    // The players' view is lit as before: the token's surroundings show.
    expect(playerView()(100, 128)[0]).toBeGreaterThan(200);
    lighting.destroy();
    expect(listeners.size).toBe(0);
    harness = null;
  });
});
