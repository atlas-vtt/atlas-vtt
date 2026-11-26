import { Container, RenderTexture, WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { MEASURE_EFFECTS, MEASURE_EFFECT_STARTS, type MeasureEffect } from '../../src/app/measure/measureEffects';
import { MeasureEffectMesh } from '../../src/app/pixi/measure/effects/MeasureEffectMesh';
import { effectShape, gpuMs } from './measureEffectsHarness';

/**
 * What a frame of area effects costs on the graphics card: eight animated circles six cells
 * across in a 1440 × 900 picture, at 56 screen pixels a cell so that all eight fit (they cover
 * about half of it), drawn alone. All eight of one look, and a mix of all six, at each quality.
 * Printed, not held to a budget: CI has no graphics card. Queries time batches of draws, since a
 * single draw of well under a millisecond is lost in the timer's own noise.
 */

const WIDTH = 1440;
const HEIGHT = 900;
const CELL = 56;
const DRAWS_PER_QUERY = 8;
const QUALITIES = [['high', 2], ['balanced', 1], ['saver', 0]] as const;

const median = (samples: number[]): number | null => (samples.length ? [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)]! : null);

describe('the cost of a frame of area effects', () => {
  it('prints the graphics card time of eight animated areas at each quality', async () => {
    const renderer = new WebGLRenderer();
    await renderer.init({ width: 64, height: 64, antialias: false });
    const target = RenderTexture.create({ width: WIDTH, height: HEIGHT, antialias: false });
    const lines: string[] = [];
    const sets: [string, readonly MeasureEffect[]][] = [...MEASURE_EFFECTS.map((effect): [string, MeasureEffect[]] => [effect, [effect]]), ['all six mixed', MEASURE_EFFECTS]];
    for (const [name, effects] of sets) {
      const world = new Container();
      const meshes = Array.from({ length: 8 }, (_, index) => {
        const effect = effects[index % effects.length]!;
        const shape = effectShape('circle', CELL, { x: 180 + (index % 4) * 360, y: 225 + Math.floor(index / 4) * 450 }, 6);
        const mesh = new MeasureEffectMesh({ rings: shape.rings, origin: shape.origin, effect, color: MEASURE_EFFECT_STARTS[effect].color, detail: 2, cell: CELL, seed: `cost-${index}` });
        world.addChild(mesh.view);
        return mesh;
      });
      const times: string[] = [];
      for (const [quality, detail] of QUALITIES) {
        for (const mesh of meshes) mesh.update({ detail });
        const draw = (): void => {
          for (let k = 0; k < DRAWS_PER_QUERY; k++) renderer.render({ container: world, target, clear: true });
        };
        for (let warm = 0; warm < 4; warm++) draw();
        const samples: number[] = [];
        for (let sample = 0; sample < 15; sample++) {
          for (const mesh of meshes) mesh.setTime(20 + sample / 30);
          const ms = await gpuMs(renderer, draw);
          if (ms !== null) samples.push(ms / DRAWS_PER_QUERY);
        }
        const middle = median(samples);
        times.push(`${quality} ${middle === null ? 'no timer' : `${middle.toFixed(3)} ms`}`);
      }
      lines.push(`${name}: ${times.join(', ')}`);
      for (const mesh of meshes) mesh.destroy();
      world.destroy();
    }
    const gl = renderer.gl;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = debug ? (gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string) : 'unknown';
    console.log(`[effects] eight areas six cells across at ${WIDTH}x${HEIGHT}, ${CELL} px a cell (${gpu}):\n${lines.join('\n')}`);
    target.destroy(true);
    renderer.destroy();
    expect(lines).toHaveLength(sets.length);
  });
});
