/// <reference types="vite/client" />
import { Container, RenderTexture, WebGLRenderer } from 'pixi.js';
import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { LiquidMesh } from '../../src/app/pixi/liquids/LiquidMesh';
import { acidGpuMs, ACID_OUT, type AcidTimer } from './liquidAcidHarness';

it('measures acid fragment cost with GPU elapsed queries at each quality', async () => {
  const renderer = new WebGLRenderer();
  await renderer.init({ width: 64, height: 64, antialias: false });
  const gl = renderer.gl as WebGL2RenderingContext;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as AcidTimer | null;
  const target = RenderTexture.create({ width: 1920, height: 1080 });
  const world = new Container();
  const mesh = new LiquidMesh({ id: 'acid-cost', kind: 'liquid', liquid: 'acid', polygon: [{ x: -1000, y: -1000 }, { x: 3000, y: -1000 }, { x: 3000, y: 2200 }, { x: -1000, y: 2200 }], colors: { surface: '#80b034', deep: '#344a1a', glint: '#b0d660' } }, 100);
  world.addChild(mesh.mesh);
  const result: Record<string, { median: number | null; samples: number[] }> = {};
  // Keep the GPU busy across the query: isolated sub-ms draws followed by polling sleeps
  // let power management change clock rates between quality levels. Report ms per draw.
  const drawsPerQuery = 16;
  try {
    for (const quality of ['high', 'balanced', 'saver']) {
      mesh.setDetail(quality === 'high' ? 2 : quality === 'balanced' ? 1 : 0);
      const render = (): void => {
        for (let draw = 0; draw < drawsPerQuery; draw++) renderer.render({ container: world, target, clear: true });
      };
      for (let k = 0; k < 20; k++) { mesh.setTime(k / 30); render(); }
      const samples: number[] = [];
      for (let k = 0; k < 31; k++) {
        mesh.setTime(2 + k / 30);
        const ms = ext ? await acidGpuMs(gl, ext, render) : null;
        if (ms !== null) samples.push(ms / drawsPerQuery);
      }
      samples.sort((a, b) => a - b);
      result[quality] = { median: samples[Math.floor(samples.length / 2)] ?? null, samples };
    }
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string : gl.getParameter(gl.RENDERER) as string;
    console.log('[acid cost]', JSON.stringify({ gpu, result }));
    await commands.writeFile(`${ACID_OUT}/${import.meta.env.VITE_ACID_CAPTURE || 'current'}-cost.json`, JSON.stringify({ gpu, width: 1920, height: 1080, cell: 100, drawsPerQuery, result }, null, 2));
    expect(Object.keys(result)).toHaveLength(3);
  } finally { mesh.destroy(); world.destroy(); target.destroy(true); renderer.destroy(); }
});
