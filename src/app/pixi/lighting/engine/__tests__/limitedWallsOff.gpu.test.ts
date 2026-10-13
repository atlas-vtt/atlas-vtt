import { afterEach, describe, expect, it } from 'vitest';
import { LIMITED_WALLS } from '../../../../featureFlags';
import type { MeasurementSettings } from '../../../../grid/measurementFormat';
import type { WallSegment } from '../../../../types/wallTypes';
import { SceneModelBuilder } from '../../../../vision/sceneModel';
import { LightingEngine } from '../LightingEngine';
import { createTestRenderer, renderThroughEngine } from './gpuTestUtils';
import { watchGl } from './strictGl';

const SIZE = 512;
const MAP = 1024;
const camera = { size: SIZE, scale: 0.5, x: 0, y: 0 };
const bounds = { width: MAP, height: MAP };
const FEET = { mode: 'metric', unitType: 'feet', unitDistance: 5, diagonalRule: 'equidistant', rangeBands: [] } as unknown as MeasurementSettings;

/** A room with a token and a torch west of two walls across it; `extra` is what the file says of those two walls. */
function sceneWith(extra: Partial<WallSegment>): Parameters<SceneModelBuilder['update']>[0] {
  const wall = (id: string, x1: number, y1: number, x2: number, y2: number, more: Partial<WallSegment> = {}): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...more });
  const walls = [
    wall('n', 100, 100, 900, 100), wall('e', 900, 100, 900, 900), wall('s', 900, 900, 100, 900), wall('w', 100, 900, 100, 100),
    wall('first', 400, 100, 400, 700, extra), wall('second', 600, 106, 600, 900, extra),
  ];
  return {
    objects: {
      walls: Object.fromEntries(walls.map((w) => [w.id, w])),
      lights: { torch: { id: 'torch', kind: 'light', x: 250, y: 500, emission: { bright: 60, dim: 120, color: '#ffd9a0', intensity: 1, animation: 'none' } } },
      tokens: { v: { id: 'v', kind: 'token', imagePath: 'v.png', x: 200, y: 400, size: 1, vision: { enabled: true } } },
    },
    lighting: { enabled: true, ambient: 0.1 }, grid: null, heldTokens: {},
  } as unknown as Parameters<SceneModelBuilder['update']>[0];
}

describe('limited walls switched off (the release), in the picture', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  it('draws a scene with limited walls pixel for pixel as the same scene with solid walls, with one wall field and no pass of its own', async () => {
    expect(LIMITED_WALLS).toBe(false);
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const watch = watchGl(renderer.gl);
    cleanup.push(() => watch.stop());
    const picture = (extra: Partial<WallSegment>, mode: 'player' | 'gm'): { pixels: number[]; fields: number } => {
      const engine = new LightingEngine(renderer);
      try {
        engine.setEnabled(true);
        engine.setMode(mode);
        const { model } = new SceneModelBuilder().update(sceneWith(extra), bounds, () => FEET);
        const lights = model.lights.map((light) => ({ ...light, animation: 'none' as const }));
        engine.update({ bounds, albedo: null, walls: model.walls, lights, sight: model.sight, sightRadius: 31, ambient: 0.1 });
        engine.flush();
        const read = renderThroughEngine(engine, renderer, camera);
        const pixels: number[] = [];
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) pixels.push(...read(x, y));
        return { pixels, fields: (engine as unknown as { world: { fields: { held: number } } }).world.fields.held };
      } finally {
        engine.destroy();
      }
    };
    for (const mode of ['player', 'gm'] as const) {
      const limited = picture({ limited: true }, mode), solid = picture({}, mode);
      // The picture shows something: lit floor west of the first wall, dark east of it in the players' view.
      expect(limited.pixels.filter((value) => value > 60).length).toBeGreaterThan(20_000);
      let differing = 0;
      for (let i = 0; i < solid.pixels.length; i++) if (limited.pixels[i] !== solid.pixels[i]) differing++;
      expect([mode, differing]).toEqual([mode, 0]);
      expect([mode, limited.fields]).toEqual([mode, 1]);
    }
    expect(watch.findings).toEqual([]);
  });
});
