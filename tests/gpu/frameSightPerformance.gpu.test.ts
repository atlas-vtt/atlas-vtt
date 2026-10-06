import { Container, Matrix, RenderTexture, Sprite, Texture } from 'pixi.js';
import { expect, it } from 'vitest';
import { LightingEngine } from '../../src/app/pixi/lighting/engine/LightingEngine';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { computeSight } from '../../src/app/vision/sight';

function summary(values: number[]): { median: number; p95: number; max: number } {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)]!, p95: sorted[Math.ceil(sorted.length * 0.95) - 1]!, max: sorted[sorted.length - 1]! };
}

it('measures an unchanged GM and player frame pair with separate sight meshes', async (ctx) => {
  const size = 512;
  const renderer = await createTestRenderer(size);
  const engine = new LightingEngine(renderer);
  const stage = new Container();
  const target = RenderTexture.create({ width: size, height: size });
  try {
    const gl = renderer.gl;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    const ext: unknown = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext || typeof ext !== 'object' || !('TIME_ELAPSED_EXT' in ext) || typeof ext.TIME_ELAPSED_EXT !== 'number'
      || !('GPU_DISJOINT_EXT' in ext) || typeof ext.GPU_DISJOINT_EXT !== 'number' || gpu.includes('SwiftShader')) {
      ctx.skip('A hardware GPU timer is required for this measurement');
      return;
    }
    const floor = stage.addChild(new Sprite(Texture.WHITE));
    floor.setSize(size, size);
    floor.tint = 0x6699cc;
    stage.addChild(engine.layer);
    const sources = Array.from({ length: 6 }, (_, i) => ({ tokenId: `t${i}`, origin: { x: 100 + i * 50, y: 250 }, range: 150, senses: [] }));
    const sight = computeSight(sources, []);
    const playerSight = { all: false, regions: sight.regions.slice(0, 3) };
    engine.setEnabled(true);
    engine.setView(new Matrix(), 1);
    engine.update({ bounds: { width: size, height: size }, albedo: null, walls: [],
      lights: [{ key: 'lamp', x: 250, y: 250, bright: 100, dim: 200, flame: 3, color: [1, 1, 1], intensity: 1, animation: 'none' }],
      sight, playerSight, sightRadius: 20, ambient: 0.3,
    });
    engine.flush();
    const pair = (): void => {
      for (const mode of ['gm', 'player'] as const) {
        engine.setMode(mode);
        renderer.render({ container: stage, target, clear: true });
      }
    };
    for (let warm = 0; warm < 5; warm++) pair();
    const cpu: number[] = [], gpuTimes: number[] = [];
    for (let sample = 0; sample < 30; sample++) {
      gl.getParameter(ext.GPU_DISJOINT_EXT);
      const query = gl.createQuery();
      if (!query) throw new Error('Unable to create a GPU timer query');
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      const start = performance.now();
      pair();
      const cpuMs = performance.now() - start;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) await new Promise(resolve => setTimeout(resolve, 5));
      const result: unknown = gl.getQueryParameter(query, gl.QUERY_RESULT);
      gl.deleteQuery(query);
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) continue;
      if (typeof result !== 'number') throw new Error('Invalid GPU timer result');
      cpu.push(cpuMs);
      gpuTimes.push(result / 1e6);
    }
    expect(gpuTimes.length).toBeGreaterThan(0);
    const figures = { gpu, size, sources: 6, samples: gpuTimes.length, cpu: summary(cpu), gpuMs: summary(gpuTimes) };
    await ctx.annotate(JSON.stringify(figures), 'performance');
    console.info(`frame sight performance: ${JSON.stringify(figures)}`);
  } finally {
    stage.removeChild(engine.layer);
    engine.destroy();
    stage.destroy({ children: true });
    target.destroy(true);
    renderer.destroy();
  }
});
