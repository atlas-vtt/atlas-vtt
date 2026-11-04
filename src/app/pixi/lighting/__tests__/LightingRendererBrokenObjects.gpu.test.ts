import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenEntity } from '../../../types';
import type { LightingEngine } from '../engine/LightingEngine';
import { renderThroughEngine } from '../engine/__tests__/gpuTestUtils';
import { SIZE, createHarness, type Harness } from './rendererHarness';

const luminance = ([r, g, b]: readonly number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
const torch = { bright: 8, dim: 16, color: '#ffffff', intensity: 1, animation: 'none' };
const viewer: TokenEntity = { id: 'viewer', kind: 'token', imagePath: 'v.png', x: 40, y: 128, vision: { enabled: true } };

/** What a damaged or foreign map file can hold where lights, walls and a carried light belong. */
const BROKEN = {
  lights: {
    good: { id: 'good', kind: 'light', x: 70, y: 128, emission: torch },
    bare: { id: 'bare', kind: 'light', x: 100, y: 100 },
    empty: { id: 'empty', kind: 'light', x: 100, y: 100, emission: null },
    text: { id: 'text', kind: 'light', x: 100, y: 100, emission: 'torch' },
    radii: { id: 'radii', kind: 'light', x: 100, y: 100, emission: { ...torch, bright: 'far', dim: null } },
    nowhere: { id: 'nowhere', kind: 'light', x: 'left', emission: torch },
    word: 'a light',
    nothing: null,
  },
  walls: {
    good: { id: 'good', kind: 'wall', type: 'solid', p1: { x: 128, y: 0 }, p2: { x: 128, y: 256 } },
    endless: { id: 'endless', kind: 'wall', type: 'solid' },
    half: { id: 'half', kind: 'wall', type: 'solid', p1: { x: 10, y: 10 } },
    words: { id: 'words', kind: 'wall', type: 'solid', p1: 'here', p2: 'there' },
    lost: { id: 'lost', kind: 'wall', type: 'door', p1: { x: Number.NaN, y: 0 }, p2: { x: 50, y: Infinity } },
    word: 'a wall',
    nothing: null,
  },
  tokens: {
    viewer,
    carrier: { id: 'carrier', kind: 'token', imagePath: 'c.png', x: 60, y: 60, light: 'torch' },
    lantern: { id: 'lantern', kind: 'token', imagePath: 'l.png', x: 60, y: 200, light: { bright: 'much' } },
  },
};

describe('LightingRenderer: objects it cannot read', () => {
  let harness: Harness | null = null;

  beforeEach(() => {
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
  });

  afterEach(() => {
    harness?.dispose();
    harness = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('builds and draws the scene with what it can read, and does not stop for the rest', async () => {
    const errors = vi.spyOn(console, 'error');
    // No explored memory, so the picture is what the viewer sees now.
    harness = await createHarness({ patch: { exploredMask: null, lighting: { enabled: true, ambient: 0 }, objects: BROKEN as never } });
    await harness.settle();
    const { lighting, renderer } = harness;
    const engine = (lighting as unknown as { engine: LightingEngine }).engine;
    expect(engine.failed).toBe(false);
    lighting.modeLayer.visible = true;
    engine.flush();
    const at = renderThroughEngine(engine, renderer, { size: SIZE, scale: 1, x: 0, y: 0 });
    // The good torch lights the viewer's side of the good wall, and nothing beyond it.
    expect(luminance(at(70, 120))).toBeGreaterThan(60);
    expect(luminance(at(140, 128))).toBeLessThan(4);
    expect(lighting.lightReaches()).toHaveLength(1);
    expect(engine.failed).toBe(false);
    // Nothing was reported about the lighting.
    expect(errors.mock.calls.filter(([message]) => String(message).includes('lighting'))).toEqual([]);
    // And goes on working: a change to the store is drawn.
    harness.change({ objects: { ...harness.state.objects, lights: { ...BROKEN.lights, good: { ...BROKEN.lights.good, x: 90 } } } as never });
    expect(engine.failed).toBe(false);
    expect(lighting.lightReaches()[0]!.origin.x).toBe(90);
  });
});
