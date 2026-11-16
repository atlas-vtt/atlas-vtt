import { Container, RenderTexture, WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LiquidMesh } from '../../src/app/pixi/liquids/LiquidMesh';
import type { LiquidKind } from '../../src/app/types/liquidTypes';

/**
 * What a frame of liquids costs on the graphics card: one surface covering a 1920 × 1080 picture
 * whole, the worst a view can show, at 100 screen pixels a cell (all detail shown) and 30 (most of
 * it faded). Printed, not held to a budget: CI has no graphics card.
 */

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

async function gpuMs(gl: WebGL2RenderingContext, ext: TimerExt, work: () => void): Promise<number | null> {
  gl.getParameter(ext.GPU_DISJOINT_EXT);
  const query = gl.createQuery()!;
  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  work();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) await new Promise((resolve) => setTimeout(resolve, 4));
  const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
  gl.deleteQuery(query);
  return gl.getParameter(ext.GPU_DISJOINT_EXT) ? null : ns / 1e6;
}

const WIDTH = 1920;
const HEIGHT = 1080;
const CELL = 100;

describe('the cost of a frame of liquids', () => {
  it('prints the graphics card time of a picture full of each liquid', async () => {
    const renderer = new WebGLRenderer();
    await renderer.init({ width: 64, height: 64, antialias: false });
    const gl = renderer.gl as WebGL2RenderingContext;
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
    const target = RenderTexture.create({ width: WIDTH, height: HEIGHT, antialias: false });
    const lines: string[] = [];
    for (const liquid of ['water', 'lava', 'acid'] as LiquidKind[]) {
      for (const pixelsPerCell of [100, 30]) {
        const zoom = pixelsPerCell / CELL;
        // A lake larger than the picture, so every pixel lies a few cells from the shore and more.
        const half = { x: WIDTH / zoom, y: HEIGHT / zoom };
        const polygon = [{ x: -half.x, y: -half.y }, { x: half.x, y: -half.y }, { x: half.x, y: half.y }, { x: -half.x, y: half.y }];
        const mesh = new LiquidMesh({ id: liquid, kind: 'liquid', liquid, polygon, colors: { surface: '#e0531b', deep: '#2a1612', glint: '#ffd27a' }, flow: { x: 1, y: 0 } }, CELL);
        const world = new Container();
        world.addChild(mesh.mesh);
        world.scale.set(zoom);
        world.position.set(WIDTH / 2, HEIGHT / 2);
        const render = (): void => renderer.render({ container: world, target, clear: true });
        for (let i = 0; i < 5; i++) render();
        const samples: number[] = [];
        for (let i = 0; i < 7; i++) {
          mesh.setTime(i);
          const ms = ext ? await gpuMs(gl, ext, render) : null;
          if (ms !== null) samples.push(ms);
        }
        samples.sort((a, b) => a - b);
        lines.push(`${liquid} at ${pixelsPerCell} px a cell: ${samples.length ? `${samples[Math.floor(samples.length / 2)]!.toFixed(2)} ms` : 'no timer'}`);
        world.destroy();
        mesh.destroy();
      }
    }
    console.log(`[liquids] ${WIDTH}x${HEIGHT} full of liquid:\n${lines.join('\n')}`);
    target.destroy(true);
    renderer.destroy();
    expect(lines).toHaveLength(6);
  });
});
