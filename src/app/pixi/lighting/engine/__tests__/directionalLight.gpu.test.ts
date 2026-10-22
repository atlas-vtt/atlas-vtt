import { afterEach, describe, expect, it, vi } from 'vitest';
import { lightLevelAt } from '../../../../vision/lightLevels';
import { SEES_ALL, lightReach } from '../../../../vision/sight';
import type { VisionCone } from '../../../../vision/visionCone';
import { LightingEngine } from '../LightingEngine';
import { TileTracer } from '../TileTracer';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, renderThroughEngine, type PixelReader } from './gpuTestUtils';
import { watchGl } from './strictGl';

const SIZE = 256;
const MAP = 1024;
const camera = { size: SIZE, scale: SIZE / MAP, x: 0, y: 0, tint: 0x6699cc };
const bounds = { width: MAP, height: MAP };
const CENTRE = { x: 512, y: 512 };
/** A lantern in the middle of the map that shines right, 90° wide: bright to 150 px, dim to 300 px. */
const cone: VisionCone = { facing: 0, angle: Math.PI / 2, apex: 35 };
/** How wide the lantern's soft edge is past the sides of its cone, in world pixels. */
const EDGE = 24;
const lantern: EngineLight = { key: 'lantern', ...CENTRE, bright: 150, dim: 300, flame: 12, color: [1, 1, 1], intensity: 1, animation: 'none', cone, edge: EDGE };

/** Above what the lantern's bounce gives the floor behind it, far below what its light gives. */
const DARK = 16;
const luminance = ([r, g, b]: readonly number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
/** The point `distance` px from the lantern at `angle` (0 is right, positive turns down the map). */
const polar = (distance: number, angle: number): { x: number; y: number } => ({ x: CENTRE.x + Math.cos(angle) * distance, y: CENTRE.y + Math.sin(angle) * distance });

describe('a directional light in the picture', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    vi.restoreAllMocks();
  });

  async function setup(scene: Partial<EngineScene> = {}): Promise<{ engine: LightingEngine; at: () => (point: { x: number; y: number }) => readonly [number, number, number]; update: (lights: EngineLight[]) => void }> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    const watch = watchGl(renderer.gl);
    cleanup.push(() => watch.stop());
    engine.setEnabled(true);
    engine.setMode('player');
    const base: EngineScene = { bounds, albedo: null, walls: [], lights: [lantern], sight: SEES_ALL, sightRadius: 20, ambient: 0, ...scene };
    const update = (lights: EngineLight[]): void => {
      engine.update({ ...base, lights });
      engine.flush();
    };
    update([...base.lights]);
    return {
      engine,
      update,
      at: () => {
        const read: PixelReader = renderThroughEngine(engine, renderer, camera);
        // The new uniforms and the cone's pass are valid under the strict context.
        expect(watch.findings).toEqual([]);
        return (point) => read(Math.round(point.x * camera.scale), Math.round(point.y * camera.scale));
      },
    };
  }

  it('lights its cone as an all-round light lights everything, and nothing behind it', async () => {
    const { cone: _cone, ...allAround } = lantern;
    const all = (await setup({ lights: [allAround] })).at();
    const at = (await setup()).at();
    for (const distance of [80, 200, 290]) {
      at(polar(distance, 0)).forEach((channel, i) => expect(Math.abs(channel - all(polar(distance, 0))[i]!)).toBeLessThanOrEqual(3));
      at(polar(distance, 0.5)).forEach((channel, i) => expect(Math.abs(channel - all(polar(distance, 0.5))[i]!)).toBeLessThanOrEqual(3));
      expect(luminance(at(polar(distance, Math.PI)))).toBeLessThan(DARK);
      expect(luminance(at(polar(distance, Math.PI / 2)))).toBeLessThan(DARK);
      expect(luminance(all(polar(distance, Math.PI)))).toBeGreaterThan(25);
    }
  });

  it('agrees with the rule: lit inside the cone, dark outside it past the soft edge', async () => {
    const at = (await setup()).at();
    const rule = [lightReach(CENTRE, lantern.dim, [], lantern.bright, { cone })];
    let lit = 0;
    let dark = 0;
    // From 120 px: closer to the lantern its bounce off the floor shows behind it.
    for (const distance of [120, 200, 280]) {
      for (let angle = -Math.PI; angle < Math.PI; angle += Math.PI / 48) {
        const outside = Math.abs(angle) - cone.angle / 2;
        // The soft edge lies outside the cone, within its width (and a map texel and a screen pixel of filtering).
        if (outside > 0 && outside < Math.PI / 2 && distance * Math.sin(outside) < EDGE + 8) continue;
        const point = polar(distance, angle);
        const shown = luminance(at(point));
        const level = lightLevelAt(point, { ambient: 0 }, rule);
        if (level === 'dark') {
          dark++;
          expect([distance, angle.toFixed(2), shown < DARK]).toEqual([distance, angle.toFixed(2), true]);
        } else {
          lit++;
          expect([distance, angle.toFixed(2), shown > 25]).toEqual([distance, angle.toFixed(2), true]);
        }
      }
    }
    expect(lit).toBeGreaterThan(60);
    expect(dark).toBeGreaterThan(150);
  });

  it('has soft sides: past the edge of the cone the light falls off steadily, steeply at first, and is gone within the edge\'s width', async () => {
    const at = (await setup()).at();
    const edge = cone.angle / 2;
    // At 220 px from the lantern, 0 to 30 px across its edge: the edge is 24 px wide wherever it is measured.
    const steps = [0, 0.25, 0.5, 0.75, 1.25].map((share) => luminance(at(polar(220, edge + Math.asin((share * EDGE) / 220)))));
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeLessThanOrEqual(steps[i - 1]! + 1);
    expect(steps[0]!).toBeGreaterThan(25);
    expect(steps[2]!).toBeGreaterThan(4);
    expect(steps[2]!).toBeLessThan(steps[0]! - 4);
    expect(steps[4]!).toBeLessThan(DARK);
  });

  it('lights its own space all around', async () => {
    const at = (await setup()).at();
    expect(luminance(at(polar(20, Math.PI)))).toBeGreaterThan(60);
    expect(luminance(at(polar(20, Math.PI / 2)))).toBeGreaterThan(60);
    expect(luminance(at(polar(80, Math.PI)))).toBeLessThan(DARK);
  });

  it('turns without tracing its tile again', async () => {
    const trace = vi.spyOn(TileTracer.prototype, 'begin');
    const { at, update } = await setup();
    expect(trace).toHaveBeenCalledTimes(1);
    const right = at();
    expect(luminance(right(polar(200, 0)))).toBeGreaterThan(25);
    update([{ ...lantern, cone: { ...cone, facing: Math.PI } }]);
    const left = at();
    expect(luminance(left(polar(200, 0)))).toBeLessThan(DARK);
    expect(luminance(left(polar(200, Math.PI)))).toBeGreaterThan(25);
    update([{ ...lantern, cone: { ...cone, angle: Math.PI } }]);
    expect(luminance(at()(polar(200, 1.3)))).toBeGreaterThan(25);
    expect(trace).toHaveBeenCalledTimes(1);
  });

  it('stops at walls inside its cone like any light', async () => {
    const wall = { id: 'w', kind: 'wall' as const, type: 'solid' as const, p1: { x: 650, y: 300 }, p2: { x: 650, y: 724 } };
    const at = (await setup({ walls: [wall] })).at();
    expect(luminance(at({ x: 600, y: 512 }))).toBeGreaterThan(25);
    expect(at({ x: 700, y: 512 })).toEqual([0, 0, 0]);
  });
});
