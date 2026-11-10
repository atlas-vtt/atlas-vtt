import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenEntity } from '../../../types';
import type { LightZone } from '../../../types/lightingTypes';
import { lightLevelAt } from '../../../vision/lightLevels';
import type { LightingEngine } from '../engine/LightingEngine';
import { renderThroughEngine, type PixelReader } from '../engine/__tests__/gpuTestUtils';
import { playerTokenSight } from '../playerLightingLayers';
import { SIZE, createHarness, type Harness } from './rendererHarness';

const rect = (x: number, y: number, w: number, h: number): { x: number; y: number }[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
/** The right half of the 256 px map is a cave: dark by day. */
const cave: LightZone = { id: 'cave', kind: 'light-zone', polygon: rect(128, 0, 128, 256), ambient: 0 };
const luminance = ([r, g, b]: readonly number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
const viewer: TokenEntity = { id: 'viewer', kind: 'token', imagePath: 'v.png', x: 40, y: 128, vision: { enabled: true } };
const goblin = (x: number): TokenEntity => ({ id: 'goblin', kind: 'token', imagePath: 'g.png', x, y: 128 });

describe('LightingRenderer: ambient zones', () => {
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

  async function setup(objects: Record<string, unknown>): Promise<Harness> {
    // No explored memory, so the picture is what the viewer sees now.
    harness = await createHarness({ patch: { exploredMask: null, lighting: { enabled: true, ambient: 1 }, objects: { walls: {}, lights: {}, tokens: {}, ...objects } } });
    await harness.settle();
    return harness;
  }

  function playerView(): PixelReader {
    const { lighting, renderer } = harness!;
    lighting.modeLayer.visible = true;
    const engine = (lighting as unknown as { engine: LightingEngine }).engine;
    engine.flush();
    return renderThroughEngine(engine, renderer, { size: SIZE, scale: 1, x: 0, y: 0 });
  }

  it('draws a zone from the map and hands the rule the same zone: dark in the cave by day, for the picture and for who is seen', async () => {
    const { lighting, state, change } = await setup({ lightZones: { cave }, tokens: { viewer, goblin: goblin(200) } });
    const at = playerView();
    expect(luminance(at(60, 60))).toBeGreaterThan(230);
    expect(luminance(at(200, 60))).toBeLessThan(4);
    expect(lightLevelAt({ x: 200, y: 60 }, lighting.ambientLight(), lighting.lightReaches())).toBe('dark');
    expect(lightLevelAt({ x: 60, y: 60 }, lighting.ambientLight(), lighting.lightReaches())).toBe('bright');
    // The same object while nothing changes, so what was worked out from it stays good.
    expect(lighting.ambientLight()).toBe(lighting.ambientLight());
    expect(playerTokenSight(lighting, state.objects.tokens)?.('goblin')).toBe('unseen');
    change({ objects: { ...state.objects, tokens: { viewer, goblin: goblin(100) } } });
    expect(playerTokenSight(lighting, harness!.state.objects.tokens)?.('goblin')).toBe('seen');
  });

  it('follows a zone that is changed and one that is deleted, back to the scene\'s own light', async () => {
    const { lighting, state, change } = await setup({ lightZones: { cave } });
    change({ objects: { ...state.objects, lightZones: { cave: { ...cave, ambient: 1 } } } });
    expect(luminance(playerView()(200, 60))).toBeGreaterThan(230);
    change({ objects: { ...harness!.state.objects, lightZones: {} } });
    expect(luminance(playerView()(200, 60))).toBeGreaterThan(230);
    expect(lighting.ambientLight()).toBe(harness!.state.lighting);
  });
});
