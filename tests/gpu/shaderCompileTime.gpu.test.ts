/// <reference types="vite/client" />
import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ENGINE_SHADERS } from '../../src/app/pixi/lighting/engine/engineShaders';
import { engineProgram } from '../../src/app/pixi/lighting/engine/gpu';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { createLiquidShader } from '../../src/app/pixi/liquids/liquidShader';

/** Compiles and links one program and waits for the driver's answer; the time that takes, and the sources' size. */
function compileMs(gl: WebGL2RenderingContext, vertex: string, fragment: string): { ms: number; linked: boolean } {
  const started = performance.now();
  const program = gl.createProgram()!;
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS) === true;
  const ms = performance.now() - started;
  gl.deleteProgram(program);
  return { ms, linked };
}

/**
 * How long the driver takes to compile each program of the lighting and the liquids, here on
 * ANGLE's Metal backend, with the fragment source's size: Direct3D's compiler on Windows is far
 * slower on large programs with loops, and a browser's graphics process that compiles for too long
 * is killed by its watchdog. Printed, nothing asserted but that every program links.
 */
describe('shader compile times (printed)', () => {
  it('compiles every engine program and the liquid program', async () => {
    const renderer = await createTestRenderer();
    const { gl } = renderer;
    const rows: { name: string; fragmentChars: number; ms: number }[] = [];
    const failed: string[] = [];
    for (const source of Object.values(ENGINE_SHADERS)) {
      const { vertex = '', fragment = '' } = engineProgram(source);
      const { ms, linked } = compileMs(gl, vertex, fragment);
      rows.push({ name: source.name, fragmentChars: fragment.length, ms: Math.round(ms * 10) / 10 });
      if (!linked) failed.push(source.name);
    }
    const liquid = createLiquidShader(Texture.WHITE);
    const { vertex, fragment } = liquid.shader.glProgram;
    const { ms, linked } = compileMs(gl, vertex, fragment);
    rows.push({ name: 'liquid (water + lava + acid)', fragmentChars: fragment.length, ms: Math.round(ms * 10) / 10 });
    if (!linked) failed.push('liquid');
    liquid.shader.destroy();
    rows.sort((a, b) => b.ms - a.ms);
    console.log(JSON.stringify({ renderer: gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), rows }, null, 1));
    expect(failed).toEqual([]);
    renderer.destroy();
  });
});
